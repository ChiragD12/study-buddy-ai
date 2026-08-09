import {
  AlertCircle,
  Copy,
  File,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Square,
  ArrowUp,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import type { ChatMessage } from "@/shared/types/domain";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/shared/utils/format";
import type { ChatStatus } from "@/features/assistant/useAssistantChat";
import {
  ATTACHMENT_ACCEPT_ATTR,
  describeAttachment,
  revokeAttachmentPreview,
  type PendingAttachment,
} from "@/features/assistant/attachments";

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.attachments?.length ? (
          <ul className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="glass-sm flex max-w-full items-center gap-1.5 rounded-xl border border-border/60 px-2 py-1 text-[0.7rem] text-muted-foreground"
              >
                {attachment.kind === "image" ? (
                  <ImageIcon className="size-3 shrink-0" aria-hidden="true" />
                ) : (
                  <FileText className="size-3 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{attachment.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
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

function attachmentIcon(kind: PendingAttachment["kind"]) {
  if (kind === "pdf" || kind === "text") return FileText;
  return File;
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  const hasError = Boolean(attachment.error);
  const Icon = attachmentIcon(attachment.kind);

  return (
    <div
      className={cn(
        "glass-sm flex max-w-56 items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-xs",
        hasError ? "border-destructive/40" : "border-border/60",
      )}
    >
      {attachment.kind === "image" && attachment.previewUrl ? (
        <img
          src={attachment.previewUrl}
          alt=""
          className="size-8 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            hasError ? "bg-destructive/10 text-destructive" : "bg-accent text-muted-foreground",
          )}
        >
          {hasError ? (
            <AlertCircle className="size-4" aria-hidden="true" />
          ) : (
            <Icon className="size-4" aria-hidden="true" />
          )}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{attachment.file.name}</span>
        <span
          className={cn("block truncate", hasError ? "text-destructive" : "text-muted-foreground")}
        >
          {hasError ? attachment.error : formatBytes(attachment.file.size)}
        </span>
      </span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.file.name}`}
        className="tap-target inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ChatComposer({
  status,
  onSend,
  onStop,
  onAttach,
}: {
  status: ChatStatus;
  onSend: (value: string, attachments?: File[]) => void;
  onStop: () => void;
  onAttach?: () => void;
}) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<PendingAttachment[]>(attachments);
  const busy = status !== "idle";

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Revoke any remaining image preview URLs when the composer unmounts.
  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(revokeAttachmentPreview);
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const validFiles = attachments.filter((attachment) => attachment.kind !== null);
  const hasContent = value.trim().length > 0 || validFiles.length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !hasContent) return;
    onSend(
      value,
      validFiles.map((attachment) => attachment.file),
    );
    setValue("");
    attachments.forEach(revokeAttachmentPreview);
    setAttachments([]);
  }

  function handleFilesPicked(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    // Reset so picking the same file again still fires a change event.
    event.target.value = "";
    // Cancelled picker: fileList is empty — nothing to do.
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList).map((file) => describeAttachment(file));
    setAttachments((current) => [...current, ...picked]);
  }

  function removeAttachment(localId: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.localId === localId);
      if (target) revokeAttachmentPreview(target);
      return current.filter((attachment) => attachment.localId !== localId);
    });
  }

  return (
    <form
      onSubmit={submit}
      className="surface-card flex flex-col gap-2 rounded-3xl p-2 shadow-[var(--shadow-lifted)]"
    >
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-1 pt-1">
          {attachments.map((attachment) => (
            <li key={attachment.localId} className="animate-scale-in">
              <AttachmentChip
                attachment={attachment}
                onRemove={() => removeAttachment(attachment.localId)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT_ATTR}
          onChange={handleFilesPicked}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => {
            onAttach?.();
            fileInputRef.current?.click();
          }}
          aria-label="Attach a file"
          className="tap-target inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
        >
          <Paperclip className="size-[1.15rem]" aria-hidden="true" />
        </button>

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
          disabled={!busy && !hasContent}
          aria-label={busy ? "Stop generating" : "Send message"}
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
            !busy && !hasContent && "opacity-40",
          )}
        >
          {busy ? (
            <Square className="size-4" aria-hidden="true" />
          ) : (
            <ArrowUp className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
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
