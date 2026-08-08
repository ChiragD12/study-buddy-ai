/**
 * OCR for Vault images and scanned/image-only PDF pages.
 *
 * Uses `tesseract.js`, which runs entirely in the browser (WASM + a web
 * worker) — no server, no native deps, consistent with this app's
 * offline-first, local-only architecture. On first use in a session it
 * fetches the OCR engine core and English language data from tesseract.js's
 * default CDN and lets the browser cache them (standard HTTP/CacheStorage
 * caching); subsequent OCR calls reuse the cached worker. That first-use
 * fetch requires network access — if a fully offline first-run is required
 * later, the core/lang-data assets can be self-hosted and pointed at via
 * `createWorker`'s `langPath`/`corePath` options, but that's out of scope
 * for this pass.
 *
 * Kept isolated here so OCR logic never leaks into the extraction/tool
 * layer — callers only ever see `ocrImage()` and `OcrFailedError`.
 */
import { createWorker, type Worker } from "tesseract.js";

export class OcrFailedError extends Error {
  constructor(message = "OCR failed for this image.") {
    super(message);
    this.name = "OcrFailedError";
  }
}

// Lazily created, then reused for every OCR call in this session — spinning
// up a tesseract.js worker (loading the wasm core + language data) is the
// expensive part, so one shared worker avoids paying that cost per image.
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng").catch((error: unknown) => {
      // Don't cache a rejected promise — the next call should retry.
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

/**
 * Runs OCR on an image (or a single rendered PDF page image) and returns
 * the recognised text. Throws `OcrFailedError` — never returns fabricated
 * or placeholder content — if OCR fails or finds no readable text.
 */
export async function ocrImage(blob: Blob): Promise<string> {
  let worker: Worker;
  try {
    worker = await getWorker();
  } catch {
    throw new OcrFailedError("The OCR engine couldn't be loaded (check your network connection).");
  }

  try {
    // tesseract.js accepts a Blob/File directly at runtime (it reads it via
    // FileReader internally); its published TS types only list
    // string/HTMLImageElement/etc, so this cast just bridges that gap.
    const { data } = await worker.recognize(blob as unknown as string);
    const text = (data.text ?? "").trim();
    if (!text) throw new OcrFailedError("No readable text was found in this image.");
    return text;
  } catch (error) {
    if (error instanceof OcrFailedError) throw error;
    throw new OcrFailedError();
  }
}
