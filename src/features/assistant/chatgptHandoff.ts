/**
 * ChatGPT image-generation handoff.
 *
 * Strictly user-initiated. Only the content the user selected for the prompt
 * is included — never notes, vault contents or conversation history at large.
 * No undocumented iOS deep links are assumed: we expose copy + open-in-browser
 * and leave room for a supported handoff if one becomes available.
 */

export interface ImagePromptRequest {
  subject: string;
  /** Optional selected snippet the user explicitly chose to include. */
  selectedContent?: string;
  style?: "diagram" | "infographic" | "mind-map";
}

export interface ImagePromptHandoff {
  prompt: string;
  /** Shown to the user before anything leaves the device. */
  preview: string;
  openUrl: string;
}

const CHATGPT_URL = "https://chat.openai.com/";

export function buildImagePrompt(request: ImagePromptRequest): ImagePromptHandoff {
  const style = request.style ?? "diagram";
  const prompt = [
    `Create a clean, high-contrast educational ${style} about: ${request.subject}.`,
    "Use accurate labels, clear hierarchy and legible typography suitable for exam revision.",
    request.selectedContent ? `Base it strictly on this content:\n${request.selectedContent}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prompt, preview: prompt, openUrl: CHATGPT_URL };
}

export async function copyPrompt(prompt: string): Promise<void> {
  await navigator.clipboard.writeText(prompt);
}
