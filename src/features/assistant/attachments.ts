/**
 * File attachments for the AI chat composer.
 *
 * Selection/validation happens here entirely client-side and synchronously
 * (no heavy deps). Persistence reuses the existing Vault blob storage
 * (`data/repositories/vault.repository.ts`) so chat history only ever keeps
 * a metadata reference (`ChatAttachmentRef`), never base64 payloads.
 *
 * Extraction for text/PDF/image content reuses the existing lazy-loaded
 * Vault extraction pipeline (`ai/context/vaultContent.ts`, which in turn
 * lazy-imports `features/vault/pdfExtract.ts` and `features/vault/ocr.ts`).
 * Nothing in this file imports those heavy modules at the top level, so the
 * initial application module graph is unaffected.
 */

import { newId } from "@/data/repositories/util";
import { vaultRepository } from "@/data/repositories/vault.repository";
import { classifyVaultSubject } from "@/features/assistant/vaultClassification";
import type { AIAttachment } from "@/ai/types";
import type {
  ChatAttachmentKind,
  ChatAttachmentRef,
  ID,
  VaultSubject,
} from "@/shared/types/domain";

export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentError";
  }
}

/** Per-kind file size caps. */
export const MAX_ATTACHMENT_BYTES_BY_KIND: Record<ChatAttachmentKind, number> = {
  image: 10 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
  text: 10 * 1024 * 1024,
};

const MIME_TO_KIND: Record<string, ChatAttachmentKind> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
  "application/pdf": "pdf",
  "text/plain": "text",
};

export const ACCEPTED_ATTACHMENT_TYPES = Object.keys(MIME_TO_KIND);
/** Suitable for an <input accept="..."> attribute. */
export const ATTACHMENT_ACCEPT_ATTR = ACCEPTED_ATTACHMENT_TYPES.join(",");

export function classifyAttachmentFile(file: File): ChatAttachmentKind | null {
  return MIME_TO_KIND[file.type] ?? null;
}

/**
 * A file the user has picked in the composer but not yet sent. `kind` is
 * null when the file failed validation — it stays in the UI as a removable
 * error chip (see ChatParts.tsx) rather than being silently dropped, so the
 * user understands why it won't be sent.
 */
export interface PendingAttachment {
  localId: ID;
  file: File;
  kind: ChatAttachmentKind | null;
  error?: string;
  /** Object URL for image thumbnails only. Caller must revoke it on removal/unmount. */
  previewUrl?: string;
}

/** Validates and classifies a freshly-picked File. Never throws — unsupported/oversized files come back as an error chip. */
export function describeAttachment(file: File): PendingAttachment {
  const localId = newId();
  const kind = classifyAttachmentFile(file);

  if (!kind) {
    return {
      localId,
      file,
      kind: null,
      error: "Unsupported file type. Attach an image, PDF, or plain-text file.",
    };
  }

  const maxBytes = MAX_ATTACHMENT_BYTES_BY_KIND[kind];
  if (file.size > maxBytes) {
    return {
      localId,
      file,
      kind: null,
      error: `File is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).`,
    };
  }

  return {
    localId,
    file,
    kind,
    ...(kind === "image" ? { previewUrl: URL.createObjectURL(file) } : {}),
  };
}

export function revokeAttachmentPreview(attachment: PendingAttachment): void {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
}

/**
 * Best-effort text for classification purposes only — never used as the
 * stored/extracted content. Text files are read directly (cheap, no lazy
 * deps). PDFs/images go through the existing lazy Vault extraction pipeline
 * (`ai/context/vaultContent.ts`, dynamically imported here so OCR/pdf-extract
 * still never enter the initial module graph). Any failure here just means
 * classification falls back to filename + accompanying message — the saved
 * file itself is never affected.
 */
