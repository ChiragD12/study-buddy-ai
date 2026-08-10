import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { buildAssistantContext, systemPrompt } from "@/ai/context/assistantContext";
import { resolveProvider } from "@/ai/providers";
import { AINotConfiguredError, type AIMessage } from "@/ai/types";
import {
  runAssistantTools,
  type PendingToolAction,
  type ToolActivity,
} from "@/features/assistant/orchestrator";
import {
  AttachmentError,
  describeAttachment,
  resolveAttachmentsForAI,
  storeAttachments,
} from "@/features/assistant/attachments";
import { chatRepository } from "@/data/repositories/chat.repository";
import { isBrowser } from "@/data/db/db";
import type { ChatMessage } from "@/shared/types/domain";

const NO_TEXT_PLACEHOLDER = "Please analyze the attached file(s).";

export type ChatStatus = "idle" | "submitted" | "streaming";

function friendlyError(cause: unknown): string {
  if (cause instanceof AINotConfiguredError) return cause.message;
  if (cause instanceof Error && cause.message.includes("find")) return cause.message;
  return "I couldn't complete that request. Please try again.";
}

function isAbortError(cause: unknown): boolean {
  return (
    (cause instanceof DOMException && cause.name === "AbortError") ||
    (cause instanceof Error && cause.name === "AbortError")
  );
}

/**
 * Builds the `onTextDelta` callback passed into `runAssistantTools`. It only
 * ever fires for the turn that turns out to be the tool-free final answer,
 * streamed live from inside that single Gemini generation — see
 * gemini.ts's `generateWithTools`. Each call appends to the same in-memory
 * buffer and repaints the same assistant message by id; nothing here
 * touches IndexedDB — that happens once, via `completeMessage`, after the
 * turn (or the whole `send`/`confirmPending` call) resolves.
 */
function createTextDeltaHandler(
  assistantMessageId: string,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  setActivity: (value: string | null) => void,
  contentRef: { current: string },
): (delta: string) => void {
  let clearedActivity = false;
  return (delta: string) => {
    if (!clearedActivity) {
      clearedActivity = true;
      setActivity(null);
    }
    contentRef.current += delta;
    const next = contentRef.current;
    setMessages((current) =>
      current.map((message) =>
        message.id === assistantMessageId ? { ...message, content: next } : message,
      ),
    );
  };
}

function activityFor(names: string[]): string {
  if (names.some((name) => name.startsWith("notes"))) return "Searching your notes…";
  if (names.some((name) => name.startsWith("studyPlan"))) return "Checking your study plan…";
  if (names.some((name) => name.startsWith("vault"))) return "Searching your Vault…";
  if (names.some((name) => name.startsWith("exams"))) return "Checking your exams…";
  if (names.some((name) => name.startsWith("currentAffairs")))
    return "Checking your saved current affairs…";
  if (names.some((name) => name.startsWith("progress"))) return "Checking your study progress…";
  return "Working with your study data…";
}

/**
 * Turns a persisted ChatMessage into the shape the AI provider needs.
 * Image/PDF attachments are resolved to inline binary parts; text
 * attachments are extracted and folded into the message text. This only
 * ever touches the outgoing request — the persisted message (and what's
 * shown in the UI) keeps the user's original short text, never the full
 * extracted content.
 */
