/**
 * Vault → PDFs editing architecture.
 *
 * `VaultPdfDoc` (see shared/types/domain.ts) is a small structured-text
 * representation — a title plus a list of sections, each with an optional
 * heading, paragraphs, and bullets. It is the "editable representation" the
 * AI edit flow reads and rewrites; `renderPdfDoc` turns it into a real PDF
 * file (actual `%PDF-…` bytes via pdf-lib, not HTML).
 *
 * This is intentionally a small, literal renderer — plain A4 pages, one
 * body font, no images. It is structured so each of the instructions this
 * is meant to grow into later maps to one clear extension point, called out
 * inline below:
 *   - fonts / font sizes / colors  → swap `bodyFont`/`headingFont` and the
 *     hard-coded `rgb(...)`/size constants for values read off the spec.
 *   - add/remove text, add tables  → already flows through naturally, since
 *     paragraphs/bullets/sections are just data; a `table` section variant
 *     can be added alongside `paragraphs`/`bullets`.
 *   - images, resize/reposition    → `page.drawImage` alongside `drawText`,
 *     once VaultPdfSection grows an `images` field.
 *   - spacing, margins, page breaks, headers/footers, page numbers,
 *     columns, cover pages → all a function of the layout constants and
 *     the `cursor`/`newPage` bookkeeping already isolated below.
 *
 * Requires the `pdf-lib` package (browser-safe, no Node APIs). Not present
 * in this checkout's dependency list — add it (`bun add pdf-lib`) before
 * building.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { VaultPdfSection } from "@/shared/types/domain";

export interface PdfDocSpec {
  title: string;
  sections: VaultPdfSection[];
}

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TITLE_SIZE = 22;
const HEADING_SIZE = 14;
const BODY_SIZE = 11;
const BODY_LEADING = 15;
const INK = rgb(0.11, 0.11, 0.11);
const MUTED = rgb(0.4, 0.4, 0.4);

/** Greedy word-wrap for a single font/size against a max width in points. */
function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Cursor {
  page: PDFPage;
  y: number;
}

/**
 * Renders a structured document spec into a real, downloadable A4 PDF.
 * Throws if the spec has no visible content.
 */
export async function renderPdfDoc(spec: PdfDocSpec): Promise<Blob> {
  const title = spec.title.trim() || "Untitled document";
  const hasContent = spec.sections.some(
    (section) =>
      section.heading?.trim() ||
      section.paragraphs?.some((p) => p.trim()) ||
      section.bullets?.some((b) => b.trim()),
  );
  if (!hasContent) throw new Error("There's no content available for this document.");

  const pdf = await PDFDocument.create();
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const headingFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  function newPage(): Cursor {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return { page, y: PAGE_HEIGHT - MARGIN };
  }

  function ensureSpace(cursor: Cursor, needed: number): Cursor {
    if (cursor.y - needed < MARGIN) return newPage();
    return cursor;
  }

  function drawWrapped(
    cursor: Cursor,
    text: string,
    font: PDFFont,
    size: number,
    leading: number,
    color = INK,
    indent = 0,
  ): Cursor {
    let current = cursor;
    for (const line of wrapLine(text, font, size, CONTENT_WIDTH - indent)) {
      current = ensureSpace(current, leading);
      current.page.drawText(line, {
        x: MARGIN + indent,
        y: current.y - size,
        size,
        font,
        color,
      });
      current = { page: current.page, y: current.y - leading };
    }
    return current;
  }

  let cursor = newPage();

  // Title + generated-on date, mirroring the header treatment used
  // elsewhere in the app's document generation.
  cursor = drawWrapped(cursor, title, headingFont, TITLE_SIZE, TITLE_SIZE + 6, INK);
  cursor = drawWrapped(
    cursor,
    `Updated ${new Date().toLocaleDateString()}`,
    bodyFont,
    9,
    18,
    MUTED,
  );
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y + 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y + 6 },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
  cursor = { page: cursor.page, y: cursor.y - 10 };

  for (const section of spec.sections) {
    if (section.heading?.trim()) {
      cursor = ensureSpace(cursor, HEADING_SIZE + 10);
      cursor = drawWrapped(cursor, section.heading.trim(), headingFont, HEADING_SIZE, 20, INK);
    }
    for (const paragraph of section.paragraphs ?? []) {
      if (!paragraph.trim()) continue;
      cursor = drawWrapped(cursor, paragraph.trim(), bodyFont, BODY_SIZE, BODY_LEADING);
      cursor = { page: cursor.page, y: cursor.y - 4 };
    }
    for (const bullet of section.bullets ?? []) {
      if (!bullet.trim()) continue;
      cursor = drawWrapped(
        cursor,
        `•  ${bullet.trim()}`,
        bodyFont,
        BODY_SIZE,
        BODY_LEADING,
        INK,
        12,
      );
    }
    cursor = { page: cursor.page, y: cursor.y - 10 };
  }

  // pdf-lib returns a Uint8Array whose ArrayBuffer type is too generic for
  // BlobPart's DOM typing (Uint8Array<ArrayBufferLike> vs the required
  // Uint8Array<ArrayBuffer>) — copy into a fresh, concretely-typed array.
  const bytes = new Uint8Array(await pdf.save());
  return new Blob([bytes], { type: "application/pdf" });
}

/** Strips a file extension for use as a seed document title. */
export function titleFromFileName(name: string): string {
  const withoutExt = name.replace(/\.[^./]+$/, "");
  return withoutExt.trim() || name;
}
