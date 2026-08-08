import {
  AINotConfiguredError,
  type AIGenerateOptions,
  type AICompletion,
  type AIMessage,
  type AIProvider,
  type AITool,
} from "@/ai/types";
import { getGeminiKey } from "@/ai/providers/keyStore";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name?: string; response?: unknown };
}
interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}
interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

function toContents(messages: AIMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: message.toolCalls?.length
        ? message.toolCalls.map((call) => ({
            functionCall: { id: call.id, name: call.name, args: call.args },
          }))
        : message.toolResults?.length
          ? message.toolResults.map((result) => ({
              functionResponse: {
                id: result.callId,
                name: result.name,
                response: { result: result.result },
              },
            }))
          : [{ text: message.content }],
    }));
}

function extractText(payload: GeminiResponse): string {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
}

function extractToolCalls(payload: GeminiResponse) {
  return (payload.candidates ?? []).flatMap((candidate) =>
    (candidate.content?.parts ?? []).flatMap((part, index) => {
      const call = part.functionCall;
      return call?.name
        ? [{ id: call.id ?? `${call.name}-${index}`, name: call.name, args: call.args ?? {} }]
        : [];
    }),
  );
}

function safeErrorMessage(message: string): string {
  const key = getGeminiKey();
  return key ? message.split(key).join("[redacted]") : message;
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
    async generateWithTools(messages, tools): Promise<AICompletion> {
      const response = await call("generateContent", buildToolBody(messages, tools));
      const payload = (await response.json()) as GeminiResponse;
      if (!response.ok)
        throw new Error(
          safeErrorMessage(payload.error?.message ?? `Gemini error ${response.status}`),
        );
      return { text: extractText(payload), toolCalls: extractToolCalls(payload) };
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
