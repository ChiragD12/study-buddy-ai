import {
  AINotConfiguredError,
  type AIGenerateOptions,
  type AICompletion,
  type AIGroundedResult,
  type AIMessage,
  type AIProvider,
  type AITool,
} from "@/ai/types";
import { getGeminiKey } from "@/ai/providers/keyStore";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name?: string; response?: unknown };
  /**
   * Opaque reasoning-state token. Lives on the Part itself, as a sibling of
   * functionCall/text — NOT nested inside functionCall. Wire field name is
   * camelCase (thoughtSignature), consistent with the surrounding fields.
   * Must be echoed back exactly as received.
   */
  thoughtSignature?: string;
}
interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  groundingMetadata?: { groundingChunks?: GeminiGroundingChunk[] };
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

function toContents(messages: AIMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      // If this model turn came straight from Gemini, replay its exact
      // original Parts verbatim. This is the only way to guarantee
      // thoughtSignature (and any other Gemini-3 Part-level metadata, e.g.
      // a standalone "thought" part that isn't attached to the functionCall
      // part at all) survives — our generic AIToolCall shape can't model
      // every field Gemini's wire format carries, so reconstructing from it
      // is inherently lossy. Never decode, re-encode, reorder, or merge
      // these parts — pass them through unchanged.
      if (Array.isArray(message.providerRawParts) && message.providerRawParts.length) {
        return {
          role: message.role === "assistant" ? "model" : "user",
          parts: message.providerRawParts,
        };
      }

      const parts: Record<string, unknown>[] = [];

      // Text and tool calls are not mutually exclusive on a real Gemini turn
      // (a model turn can carry reasoning text alongside a functionCall) —
      // preserve both instead of dropping text whenever calls are present.
      if (message.content) {
        parts.push({ text: message.content });
      }

      // Images/PDFs go to Gemini as inline binary parts. Text attachments
      // are already folded into `message.content` before this point (see
      // features/assistant/attachments.ts), so they never appear here.
      if (message.attachments?.length) {
        for (const attachment of message.attachments) {
          parts.push({
            inlineData: { mimeType: attachment.mimeType, data: attachment.data },
          });
        }
      }

      if (message.toolCalls?.length) {
        for (const call of message.toolCalls) {
          const thoughtSignature = call.providerMetadata?.["thoughtSignature"];
          parts.push({
            functionCall: {
              name: call.name,
              args: call.args,
              // Only echo an id if Gemini actually issued one for this call.
              // Never fabricate one — an invented id is not what Gemini sent
              // and must not be replayed as though it were.
              ...(call.providerCallId ? { id: call.providerCallId } : {}),
            },
            ...(typeof thoughtSignature === "string" ? { thoughtSignature } : {}),
          });
        }
      } else if (message.toolResults?.length) {
        for (const result of message.toolResults) {
          parts.push({
            functionResponse: {
              name: result.name,
              response: { result: result.result },
              // Same rule as functionCall.id above: only present when the
              // originating call actually had a real provider id.
              ...(result.providerCallId ? { id: result.providerCallId } : {}),
            },
          });
        }
      }

      // Every content entry needs at least one part.
      if (parts.length === 0) parts.push({ text: "" });

      return {
        role: message.role === "assistant" ? "model" : "user",
        parts,
      };
    });
}

function extractText(payload: GeminiResponse): string {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
}

function extractGroundingSources(payload: GeminiResponse): { uri: string; title?: string }[] {
  const seen = new Set<string>();
  const sources: { uri: string; title?: string }[] = [];
  for (const candidate of payload.candidates ?? []) {
    for (const chunk of candidate.groundingMetadata?.groundingChunks ?? []) {
      const uri = chunk.web?.uri;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({ uri, ...(chunk.web?.title ? { title: chunk.web.title } : {}) });
    }
  }
  return sources;
}

