import { AlertCircle, Copy, Paperclip, Square, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { ChatMessage } from "@/shared/types/domain";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "@/features/assistant/useAssistantChat";

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-[0.97rem] leading-relaxed text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {message.state === "error" ? (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message.error ?? "Something went wrong."}</span>
        </p>
      ) : (
        <div className="whitespace-pre-wrap text-[0.97rem] leading-relaxed text-foreground">
          {message.content}
          {message.state === "streaming" && !message.content ? (
            <span className="animate-pulse text-muted-foreground">Thinking…</span>
          ) : null}
        </div>
      )}

      {message.artifacts?.length ? (
        <ul className="flex flex-wrap gap-2">
          {message.artifacts.map((artifact) => (
            <li
              key={artifact.id}
              className="rounded-xl border px-3 py-2 text-xs text-muted-foreground"
            >
              {artifact.title} · {artifact.status}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SuggestionChips({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (value: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {suggestions.map((suggestion) => (
        <li key={suggestion}>
          <button
            type="button"
            onClick={() => onSelect(suggestion)}
            className="tap-target w-full rounded-2xl border bg-surface px-4 py-3 text-left text-[0.95rem] transition-colors hover:bg-accent active:scale-[0.995]"
          >
            {suggestion}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ChatComposer({
  status,
  onSend,
  onStop,
  onAttach,
}: {
  status: ChatStatus;
  onSend: (value: string) => void;
  onStop: () => void;
  onAttach?: () => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status !== "idle";

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !value.trim()) return;
    onSend(value);
    setValue("");
  }

  return (
    <form
      onSubmit={submit}
      className="surface-card flex items-end gap-2 rounded-3xl p-2 shadow-[var(--shadow-lifted)]"
    >
      {onAttach ? (
        <button
          type="button"
          onClick={onAttach}
          aria-label="Attach from vault"
          className="tap-target inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
        >
          <Paperclip className="size-[1.15rem]" aria-hidden="true" />
        </button>
      ) : null}

      <label className="sr-only" htmlFor="chat-input">
        Message the assistant
      </label>
      <textarea
        id="chat-input"
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            submit(event);
          }
        }}
        placeholder="Ask anything…"
        className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2.5 text-[1rem] leading-relaxed outline-none placeholder:text-muted-foreground"
      />

      <button
        type={busy ? "button" : "submit"}
        onClick={busy ? onStop : undefined}
        disabled={!busy && !value.trim()}
        aria-label={busy ? "Stop generating" : "Send message"}
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
          !busy && !value.trim() && "opacity-40",
        )}
      >
        {busy ? <Square className="size-4" aria-hidden="true" /> : <ArrowUp className="size-5" aria-hidden="true" />}
      </button>
    </form>
  );
}

export function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="tap-target inline-flex items-center gap-2 rounded-xl border px-3 text-sm"
    >
      <Copy className="size-4" aria-hidden="true" />
      {copied ? "Copied" : "Copy prompt"}
    </button>
  );
}
