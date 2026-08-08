/**
 * Local document generation boundary.
 *
 * The model (eventually) produces structured CONTENT; the app renders the
 * actual artifact on-device. No external document SaaS, and never ask a model
 * for binary output.
 */

export type DocumentTemplate = "revision-sheet" | "printable-notes" | "writing-exercise";

export interface DocumentSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface DocumentSpec {
  title: string;
  subtitle?: string;
  template: DocumentTemplate;
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
  label: "A4 PDF",
  available: false,
  async generate() {
    throw new DocumentGeneratorUnavailableError("A4 PDF generation");
  },
};

export const documentGenerators: DocumentGenerator[] = [a4PdfGenerator];
