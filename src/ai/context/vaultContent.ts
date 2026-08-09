/**
 * Vault file → readable text, for the AI assistant.
 *
 * Extraction is lazy and cached. PDF extraction and OCR are dynamically
 * imported so neither enters the initial application module graph.
 */

import { vaultRepository } from "@/data/repositories/vault.repository";
import { vaultContentRepository } from "@/data/repositories/vaultContent.repository";
import type { PdfDocSpec } from "@/features/vault/pdfDoc";
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
  cached: boolean;
  truncated: boolean;
}

const MAX_CHARS = 24_000;

function normalize(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CHARS) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, MAX_CHARS)}\n\n[Content truncated — this document is longer than shown here.]`,
    truncated: true,
  };
}

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
  const { renderPdfPagesToImages } = await import("@/features/vault/pdfExtract");
  const { ocrImage } = await import("@/features/vault/ocr");

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

    if (!text) {
      throw new VaultContentUnavailableError("This text file appears to be empty.");
    }

    return { text, method: "text" };
  }

  if (item.kind === "pdf") {
    const { extractPdfDoc, PdfNotExtractableError } = await import("@/features/vault/pdfExtract");

    try {
      const doc = await extractPdfDoc(blob, item.name);
      const text = normalize(pdfDocToText(doc));

      if (!text) {
        throw new PdfNotExtractableError();
      }

      return { text, method: "pdf-text" };
    } catch (error) {
      if (!(error instanceof PdfNotExtractableError)) {
        throw error;
      }

      const text = normalize(await ocrPdf(blob));

      if (!text) {
        throw new VaultContentUnavailableError("Unable to extract readable text from this file.");
      }

      return { text, method: "pdf-ocr" };
    }
  }

  if (item.kind === "image") {
    try {
      const { ocrImage, OcrFailedError } = await import("@/features/vault/ocr");

      const text = normalize(await ocrImage(blob));

      return { text, method: "ocr" };
    } catch (error) {
      const { OcrFailedError } = await import("@/features/vault/ocr");

      throw new VaultContentUnavailableError(
        error instanceof OcrFailedError ? error.message : "OCR failed for this image.",
      );
    }
  }

  throw new VaultContentUnavailableError(
    "This file type isn't supported for AI reading yet — only PDFs, images, and text files are.",
  );
}

export async function getVaultContent(vaultItemId: string): Promise<VaultContentResult> {
  const item = await vaultRepository.get(vaultItemId);

  if (!item) {
    throw new VaultContentUnavailableError("I couldn't find that file.");
  }

  const cached = await vaultContentRepository.get(vaultItemId);

  if (cached && cached.sourceUpdatedAt === item.updatedAt) {
    const { text, truncated } = truncate(cached.text);

    return {
      text,
      method: cached.method,
      cached: true,
      truncated,
    };
  }

  const blob = await vaultRepository.getBlob(vaultItemId);

  if (!blob) {
    throw new VaultContentUnavailableError("This file has no stored data to read.");
  }

  const { text, method } = await extractFresh(item, blob);

  await vaultContentRepository.put(vaultItemId, text, method, item.updatedAt);

  const { text: bounded, truncated } = truncate(text);

  return {
    text: bounded,
    method,
    cached: false,
    truncated,
  };
}
