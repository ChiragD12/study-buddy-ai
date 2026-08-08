import { useCallback, useEffect, useRef, useState } from "react";

import { buildAssistantContext, systemPrompt } from "@/ai/context/assistantContext";
import { resolveProvider } from "@/ai/providers";
import { AINotConfiguredError, type AIMessage } from "@/ai/types";
import { runAssistantTools, type PendingToolAction } from "@/features/assistant/orchestrator";
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
export function useAssistantChat() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingToolAction | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const confirmingRef = useRef(false);
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

  const completeMessage = useCallback(async (id: string, content: string) => {
    await chatRepository.updateMessage(id, { content, state: "complete" });
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, content, state: "complete" } : message,
      ),
    );
  }, []);

  const confirmPending = useCallback(async () => {
    if (!pendingAction || !conversationId || confirmingRef.current) return;
    confirmingRef.current = true;
    setPendingAction(null);
    setStatus("streaming");
    const assistantMessage = pendingMessageId
      ? messages.find((message) => message.id === pendingMessageId)
      : undefined;
    try {
      const provider = await resolveProvider();
      if (!provider || !assistantMessage) {
        setError(new AINotConfiguredError().message);
        return;
      }
      const result = await runAssistantTools(provider, pendingAction.history, true);
      await completeMessage(
        assistantMessage.id,
        result.text ?? "The requested action was completed.",
      );
    } catch (cause) {
      if (assistantMessage)
        await completeMessage(
          assistantMessage.id,
          cause instanceof Error ? cause.message : "The action failed.",
        );
    } finally {
      setPendingMessageId(null);
      confirmingRef.current = false;
      setStatus("idle");
    }
  }, [completeMessage, conversationId, messages, pendingAction, pendingMessageId]);

  const rejectPending = useCallback(async () => {
    if (confirmingRef.current) return;
    setPendingAction(null);
    const assistantMessage = pendingMessageId
      ? messages.find((message) => message.id === pendingMessageId)
      : undefined;
    if (assistantMessage)
      await completeMessage(assistantMessage.id, "Okay, I won't make that change.");
    setPendingMessageId(null);
    setStatus("idle");
  }, [completeMessage, messages, pendingMessageId]);

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

      const provider = await resolveProvider();
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
        const result = await runAssistantTools(provider, history);
        if (result.pending) {
          setPendingAction(result.pending);
          setPendingMessageId(assistantMessage.id);
          await completeMessage(
            assistantMessage.id,
            "I can make that local change. Review it and confirm to continue.",
          );
        } else {
          await completeMessage(
            assistantMessage.id,
            result.text ?? "I couldn't complete that request.",
          );
        }
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
    [completeMessage, conversationId, status],
  );

  return {
    conversationId,
    messages,
    status,
    error,
    send,
    stop,
    newConversation,
    load,
    pendingAction,
    confirmPending,
    rejectPending,
  };
}
