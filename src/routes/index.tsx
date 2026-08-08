import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { useSettings } from "@/app/providers/SettingsProvider";
import {
  ChatComposer,
  MessageBubble,
  SuggestionChips,
} from "@/features/assistant/components/ChatParts";
import { StudySnapshot } from "@/features/assistant/components/StudySnapshot";
import { useAssistantChat } from "@/features/assistant/useAssistantChat";
import { greeting } from "@/shared/utils/format";

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

function AssistantPage() {
  const { messages, status, error, send, stop, pendingAction, confirmPending, rejectPending } =
    useAssistantChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;
  const hello = useMemo(() => greeting(), []);

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
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={bottomRef} />
            </div>
          ) : (
            <div className="pt-6">
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
            <p role="status" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {pendingAction ? (
            <div className="surface-card mt-4 flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="flex-1">
                Confirm local action: {pendingAction.calls.map((call) => call.name).join(", ")}
              </span>
              <button
                type="button"
                className="tap-target rounded-xl bg-primary px-3 py-2 text-primary-foreground"
                onClick={() => void confirmPending()}
              >
                Confirm
              </button>
              <button
                type="button"
                className="tap-target rounded-xl border px-3 py-2"
                onClick={() => void rejectPending()}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent px-5 pb-safe pt-3">
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