/**
 * Builds AIToolCall entries from a flat list of Gemini Parts. `index` is the
 * position within *that list*, so callers that assemble `parts` themselves
 * (e.g. streaming, where functionCall parts are collected across multiple
 * SSE chunks into one array) must pass the full accumulated list here —
 * never call this per-chunk, or parallel calls sharing a chunk-local index
 * of 0 would collide on the same internalId.
 */
function toolCallsFromParts(parts: GeminiPart[]) {
  return parts.flatMap((part, index) => {
    const call = part.functionCall;
    if (!call?.name) return [];
    return [
      {
        // Local bookkeeping ID only — used to correlate this call with its
        // AIToolResult inside this app. Never sent to Gemini.
        internalId: `${call.name}-${index}`,
        // Only set when Gemini actually returned an id (normally just for
        // parallel calls). Never fabricated — absence is preserved as
        // absence, not papered over with a synthetic value.
        ...(call.id ? { providerCallId: call.id } : {}),
        name: call.name,
        args: call.args ?? {},
        // thoughtSignature lives on the Part, alongside functionCall —
        // not inside it. Preserved opaquely and replayed as-is in
        // toContents(); never read or interpreted here.
        ...(part.thoughtSignature
          ? { providerMetadata: { thoughtSignature: part.thoughtSignature } }
          : {}),
      },
    ];
  });
}

function safeErrorMessage(message: string): string {
  const key = getGeminiKey();
  return key ? message.split(key).join("[redacted]") : message;
}

function containsSchemaKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsSchemaKey(item, key));
  return Object.entries(value).some(
    ([entryKey, entryValue]) => entryKey === key || containsSchemaKey(entryValue, key),
  );
}

function assertGeminiToolSchemas(tools: AITool[]): void {
  if (tools.some((tool) => containsSchemaKey(tool.parameters, "additionalProperties"))) {
    throw new Error("Gemini tool schema contains unsupported additionalProperties.");
  }
}

/**
 * Direct browser -> Gemini implementation. No proxy, no backend, no key
 * leaving the device other than to Google.
 */
