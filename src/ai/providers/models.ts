/**
 * Text-generation models supported by the Gemini API as of August 2026.
 * Keep this as the one static catalogue used by Settings and provider resolution.
 */
export const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

export const DEFAULT_GEMINI_MODEL: GeminiModel = "gemini-3.6-flash";

export function isGeminiModel(model: string): model is GeminiModel {
  return (GEMINI_MODELS as readonly string[]).includes(model);
}
