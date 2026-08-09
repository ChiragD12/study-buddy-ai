/**
 * OCR for Vault images and scanned/image-only PDF pages.
 *
 * Uses tesseract.js entirely in the browser.
 * Tesseract is dynamically imported so it is NOT part of the initial
 * application module graph.
 */

export class OcrFailedError extends Error {
  constructor(message = "OCR failed for this image.") {
    super(message);
    this.name = "OcrFailedError";
  }
}

type TesseractWorker = Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>;

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(({ createWorker }) => createWorker("eng"))
      .catch((error: unknown) => {
        workerPromise = null;
        throw error;
      });
  }

  return workerPromise;
}

/**
 * Runs OCR on an image (or a single rendered PDF page image) and returns
 * the recognised text. Throws OcrFailedError if OCR fails or finds no text.
 */
export async function ocrImage(blob: Blob): Promise<string> {
  let worker: TesseractWorker;

  try {
    worker = await getWorker();
  } catch {
    throw new OcrFailedError("The OCR engine couldn't be loaded (check your network connection).");
  }

  try {
    const { data } = await worker.recognize(blob as unknown as string);

    const text = (data.text ?? "").trim();

    if (!text) {
      throw new OcrFailedError("No readable text was found in this image.");
    }

    return text;
  } catch (error) {
    if (error instanceof OcrFailedError) {
      throw error;
    }

    throw new OcrFailedError();
  }
}
