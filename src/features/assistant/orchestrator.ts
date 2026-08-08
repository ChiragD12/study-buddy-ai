import { localTools } from "@/ai/tools/localTools";
import { toolRegistry } from "@/ai/tools/registry";
import type { AIMessage, AIProvider, AIToolCall, AIToolResult } from "@/ai/types";

export interface PendingToolAction {
  calls: AIToolCall[];
  history: AIMessage[];
}

export type ToolActivity = (toolNames: string[]) => void;

function resultsFor(calls: AIToolCall[]): Promise<AIToolResult[]> {
  return Promise.all(
    calls.map(async (call) => {
      try {
        return {
          callId: call.id,
          name: call.name,
          result: await toolRegistry.execute(call.name, call.args),
        };
      } catch (error) {
        return {
          callId: call.id,
          name: call.name,
          result: { error: error instanceof Error ? error.message : "The action failed." },
        };
      }
    }),
  );
}

export async function runAssistantTools(
  provider: AIProvider,
  history: AIMessage[],
  confirmed = false,
  onToolActivity?: ToolActivity,
): Promise<{ text?: string; pending?: PendingToolAction }> {
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
    const completion = await provider.generateWithTools(messages, localTools);
    if (!completion.toolCalls.length)
      return { text: completion.text || "I couldn't complete that request." };
    const calls = completion.toolCalls;
    onToolActivity?.(calls.map((call) => call.name));
    const modelMessage: AIMessage = {
      role: "assistant",
      content: completion.text,
      toolCalls: calls,
    };
    const mutating = calls.some((call) => toolRegistry.get(call.name)?.mutates);
    if (mutating) return { pending: { calls, history: [...messages, modelMessage] } };
    const toolResults = await resultsFor(calls);
    messages = [...messages, modelMessage, { role: "tool", content: "", toolResults }];
  }
  return { text: "I completed the requested local actions." };
}
