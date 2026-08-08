/**
 * Provider-agnostic AI interfaces. Feature code depends on these types only;
 * swapping Gemini for another provider must not require UI changes.
 */

export interface AIMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: AIToolCall[];
  toolResults?: AIToolResult[];
}

export interface AIToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AIToolResult {
  callId: string;
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
}

export interface AICompletion {
  text: string;
  toolCalls: AIToolCall[];
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
