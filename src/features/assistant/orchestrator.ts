import { localTools } from "@/ai/tools/localTools";
import { toolRegistry } from "@/ai/tools/registry";
import type {
  AIMessage,
  AIProvider,
  AIToolCall,
  AIToolGenerateOptions,
  AIToolResult,
} from "@/ai/types";

export interface PendingToolAction {
  calls: AIToolCall[];
  history: AIMessage[];
}

export type ToolActivity = (toolNames: string[]) => void;

function resultsFor(calls: AIToolCall[]): Promise<AIToolResult[]> {
  return Promise.all(
    calls.map(async (call) => {
      const base = {
        internalId: call.internalId,
        ...(call.providerCallId ? { providerCallId: call.providerCallId } : {}),
        name: call.name,
      };
      try {
        return { ...base, result: await toolRegistry.execute(call.name, call.args) };
      } catch (error) {
        return {
          ...base,
          result: { error: error instanceof Error ? error.message : "The action failed." },
        };
      }
    }),
  );
}

export interface RunAssistantToolsResult {
  /** A mutating tool call needs user confirmation before it can run. */
  pending?: PendingToolAction;
  /**
   * The finished turn's text. When the caller supplied `onTextDelta`, this
   * is exactly the concatenation of the deltas it already received — the
   * final answer was generated (and streamed) exactly once, inside the
   * provider call for this turn, not regenerated here.
   */
  text?: string;
}

export async function runAssistantTools(
  provider: AIProvider,
  history: AIMessage[],
  confirmed = false,
  onToolActivity?: ToolActivity,
  streamOptions?: AIToolGenerateOptions,
): Promise<RunAssistantToolsResult> {
  let messages = history;
  if (confirmed) {
    const pendingMessage = messages.at(-1);
    const pendingCalls = pendingMessage?.toolCalls ?? [];
    if (pendingMessage?.role !== "assistant" || !pendingCalls.length)
      return { text: "I couldn't complete that request." };
    messages = [
      ...messages,
      { role: "tool", content: "", toolResults: await resultsFor(pendingCalls) },
    ];
  }
  for (let turn = 0; turn < 4; turn++) {
    // Every turn is a single Gemini generation. `streamOptions.onTextDelta`
    // only ever fires from inside this call, and only for the turn that
    // actually turns out to be the final, tool-free answer — see the
    // gating logic in the Gemini provider's generateWithTools.
    const completion = await provider.generateWithTools(messages, localTools, streamOptions);
    if (!completion.toolCalls.length)
      return { text: completion.text || "I couldn't complete that request." };
    const calls = completion.toolCalls;
    onToolActivity?.(calls.map((call) => call.name));
    const modelMessage: AIMessage = {
      role: "assistant",
      content: completion.text,
      toolCalls: calls,
      ...(completion.providerRawParts ? { providerRawParts: completion.providerRawParts } : {}),
    };
    const mutating = calls.some((call) => toolRegistry.get(call.name)?.mutates);
    if (mutating) return { pending: { calls, history: [...messages, modelMessage] } };
    const toolResults = await resultsFor(calls);
    messages = [...messages, modelMessage, { role: "tool", content: "", toolResults }];
  }
  return { text: "I completed the requested local actions." };
}
