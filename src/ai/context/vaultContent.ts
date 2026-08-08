/**
 * Vault file → readable text, for the AI assistant.
 *
 * This is the piece `vaultSearch`/`vaultGet`/etc (ai/tools/localTools.ts)
 * deliberately don't do: those return metadata only. `getVaultContent`
 * below is what the `vaultReadContent` tool calls to actually read a file's
 * contents, so the assistant can answer questions about what it says.
 *
 * Extraction is lazy (only runs when a tool call actually asks for a given
 * file) and cached in the `vaultContent` table (see
 * data/repositories/vaultContent.repository.ts), keyed by vaultItemId and
 * pinned to the VaultItem's `updatedAt` at extraction time so a replaced
 * blob is never served stale.
 *
 * Not implemented here, intentionally: PDF semantic editing, PDF → HTML, or
 * any kind of retrieval/vector index. This just gets real text in front of
 * the model; the existing tool loop (ai/tools/localTools.ts) and
 * conversation history are the only "retrieval" in play.
 */
import { vaultRepository } from "@/data/repositories/vault.repository";
import { vaultContentRepository } from "@/data/repositories/vaultContent.repository";
import { extractPdfDoc, renderPdfPagesToImages, PdfNotExtractableError } from "@/features/vault/pdfExtract";
import type { PdfDocSpec } from "@/features/vault/pdfDoc";
import { ocrImage, OcrFailedError } from "@/features/vault/ocr";
import type { VaultContentMethod, VaultItem } from "@/shared/types/domain";

export class VaultContentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultContentUnavailableError";
  }
}

export interface VaultContentResult {
  text: string;
  method: VaultContentMethod;
  /** True if this came from the cache rather than a fresh extraction. */
  cached: boolean;
  /** True if the returned text was cut short to keep the tool result bounded. */
  truncated: boolean;
}

// Keeps a single tool result comfortably inside a normal context window
// even for a long PDF, without building a real chunking/retrieval system.
const MAX_CHARS = 24_000;

function normalize(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_CHARS)}\n\n[Content truncated — this document is longer than shown here.]`,
    truncated: true,
  };
}

/** Flattens the structured `{title, sections}` shape into page-tagged plain text. */
function pdfDocToText(doc: PdfDocSpec): string {
  const pages = doc.sections.map((section, index) => {
    const body = [
      ...(section.heading ? [section.heading] : []),
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
    ]
      .join("\n\n")
      .trim();
    return `[Page ${index + 1}]\n${body}`;
  });
  return [doc.title, ...pages].filter((part) => part.trim()).join("\n\n");
}

async function ocrPdf(blob: Blob): Promise<string> {
  const images = await renderPdfPagesToImages(blob);
  if (!images.length) {
    throw new VaultContentUnavailableError("Unable to extract readable text from this file.");
  }
  const pages: string[] = [];
  let pageNumber = 0;
  for (const image of images) {
    pageNumber += 1;
    try {
      const pageText = await ocrImage(image);
      pages.push(`[Page ${pageNumber}]\n${pageText}`);
    } catch {
      // One unreadable page shouldn't fail the whole document — note it and
      // keep going so the rest of the PDF is still usable.
      pages.push(`[Page ${pageNumber}]\n[OCR could not read this page]`);
    }
  }
  return pages.join("\n\n");
}

async function extractFresh(
  item: VaultItem,
  blob: Blob,
): Promise<{ text: string; method: VaultContentMethod }> {
  if (item.kind === "text") {
    const text = normalize(await blob.text());
    if (!text) throw new VaultContentUnavailableError("This text file appears to be empty.");
    return { text, method: "text" };
  }

  if (item.kind === "pdf") {
    try {
      const doc = await extractPdfDoc(blob, item.name);
      const text = normalize(pdfDocToText(doc));
      if (!text) throw new PdfNotExtractableError();
      return { text, method: "pdf-text" };
    } catch (error) {
      if (!(error instanceof PdfNotExtractableError)) throw error;
      // No text layer — this is a scanned/image PDF. Fall back to OCR
      // instead of treating "no text layer" as fatal.
      const text = normalize(await ocrPdf(blob));
      if (!text) throw new VaultContentUnavailableError("Unable to extract readable text from this file.");
      return { text, method: "pdf-ocr" };
    }
  }

  if (item.kind === "image") {
    try {
      const text = normalize(await ocrImage(blob));
      return { text, method: "ocr" };
    } catch (error) {
      throw new VaultContentUnavailableError(
        error instanceof OcrFailedError ? error.message : "OCR failed for this image.",
      );
    }
  }

  throw new VaultContentUnavailableError(
    "This file type isn't supported for AI reading yet — only PDFs, images, and text files are.",
  );
}

/**
 * Resolves a Vault item to readable text: serves a valid cached extraction
 * if one exists, otherwise extracts/OCRs it fresh and caches the result.
 * Throws `VaultContentUnavailableError` (a safe, user-facing message —
 * never a raw stack trace) if the content genuinely can't be read.
 */
export async function getVaultContent(vaultItemId: string): Promise<VaultContentResult> {
  const item = await vaultRepository.get(vaultItemId);
  if (!item) throw new VaultContentUnavailableError("I couldn't find that file.");

  const cached = await vaultContentRepository.get(vaultItemId);
  if (cached && cached.sourceUpdatedAt === item.updatedAt) {
    const { text, truncated } = truncate(cached.text);
    return { text, method: cached.method, cached: true, truncated };
  }

  const blob = await vaultRepository.getBlob(vaultItemId);
  if (!blob) throw new VaultContentUnavailableError("This file has no stored data to read.");

  const { text, method } = await extractFresh(item, blob);
  await vaultContentRepository.put(vaultItemId, text, method, item.updatedAt);

  const { text: bounded, truncated } = truncate(text);
  return { text: bounded, method, cached: false, truncated };
}