export function createGeminiProvider(model: string): AIProvider {
  function requireKey(): string {
    const key = getGeminiKey();
    if (!key) throw new AINotConfiguredError("Add your Gemini API key in Settings → AI / Gemini.");
    return key;
  }

  async function call(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    return fetch(`${BASE_URL}/${model}:${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": requireKey() },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }

  function buildBody(messages: AIMessage[], options?: AIGenerateOptions) {
    const system = options?.system ?? messages.find((m) => m.role === "system")?.content;
    return {
      contents: toContents(messages),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options?.responseSchema
          ? { responseMimeType: "application/json", responseSchema: options.responseSchema }
          : {}),
      },
    };
  }

  function buildToolBody(messages: AIMessage[], tools: AITool[]) {
    assertGeminiToolSchemas(tools);
    const system = messages.find((m) => m.role === "system")?.content;
    return {
      contents: toContents(messages),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      tools: [
        {
          functionDeclarations: tools.map(({ name, description, parameters }) => ({
            name,
            description,
            parameters,
          })),
        },
      ],
    };
  }

  return {
    id: "gemini",
    label: "Google Gemini",
    async status() {
      const key = getGeminiKey();
      return {
        configured: Boolean(key),
        providerId: "gemini",
        model,
        ...(key ? {} : { message: "No API key configured." }),
      };
    },
    async testConnection() {
      try {
        const response = await call("generateContent", {
          contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
        });
        const payload = (await response.json()) as GeminiResponse;
        if (!response.ok) {
          return {
            ok: false,
            message: `Connection failed for ${model} — ${safeErrorMessage(
              payload.error?.message ?? `HTTP ${response.status}`,
            )}`,
          };
        }
        return { ok: true, message: `Connected to ${model}.` };
      } catch (error) {
        return {
          ok: false,
          message: `Connection failed for ${model} — ${safeErrorMessage(
            error instanceof Error ? error.message : "Request failed.",
          )}`,
        };
      }
    },
    async generate(messages, options) {
      const response = await call("generateContent", buildBody(messages, options), options?.signal);
      const payload = (await response.json()) as GeminiResponse;
      if (!response.ok) {
        throw new Error(
          safeErrorMessage(payload.error?.message ?? `Gemini error ${response.status}`),
        );
      }
      return extractText(payload);
    },
    /**
     * One Gemini generation per turn — always issued against the SSE
     * endpoint so that whichever kind of turn this is, it costs exactly one
     * request:
     *  - a tool-calling turn: functionCall parts accumulate as they arrive
     *    (they come whole within a chunk, never fragmented) and are
     *    returned as `toolCalls`; `onTextDelta` is never invoked for this
     *    turn.
     *  - the final natural-language turn: text parts stream in as
     *    `onTextDelta` is called live, chunk by chunk, as Gemini emits
     *    them — no second "real" generation is issued to re-derive text
     *    that was already produced once.
     * A turn is only known to be tool-free once its stream ends without
     * ever producing a functionCall part, so `onTextDelta` is gated on
     * "no functionCall seen yet in this turn" rather than decided upfront.
     */
    async generateWithTools(messages, tools, options): Promise<AICompletion> {
      const response = await call(
        "streamGenerateContent?alt=sse",
        buildToolBody(messages, tools),
        options?.signal,
      );
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
        throw new Error(
          safeErrorMessage(payload.error?.message ?? `Gemini error ${response.status}`),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let sawFunctionCall = false;
      const functionParts: GeminiPart[] = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;

            let payload: GeminiResponse;
            try {
              payload = JSON.parse(data) as GeminiResponse;
            } catch {
              continue; // Ignore partial/malformed SSE frames.
            }
            if (payload.error) {
              throw new Error(safeErrorMessage(payload.error.message ?? "Gemini stream error"));
            }

            const parts = (payload.candidates ?? []).flatMap(
              (candidate) => candidate.content?.parts ?? [],
            );
            for (const part of parts) {
              if (part.functionCall) {
                functionParts.push(part);
                sawFunctionCall = true;
              }
            }
            const chunkText = parts.map((part) => part.text ?? "").join("");
            if (chunkText) {
              text += chunkText;
              // Only stream live once we're confident this turn isn't
              // going to resolve into a tool call — any text seen before
              // a functionCall shows up later in the same turn simply
              // never reaches the UI callback.
              if (!sawFunctionCall) options?.onTextDelta?.(chunkText);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const toolCalls = toolCallsFromParts(functionParts);
      return {
        text,
        toolCalls,
        // Only needed (and only present) when this turn included a tool
        // call — plain text turns have nothing Gemini requires us to echo
        // back, and toContents() falls back to plain text reconstruction.
        ...(toolCalls.length
          ? { providerRawParts: [...(text ? [{ text }] : []), ...functionParts] }
          : {}),
      };
    },
    async groundedGenerate(prompt, options): Promise<AIGroundedResult> {
      const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(options?.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
        // Google Search grounding — a built-in Gemini capability, not a
        // second search backend. Cannot be combined with function-calling
        // `tools` in the same request, so this is always its own call.
        tools: [{ google_search: {} }],
      };
      const response = await call("generateContent", body);
      const payload = (await response.json()) as GeminiResponse;
      if (!response.ok) {
        throw new Error(
          safeErrorMessage(payload.error?.message ?? `Gemini error ${response.status}`),
        );
      }
      return { text: extractText(payload), sources: extractGroundingSources(payload) };
    },
    async *stream(messages, options) {
      const response = await call(
        "streamGenerateContent?alt=sse",
        buildBody(messages, options),
        options?.signal,
      );
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
        throw new Error(
          safeErrorMessage(payload.error?.message ?? `Gemini error ${response.status}`),
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const delta = extractText(JSON.parse(data) as GeminiResponse);
            if (delta) yield { delta };
          } catch {
            // Ignore partial SSE frames.
          }
        }
      }
    },
  };
}
