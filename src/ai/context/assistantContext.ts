import { examRepository } from "@/data/repositories/exams.repository";
import { settingsRepository } from "@/data/repositories/settings.repository";
import type { AIMessage } from "@/ai/types";

/**
 * Minimal-context builder.
 *
 * The assistant only ever receives the small slice of local data required for
 * the current request. Never serialise the whole database into a prompt.
 */
export interface AssistantContext {
  today: string;
  activeExam?: { name: string; examDate: string | null; daysRemaining: number | null };
  nearestExam?: { name: string; examDate: string | null; daysRemaining: number | null };
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const diff = new Date(`${date.slice(0, 10)}T00:00:00`).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export async function buildAssistantContext(): Promise<AssistantContext> {
  const settings = await settingsRepository.get();
  const activeExam = settings.activeExamId
    ? await examRepository.get(settings.activeExamId)
    : undefined;
  const nearestExam = await examRepository.nearestUpcoming();
  const compact = (exam: typeof activeExam) =>
    exam
      ? { name: exam.name, examDate: exam.examDate, daysRemaining: daysUntil(exam.examDate) }
      : undefined;
  const active = compact(activeExam);
  const nearest = compact(nearestExam);
  return {
    today: new Date().toISOString().slice(0, 10),
    ...(active ? { activeExam: active } : {}),
    ...(nearest ? { nearestExam: nearest } : {}),
  };
}

export function systemPrompt(context: AssistantContext): AIMessage {
  return {
    role: "system",
    content: [
      "You are a personal exam-preparation assistant running inside a private, offline-first app.",
      `Today is ${context.today}.`,
      context.activeExam
        ? `The active exam is "${context.activeExam.name}"${
            context.activeExam.daysRemaining !== null
              ? ` in ${context.activeExam.daysRemaining} days`
              : ""
          }.`
        : "There is no active exam selected.",
      context.nearestExam
        ? `The nearest upcoming exam is "${context.nearestExam.name}"${
            context.nearestExam.daysRemaining !== null
              ? ` in ${context.nearestExam.daysRemaining} days`
              : ""
          }.`
        : "There are no upcoming exams.",
      "Use local tools for local data and actions. Never invent records or IDs.",
      "Vault search/list tools return metadata only, never file contents. To answer questions " +
        "about what a specific Vault PDF or image actually says, first find it with a Vault " +
        "search/list/get tool, then call vaultReadContent with its id before answering.",
      "Be concise, accurate and practical. Say plainly when you are unsure.",
    ].join(" "),
  };
}
