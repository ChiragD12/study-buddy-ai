/**
 * Local document generation boundary.
 *
 * The model (eventually) produces structured CONTENT; the app renders the
 * actual artifact on-device. No external document SaaS, and never ask a model
 * for binary output.
 *
 * `DocumentSection`/`DocumentSpec` intentionally reuse
 * `VaultPdfSection`/the `VaultPdfDoc` shape from shared/types/domain.ts —
 * that's the same structured document representation the Vault → PDFs AI
 * editor reads and rewrites (see features/vault/pdfDoc.ts), so a document
 * built here can be saved straight into the Vault and edited later without
 * translating through a second, narrower copy of the same shape.
 */
import type { VaultPdfSection } from "@/shared/types/domain";

export type DocumentTemplate = "revision-sheet" | "printable-notes" | "writing-exercise";

export type DocumentSection = VaultPdfSection;

export interface DocumentSpec {
  title: string;
  subtitle?: string;
  template: DocumentTemplate;
  /** Layout hint; not yet rendered by either the print/HTML path or the PDF renderer — carried through, not dropped. */
  columns?: 1 | 2;
  sections: DocumentSection[];
}

export interface GeneratedDocument {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export interface DocumentGenerator {
  readonly id: string;
  readonly label: string;
  /** False until a concrete renderer is implemented (see README roadmap). */
  readonly available: boolean;
  generate(spec: DocumentSpec): Promise<GeneratedDocument>;
}

export class DocumentGeneratorUnavailableError extends Error {
  constructor(label: string) {
    super(`${label} is not implemented yet.`);
    this.name = "DocumentGeneratorUnavailableError";
  }
}

/**
 * Print-based A4 PDF generator placeholder. A future implementation renders
 * the spec into an offscreen A4 layout and produces a PDF locally.
 */
export const a4PdfGenerator: DocumentGenerator = {
  id: "a4-pdf",
  label: "Print-ready document",
  available: true,
  async generate(spec) {
    if (!spec.sections.length) throw new Error("There's no content available for this document.");
    const escape = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const sections = spec.sections
      .map(
        (section) =>
          `<section>${section.heading ? `<h2>${escape(section.heading)}</h2>` : ""}${
            section.paragraphs?.map((paragraph) => `<p>${escape(paragraph)}</p>`).join("") ?? ""
          }${
            section.bullets?.length
              ? `<ul>${section.bullets.map((bullet) => `<li>${escape(bullet)}</li>`).join("")}</ul>`
              : ""
          }</section>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(spec.title)}</title><style>
      @page{size:A4;margin:18mm}body{font-family:Georgia,serif;color:#1c1c1c;line-height:1.55;max-width:760px;margin:0 auto}h1{font:700 30px/1.15 Georgia,serif;margin:0 0 6px}h2{font:700 18px/1.25 Georgia,serif;border-bottom:1px solid #d6d1c8;padding-bottom:5px;margin:24px 0 8px}p{margin:7px 0}ul{margin:7px 0 14px;padding-left:24px}header{border-bottom:2px solid #1c1c1c;padding-bottom:14px;margin-bottom:18px}.subtitle{color:#666;font:14px Arial,sans-serif}@media print{section{break-inside:avoid}}
      </style></head><body><header><h1>${escape(spec.title)}</h1>${spec.subtitle ? `<div class="subtitle">${escape(spec.subtitle)}</div>` : ""}<div class="subtitle">Created ${new Date().toLocaleDateString()}</div></header>${sections}</body></html>`;
    return {
      blob: new Blob([html], { type: "text/html" }),
      filename: `${
        spec.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "study-document"
      }.html`,
      mimeType: "text/html",
    };
  },
};

export const documentGenerators: DocumentGenerator[] = [a4PdfGenerator];
