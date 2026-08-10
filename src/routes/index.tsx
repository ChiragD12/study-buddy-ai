import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import {
  ChatComposer,
  MessageBubble,
  SuggestionChips,
  ThinkingIndicator,
} from "@/features/assistant/components/ChatParts";
import { StudySnapshot } from "@/features/assistant/components/StudySnapshot";
import { useAssistantChat } from "@/features/assistant/useAssistantChat";
import { greeting } from "@/shared/utils/format";
import { playUiSound } from "@/shared/utils/sound";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Assistant — Exam Assistant" },
      {
        name: "description",
        content: "Your private, offline-first study assistant for competitive exams.",
      },
      { property: "og:title", content: "Assistant — Exam Assistant" },
      {
        property: "og:description",
        content: "Your private, offline-first study assistant for competitive exams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssistantPage,
});

const SUGGESTIONS = [
  "Verify my notes",
  "What should I study today?",
  "Today's current affairs",
  "Create a revision sheet",
  "Practice answer writing",
];

const ACTION_COPY: Record<string, string> = {
  examsCreate: "create an exam",
  examsUpdate: "update an exam",
  examsDelete: "delete an exam",
  examsSetActive: "change your active exam",
  examsClearActive: "clear your active exam",
  notesCreate: "create a note",
  notesUpdate: "update a note",
  notesDelete: "delete a note",
  studyPlanCreate: "add a study-plan entry",
  studyPlanComplete: "update a study-plan entry",
  studyPlanDelete: "remove a study-plan entry",
  vaultSave: "save text in your Vault",
  vaultToggleFavorite: "change a Vault favorite",
  vaultDelete: "delete a Vault item",
};

function AssistantPage() {
  const {
    messages,
    status,
    activity,
    error,
    send,
    stop,
    pendingAction,
    confirmPending,
    rejectPending,
  } = useAssistantChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;
  const hello = useMemo(() => greeting(), []);
  const lastMessage = messages[messages.length - 1];
  const isAssistantThinking =
    lastMessage?.role === "assistant" && lastMessage.state === "streaming" && !lastMessage.content;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, status]);

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:min-h-dvh">
      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <div className="mx-auto w-full max-w-2xl">
          <StudySnapshot />

          {hasMessages ? (
            <div className="flex flex-col gap-5 pb-4">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(index, 4) * 40}ms` }}
                >
                  <MessageBubble message={message} activity={activity} />
                </div>
              ))}
              {/* Covers only the brief gap between the user's message and the
                  assistant placeholder landing in `messages` (e.g. while
                  resolving the provider). Once that placeholder exists,
                  MessageBubble's own indicator takes over — this never
                  renders alongside it. */}
              {status !== "idle" && !isAssistantThinking ? (
                <div className="animate-fade-in-up px-0.5">
                  <ThinkingIndicator label={activity} />
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="animate-fade-in-up pt-6">
              <p className="text-sm text-muted-foreground">{hello}</p>
              <h1 className="text-balance-tight mt-1 text-[1.75rem] font-semibold">
                What do you want to do?
              </h1>
              <div className="mt-6">
                <SuggestionChips suggestions={SUGGESTIONS} onSelect={send} />
              </div>
            </div>
          )}

          {error ? (
            <p role="status" className="animate-fade-in mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {pendingAction ? (
            <div className="glass-panel animate-fade-in-up mt-4 flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="flex-1">
                I can{" "}
                {pendingAction.calls
                  .map((call) => ACTION_COPY[call.name] ?? "make a local change")
                  .join(" and ")}
                . Do you want me to continue?
              </span>
              <button
                type="button"
                className="tap-target rounded-xl bg-primary px-3 py-2 text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98]"
                onClick={() => {
                  playUiSound("success");
                  void confirmPending();
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="tap-target glass-sm rounded-xl border border-border/70 px-3 py-2 transition-all duration-200 hover:bg-accent/60 active:scale-[0.98]"
                onClick={() => {
                  playUiSound("click");
                  void rejectPending();
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="glass-sm sticky bottom-0 border-t border-border/50 bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-safe pt-3">
        <div className="mx-auto w-full max-w-2xl pb-3">
          <ChatComposer status={status} onSend={send} onStop={stop} />
          <p className="mt-2 text-center text-[0.7rem] text-muted-foreground">
            Conversations stay on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
