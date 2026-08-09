/**
 * Vault → PDFs editing architecture.
 *
 * `VaultPdfDoc` (see shared/types/domain.ts) is a small structured-text
 * representation — a title, optional subtitle, and a list of sections, each
 * with an optional heading, paragraphs, and bullets. This is the SAME shape
 * `DocumentSpec` in features/documents/documentGenerator.ts builds from
 * Notes/exam/writing-prompt content (see routes/documents.tsx) — there is one
 * structured-document representation in the app, not a second one invented
 * for the PDF editor. `PdfDocSpec` below just narrows out `DocumentSpec`'s
 * `template` field (a generation-time selector, not part of the finished
 * document's structure). It is the editable representation the AI edit flow
 * reads and rewrites; `renderPdfDoc` turns it into a real PDF file (actual
 * `%PDF-…` bytes via pdf-lib, not HTML).
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
 * Requires the `pdf-lib` and `@pdf-lib/fontkit` packages (both browser-safe,
 * no Node APIs), plus `regenerator-runtime` — see the import note below.
 * Not present in this checkout's dependency list — add them
 * (`bun add pdf-lib @pdf-lib/fontkit regenerator-runtime`) before building.
 *
 * FONT / UNICODE: pdf-lib's built-in `StandardFonts` (Helvetica etc.) can
 * only encode WinAnsi (Windows-1252) — anything outside that (most
 * non-Latin scripts, several "smart" bullet/dash glyphs real-world text
 * commonly contains) throws `WinAnsi cannot encode "…"` instead of
 * rendering. Rather than stripping or substituting characters, this embeds
 * a real Unicode font (Noto Sans, OFL-licensed, via `@pdf-lib/fontkit` —
 * pdf-lib's own supported path for custom fonts) so normal Unicode content
 * in Latin-script text (accented characters, smart punctuation, common
 * bullet/dash variants, currency symbols, etc.) renders correctly. This
 * covers the Latin Extended range, not every script — non-Latin scripts
 * (Devanagari, CJK, Arabic, …) would need additional per-script fonts and
 * run-splitting logic, which is out of scope here.
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
// @pdf-lib/fontkit's WOFF decompression path relies on `regeneratorRuntime`
// being globally available. Babel-based toolchains usually inject this
// automatically; Vite's esbuild-based pipeline does not, so it has to be
// polyfilled explicitly or font embedding fails at runtime with
// "regeneratorRuntime is not defined".
import "regenerator-runtime/runtime";

import type { VaultPdfSection } from "@/shared/types/domain";

// Vite-specific asset imports (`?url`) resolve to a fingerprinted asset URL
// at build time. Noto Sans, Latin Extended subset, SIL Open Font License —
// see src/assets/fonts/LICENSE.
import bodyFontUrl from "@/assets/fonts/noto-sans-latin-ext-400-normal.woff?url";
import boldFontUrl from "@/assets/fonts/noto-sans-latin-ext-700-normal.woff?url";

export interface PdfDocSpec {
  title: string;
  subtitle?: string;
  columns?: 1 | 2;
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
  pdf.registerFontkit(fontkit);
  const [bodyFontBytes, boldFontBytes] = await Promise.all([
    fetch(bodyFontUrl).then((response) => response.arrayBuffer()),
    fetch(boldFontUrl).then((response) => response.arrayBuffer()),
  ]);
  const bodyFont = await pdf.embedFont(bodyFontBytes, { subset: true });
  const headingFont = await pdf.embedFont(boldFontBytes, { subset: true });

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

  // Title + optional subtitle + generated-on date, mirroring the header
  // treatment used in the app's HTML document generator so a document saved
  // to the Vault and later regenerated here keeps the same header structure.
  cursor = drawWrapped(cursor, title, headingFont, TITLE_SIZE, TITLE_SIZE + 6, INK);
  if (spec.subtitle?.trim()) {
    cursor = drawWrapped(cursor, spec.subtitle.trim(), bodyFont, 10, 16, MUTED);
  }
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