async function contentForClassification(
  vaultItemId: ID,
  kind: ChatAttachmentKind,
  file: File,
): Promise<string | undefined> {
  try {
    if (kind === "text") return await file.text();
    const { getVaultContent } = await import("@/ai/context/vaultContent");
    const { text } = await getVaultContent(vaultItemId);
    return text;
  } catch {
    return undefined;
  }
}

/**
 * Persists validated pending attachments as Vault items (reusing the
 * existing Vault blob table — no new storage), classifies each into the
 * `VaultSubject` taxonomy (see `vaultClassification.ts`) and sets it on the
 * Vault item, then returns the metadata refs to attach to the outgoing
 * ChatMessage. Invalid (kind === null) entries are skipped; callers should
 * already have prevented sending with any present. Classification never
 * blocks or reverts the save — the original file is always kept as-is even
 * when a subject can't be determined (left "Uncategorized").
 */
export async function storeAttachments(
  attachments: PendingAttachment[],
  accompanyingText?: string,
): Promise<ChatAttachmentRef[]> {
  const refs: ChatAttachmentRef[] = [];
  for (const attachment of attachments) {
    if (!attachment.kind) continue;
    try {
      const item = await vaultRepository.addFile(attachment.file, {
        kind: attachment.kind,
        tags: ["chat-attachment"],
      });

      // Classification is best-effort and must never undo or block the save
      // above — the original file is already safely in the Vault by now.
      // Items that can't be classified simply stay without a `subject`
      // (shown under "Uncategorized" in the Vault) rather than guessing.
      let subject: VaultSubject | null = null;
      try {
        const content = await contentForClassification(item.id, attachment.kind, attachment.file);
        subject = await classifyVaultSubject({
          filename: attachment.file.name,
          ...(accompanyingText !== undefined ? { accompanyingText } : {}),
          ...(content !== undefined ? { content } : {}),
        });
        if (subject) await vaultRepository.update(item.id, { subject });
      } catch {
        subject = null;
      }

      refs.push({
        id: newId(),
        vaultItemId: item.id,
        name: attachment.file.name || "attachment",
        mimeType: attachment.file.type,
        sizeBytes: attachment.file.size,
        kind: attachment.kind,
        ...(subject ? { subject } : {}),
      });
    } catch (cause) {
      throw new AttachmentError(
        cause instanceof Error ? cause.message : "Couldn't save an attached file.",
      );
    }
  }
  return refs;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read the file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read the file."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export interface ResolvedAttachments {
  /** Images/PDFs, base64-encoded, ready for AIMessage.attachments. */
  attachments: AIAttachment[];
  /** Extracted text (from text files) to append to the message content. Empty string when nothing to append. */
  extractedText: string;
}

/**
 * Resolves stored attachment refs into what the AI provider actually needs:
 * images/PDFs become inline binary parts, text files are extracted (via the
 * existing Vault extraction pipeline, lazily loaded) and returned as text to
 * fold into the prompt. Never throws — a failure for one attachment becomes
 * an inline note instead of aborting the whole request.
 */
export async function resolveAttachmentsForAI(
  refs: ChatAttachmentRef[],
): Promise<ResolvedAttachments> {
  const attachments: AIAttachment[] = [];
  const textParts: string[] = [];

  for (const ref of refs) {
    try {
      if (ref.kind === "text") {
        const { getVaultContent } = await import("@/ai/context/vaultContent");
        const { text } = await getVaultContent(ref.vaultItemId);
        textParts.push(`[Attached file: ${ref.name}]\n${text}`);
        continue;
      }

      const blob = await vaultRepository.getBlob(ref.vaultItemId);
      if (!blob) {
        textParts.push(`[Attached file: ${ref.name} — this file is no longer available.]`);
        continue;
      }
      const data = await blobToBase64(blob);
      attachments.push({ mimeType: ref.mimeType, data });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "couldn't be read";
      textParts.push(`[Attached file: ${ref.name} — ${reason}]`);
    }
  }

  return { attachments, extractedText: textParts.join("\n\n") };
}
