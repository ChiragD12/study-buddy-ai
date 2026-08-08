import { createGeminiProvider } from "@/ai/providers/gemini";
import { getGeminiKey } from "@/ai/providers/keyStore";
import type { AIProvider } from "@/ai/types";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Resolve the active provider, or null when the user has not configured one. */
export function resolveProvider(model = DEFAULT_GEMINI_MODEL): AIProvider | null {
  if (!getGeminiKey()) return null;
  return createGeminiProvider(model);
}

export { createGeminiProvider };