async function toAIMessage(message: ChatMessage): Promise<AIMessage> {
  if (!message.attachments?.length) {
    return { role: message.role, content: message.content };
  }
  const { attachments, extractedText } = await resolveAttachmentsForAI(message.attachments);
  return {
    role: message.role,
    content: extractedText ? `${message.content}\n\n${extractedText}` : message.content,
    ...(attachments.length ? { attachments } : {}),
  };
}

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
  const [activity, setActivity] = useState<string | null>(null);
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
    const controller = new AbortController();
    abortRef.current = controller;
    const contentRef = { current: "" };
    try {
      const provider = await resolveProvider();
      if (!provider || !assistantMessage) {
        setError(new AINotConfiguredError().message);
        return;
      }
      const result = await runAssistantTools(provider, pendingAction.history, true, (names) => {
        setActivity(activityFor(names));
      }, {
        signal: controller.signal,
        onTextDelta: createTextDeltaHandler(assistantMessage.id, setMessages, setActivity, contentRef),
      });
      await completeMessage(
        assistantMessage.id,
        contentRef.current || result.text || "The requested action was completed.",
      );
    } catch (cause) {
      if (assistantMessage) {
        // A user-initiated Stop mid-stream isn't a failure — close the turn
        // out normally with whatever text had already streamed in, rather
        // than surfacing an error.
        await completeMessage(
          assistantMessage.id,
          isAbortError(cause)
            ? contentRef.current || "The requested action was completed."
            : friendlyError(cause),
        );
      }
    } finally {
      setPendingMessageId(null);
      confirmingRef.current = false;
      // Only this invocation's own controller may reset the shared status —
      // if a newer send()/confirmPending() call has already taken over
      // abortRef (e.g. the user stopped this turn and immediately sent a
      // new message), this stale finally must not clobber that active turn.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStatus("idle");
        setActivity(null);
      }
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
    async (text: string, files: File[] = []) => {
      const trimmed = text.trim();
      if ((!trimmed && files.length === 0) || !conversationId || status !== "idle") return;
      setError(null);

      let attachmentRefs: ChatMessage["attachments"];
      if (files.length) {
        try {
          const stored = await storeAttachments(
            files.map((file) => describeAttachment(file)),
            trimmed,
          );
          if (stored.length) attachmentRefs = stored;
        } catch (cause) {
          setError(
            cause instanceof AttachmentError
              ? cause.message
              : "Couldn't save the attached file(s). Please try again.",
          );
          return;
        }
      }

      const userMessage = await chatRepository.appendMessage({
        conversationId,
        role: "user",
        content: trimmed || NO_TEXT_PLACEHOLDER,
        state: "complete",
        ...(attachmentRefs ? { attachments: attachmentRefs } : {}),
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
      const contentRef = { current: "" };

      try {
        const context = await buildAssistantContext();
        const priorMessages = (await chatRepository.listMessages(conversationId)).filter(
          (message) => message.state === "complete",
        );
        const history: AIMessage[] = [
          systemPrompt(context),
          ...(await Promise.all(priorMessages.map(toAIMessage))),
        ];
        setStatus("streaming");
        // A single call runs the tool loop; the turn that comes back with
        // no tool calls is the final answer, and its text streams live
        // into this same assistant message via onTextDelta as it's
        // generated — never a second, separate generation.
        const result = await runAssistantTools(
          provider,
          history,
          false,
          (names) => setActivity(activityFor(names)),
          {
            signal: controller.signal,
            onTextDelta: createTextDeltaHandler(assistantMessage.id, setMessages, setActivity, contentRef),
          },
        );
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
            contentRef.current || result.text || "I couldn't complete that request.",
          );
        }
      } catch (cause) {
        if (isAbortError(cause)) {
          // User pressed Stop mid-stream — keep whatever text had already
          // arrived and close the turn out normally rather than as an error.
          await completeMessage(assistantMessage.id, contentRef.current || "Stopped.");
        } else {
          const message = friendlyError(cause);
          setError(message);
          await chatRepository.updateMessage(assistantMessage.id, {
            state: "error",
            error: message,
          });
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantMessage.id ? { ...item, state: "error", error: message } : item,
            ),
          );
        }
      } finally {
        // Only this invocation's own controller may reset the shared status
        // — see the matching guard in confirmPending for why (avoids a
        // stopped-then-immediately-resent turn clobbering the new one).
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStatus("idle");
          setActivity(null);
        }
      }
    },
    [completeMessage, conversationId, status],
  );

  return {
    conversationId,
    messages,
    status,
    activity,
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
