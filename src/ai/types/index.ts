/**
 * Provider-agnostic AI interfaces. Feature code depends on these types only;
 * swapping Gemini for another provider must not require UI changes.
 */

export interface AIMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: AIToolCall[];
  toolResults?: AIToolResult[];
  /**
   * Opaque, provider-specific raw representation of this turn's original
   * response content (e.g. Gemini's exact `candidate.content.parts` array),
   * when the provider returned one. The generic AIToolCall/AIToolResult
   * shape can't model everything a provider's wire format carries (e.g.
   * Gemini 3 standalone "thought" parts). When present, the owning provider
   * MUST replay this verbatim on the next request instead of reconstructing
   * content from toolCalls, so nothing the provider requires gets dropped.
   * Never read or interpreted outside the owning provider.
   */
  providerRawParts?: unknown;
}

export interface AIToolCall {
  /**
   * Locally generated correlation ID for application bookkeeping only
   * (matching this call to its AIToolResult). Never serialized onto the
   * provider wire protocol.
   */
  internalId: string;
  /**
   * The exact call ID the provider returned for this call, if any (e.g.
   * Gemini's `functionCall.id`, normally only present for parallel calls).
   * Present only when the provider actually supplied one — never fabricated.
   * Providers must echo this back verbatim on the follow-up request instead
   * of inventing a value.
   */
  providerCallId?: string;
  name: string;
  args: Record<string, unknown>;
  /**
   * Opaque, provider-specific data that must be replayed verbatim alongside
   * this call on the next request (e.g. Gemini's `thoughtSignature`).
   * Never read or interpreted outside the owning provider.
   */
  providerMetadata?: Record<string, unknown>;
}

export interface AIToolResult {
  /** Matches the originating AIToolCall.internalId. Bookkeeping only. */
  internalId: string;
  /** Matches the originating AIToolCall.providerCallId, when present. */
  providerCallId?: string;
  name: string;
  result: unknown;
}

export interface AIGenerateOptions {
  system?: string;
  temperature?: number;
  /** JSON schema for structured output, when the provider supports it. */
  responseSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AIStreamChunk {
  delta: string;
}

export interface AIProviderStatus {
  configured: boolean;
  providerId: string;
  model?: string;
  message?: string;
}

export interface AIGroundedResult {
  text: string;
  /** Source URLs/titles the model actually cited, if the provider exposes them. Empty when unavailable. */
  sources: { uri: string; title?: string }[];
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  status(): Promise<AIProviderStatus>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  generate(messages: AIMessage[], options?: AIGenerateOptions): Promise<string>;
  generateWithTools(messages: AIMessage[], tools: AITool[]): Promise<AICompletion>;
  stream(
    messages: AIMessage[],
    options?: AIGenerateOptions,
  ): AsyncGenerator<AIStreamChunk, void, unknown>;
  /**
   * Generate text grounded in a live web search, when the provider supports
   * it (Gemini's built-in Google Search grounding tool). This is the only
   * sanctioned way for the app to check a claim against "wider internet
   * information" — there is no separate web-search backend/API. Optional:
   * callers must check for its presence and fail gracefully when absent.
   * Cannot be combined with generateWithTools' function-calling tools in
   * the same request (the underlying API treats them as alternatives).
   */
  groundedGenerate?(prompt: string, options?: { system?: string }): Promise<AIGroundedResult>;
}

export interface AICompletion {
  text: string;
  toolCalls: AIToolCall[];
  /** See AIMessage.providerRawParts — carried through so the orchestrator can attach it to the resulting modelMessage. */
  providerRawParts?: unknown;
}

export class AINotConfiguredError extends Error {
  constructor(message = "No AI provider is configured.") {
    super(message);
    this.name = "AINotConfiguredError";
  }
}

/**
 * Tool contract for the future assistant orchestrator.
 *
 * Privacy rule: a tool receives only the arguments it declares. Tools must
 * never read or forward the whole local database.
 */
export interface AITool<Args = unknown, Result = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  mutates?: boolean;
  execute(args: Args): Promise<Result>;
}
