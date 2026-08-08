import { createGeminiProvider } from "@/ai/providers/gemini";
import { getGeminiKey } from "@/ai/providers/keyStore";
import type { AIProvider } from "@/ai/types";
import { settingsRepository } from "@/data/repositories/settings.repository";

/** Resolve the active provider from the persisted Dexie settings. */
export async function resolveProvider(): Promise<AIProvider | null> {
  if (!getGeminiKey()) return null;
  const settings = await settingsRepository.get();
  if (settings.aiProvider !== "gemini") return null;
  return createGeminiProvider(settings.geminiModel);
}

export { createGeminiProvider };
export { DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from "@/ai/providers/models";
