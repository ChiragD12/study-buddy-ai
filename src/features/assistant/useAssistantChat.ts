import { useCallback, useEffect, useRef, useState } from "react";

import { buildAssistantContext, systemPrompt } from "@/ai/context/assistantContext";
import { resolveProvider } from "@/ai/providers";
import { AINotConfiguredError, type AIMessage } from "@/ai/types";
import { chatRepository } from "@/data/repositories/chat.repository";
import { isBrowser } from "@/data/db/db";
import type { ChatMessage } from "@/shared/types/domain";

export type ChatStatus = "idle" | "submitted" | "streaming";

/**
 * Assistant orchestration entry point.
 *
 * Today it forwards the conversation to the configured provider. Tool calling
 * (see `src/ai/tools/registry.ts`) plugs in here without touching the UI.
 */
export function useAssistantChat(model: string) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages(await chatRepository.listMessages(id));
  }, []);

  useEffect(() => {
    if (!isBrowser) return;
    let cancelled = false;
    (async () => {
      const conversations = await chatRepository.listConversations();
      const conversation = conversations[0] ?? (await chatRepository.createConversation());
      if (!cancelled) await load(conversation.id);
    })().catch((cause) => console.error("Failed to open conversation", cause));
    return () => {
      cancelled = true;
    };
  }, [load]);

  const newConversation = useCallback(async () => {
    const conversation = await chatRepository.createConversation();
    await load(conversation.id);
  }, [load]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !conversationId || status !== "idle") return;
      setError(null);

      const userMessage = await chatRepository.appendMessage({
        conversationId,
        role: "user",
        content: trimmed,
        state: "complete",
      });
      setMessages((current) => [...current, userMessage]);
      setStatus("submitted");

      const provider = resolveProvider(model);
      const assistantMessage = await chatRepository.appendMessage({
        conversationId,
        role: "assistant",
        content: "",
        state: provider ? "streaming" : "error",
        ...(provider ? {} : { error: "No Gemini API key configured." }),
      });
      setMessages((current) => [...current, assistantMessage]);

      if (!provider) {
        setStatus("idle");
        setError(new AINotConfiguredError().message);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const context = await buildAssistantContext();
      const history: AIMessage[] = [
        systemPrompt(context),
        ...(await chatRepository.listMessages(conversationId))
          .filter((message) => message.state === "complete")
          .map((message) => ({ role: message.role, content: message.content })),
      ];

      try {
        setStatus("streaming");
        let content = "";
        for await (const chunk of provider.stream(history, { signal: controller.signal })) {
          content += chunk.delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id ? { ...message, content } : message,
            ),
          );
        }
        await chatRepository.updateMessage(assistantMessage.id, { content, state: "complete" });
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id ? { ...message, content, state: "complete" } : message,
          ),
        );
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Request failed.";
        setError(message);
        await chatRepository.updateMessage(assistantMessage.id, { state: "error", error: message });
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessage.id ? { ...item, state: "error", error: message } : item,
          ),
        );
      } finally {
        abortRef.current = null;
        setStatus("idle");
      }
    },
    [conversationId, model, status],
  );

  return { conversationId, messages, status, error, send, stop, newConversation, load };
}
