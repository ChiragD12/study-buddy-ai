import type { DocumentSpec } from "@/features/documents/documentGenerator";

/**
 * Printable visual sheets.
 *
 * For text-heavy revision material the pipeline is:
 *   structured content -> local HTML/SVG/canvas renderer -> PNG
 * This keeps text crisp and factually exact. AI image generation is NOT used
 * for ordinary revision sheets (see the ChatGPT handoff service instead).
 */
export interface ImageSheetOptions {
  width: number;
  height: number;
  scale?: number;
}

export interface ImageSheetRenderer {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
  render(spec: DocumentSpec, options: ImageSheetOptions): Promise<Blob>;
}

export const canvasSheetRenderer: ImageSheetRenderer = {
  id: "canvas-sheet",
  label: "Canvas revision sheet",
  available: false,
  async render() {
    throw new Error("Printable image rendering is not implemented yet.");
  },
};
