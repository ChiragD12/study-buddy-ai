/**
 * Gemini API key storage.
 *
 * The key is supplied by the user in Settings and stays on the device
 * (localStorage). It is never sent anywhere except directly to Google's API
 * from the browser. Warn users not to do this on shared devices.
 */
const KEY_STORAGE = "exam-assistant.gemini.apiKey";

export function getGeminiKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(KEY_STORAGE);
}

export function setGeminiKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

export function clearGeminiKey(): void {
  localStorage.removeItem(KEY_STORAGE);
}

export function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}
