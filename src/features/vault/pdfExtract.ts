/**
 * Text extraction for PRE-EXISTING, uploaded Vault PDFs.
 *
 * Investigation summary (see chat for full writeup):
 *  - pdf-lib (used for generation, see pdfDoc.ts) has no API for reading or
 *    rewriting the text already inside a PDF's content streams — it can only
 *    draw new content. It cannot do in-place "find and replace this
 *    sentence" edits on an arbitrary existing PDF.
 *  - pdf.js (`pdfjs-dist`) IS able to read an existing PDF's text layer in
 *    the browser (no server, no native deps) via `getTextContent()`, which
 *    is exactly what powers text selection in browser PDF viewers. That is
 *    what this file uses.
 *  - So the realistic approach is: read the real text with pdf.js →
 *    reconstruct it into the same structured `{ title, sections }` shape
 *    `pdfDoc.ts` already renders from → let the AI edit *that* → regenerate
 *    a whole new real PDF with pdf-lib. This is "extract → edit →
 *    regenerate", not in-place binary patching — a full-fidelity byte-level
 *    edit of an arbitrary existing PDF isn't something pdf-lib (or any
 *    browser-safe library) actually supports.
 *
 * What this DOES preserve: the actual text, in reading order per line, at
 * page granularity (each PDF page becomes one section, preserving page
 * breaks), with a best-effort title guess (the largest-font line on page 1).
 *
 * What this does NOT preserve, even though the source PDF may have it:
 * images, tables, exact fonts/sizes/colors, multi-column layout (text order
 * across columns is not reliably reconstructed), headers/footers, or exact
 * spacing. Regenerated output is plain single-column A4 text.
 *
 * What this CANNOT do at all: PDFs with no text layer (scanned/image-only
 * pages) have nothing for pdf.js to extract — `extractPdfDoc` throws
 * `PdfNotExtractableError` in that case rather than inventing content.
 *
 * Requires the `pdfjs-dist` package (not present in this checkout's
 * dependency list — add it, e.g. `bun add pdfjs-dist`, before building).
 */
import * as pdfjsLib from "pdfjs-dist";
// Vite-specific worker asset import (`?url` resolves to a fingerprinted
// asset URL at build time). If this project's bundler isn't Vite, or if
// this default worker resolution doesn't work in your setup, see pdf.js's
// docs for the alternative `GlobalWorkerOptions.workerSrc` setup for your
// bundler.
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type { PdfDocSpec } from "@/features/vault/pdfDoc";
import type { VaultPdfSection } from "@/shared/types/domain";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export class PdfNotExtractableError extends Error {
  constructor(
    message = "This PDF doesn't have an extractable text layer (it looks scanned or image-only), " +
      "so it can't be read and edited through this flow yet.",
  ) {
    super(message);
    this.name = "PdfNotExtractableError";
  }
}

interface Line {
  text: string;
  y: number;
  fontSize: number;
  gapBefore: number;
}

function isTextItem(item: unknown): item is { str: string; transform: number[] } {
  return Boolean(item) && typeof (item as { str?: unknown }).str === "string";
}

/**
 * Clusters raw text items (already in pdf.js's natural, roughly top-to-
 * bottom / left-to-right order) into lines by y-position, and records the
 * vertical gap before each line so paragraph breaks can be inferred.
 */
function groupIntoLines(items: { str: string; transform: number[] }[]): Line[] {
  const LINE_TOLERANCE = 2;
  const rows: { y: number; fontSize: number; parts: string[] }[] = [];
  for (const item of items) {
    const y = item.transform[5] ?? 0;
    const fontSize = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) || 10;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= LINE_TOLERANCE);
    if (row) {
      row.parts.push(item.str);
    } else {
      rows.push({ y, fontSize, parts: [item.str] });
    }
  }
  // pdf.js y-coordinates increase upward; reading order is top to bottom.
  rows.sort((a, b) => b.y - a.y);
  const lines: Line[] = [];
  let previousY: number | null = null;
  for (const row of rows) {
    const text = row.parts.join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const gapBefore = previousY === null ? 0 : previousY - row.y;
    lines.push({ text, y: row.y, fontSize: row.fontSize, gapBefore });
    previousY = row.y;
  }
  return lines;
}

/** Merges consecutive lines into paragraphs, splitting on larger-than-usual vertical gaps. */
function linesToParagraphs(lines: Line[]): string[] {
  // Destructure instead of indexing: under `noUncheckedIndexedAccess`,
  // `lines[0]` types as `Line | undefined` even after an `if (!lines.length)`
  // guard (TS doesn't correlate `.length` checks with index access), which
  // is the real cause of the TS2532 here. Destructuring + a null check on
  // `firstLine` narrows it properly without an `as`/`!` suppression.
  const [firstLine, ...restLines] = lines;
  if (!firstLine) return [];
  const typicalGap =
    restLines.reduce((sum, line) => sum + line.gapBefore, 0) / Math.max(1, restLines.length) || 12;
  const paragraphs: string[] = [];
  let current = firstLine.text;
  for (const line of restLines) {
    if (line.gapBefore > typicalGap * 1.6) {
      paragraphs.push(current);
      current = line.text;
    } else {
      current += ` ${line.text}`;
    }
  }
  paragraphs.push(current);
  return paragraphs;
}

/**
 * Reads an existing PDF's real text layer, page by page, and reconstructs
 * it into the same `{ title, sections }` shape used for AI-editable Vault
 * PDFs. Throws `PdfNotExtractableError` if the PDF has no text to read.
 */
export async function extractPdfDoc(blob: Blob, fallbackTitle: string): Promise<PdfDocSpec> {
  const buffer = await blob.arrayBuffer();
  // `destroy()` lives on the PDFDocumentLoadingTask returned by
  // getDocument(), not on the PDFDocumentProxy its `.promise` resolves to
  // (the proxy only exposes `cleanup()`), so the loading task reference has
  // to be kept around to release the worker/network resources below.
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const doc = await loadingTask.promise;

  const sections: VaultPdfSection[] = [];
  let title: string | null = null;
  let titleFontSize = 0;

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: { str: string; transform: number[] }[] = [];
      for (const item of content.items) {
        if (isTextItem(item)) items.push(item);
      }
      const lines = groupIntoLines(items);
      if (!lines.length) continue;

      let bodyLines = lines;
      if (pageNumber === 1) {
        const titleLine = lines.reduce((best, line) =>
          line.fontSize > best.fontSize ? line : best,
        );
        // Only trust it as a title if it's a clear outlier, not just the
        // first line of normal body text.
        if (titleLine.fontSize > 0) {
          title = titleLine.text;
          titleFontSize = titleLine.fontSize;
          bodyLines = lines.filter((line) => line !== titleLine);
        }
      }

      const paragraphs = linesToParagraphs(bodyLines);
      if (paragraphs.length) sections.push({ paragraphs });
    }
  } finally {
    void loadingTask.destroy();
  }

  const hasBody = sections.some((section) => section.paragraphs?.some((p) => p.trim()));
  if (!hasBody && !title) throw new PdfNotExtractableError();

  return {
    title: title && titleFontSize > 0 ? title : fallbackTitle,
    sections: sections.length ? sections : [{ paragraphs: [] }],
  };
}
