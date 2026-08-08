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
  const exam = activeExam ?? (await examRepository.nearestUpcoming());
  return {
    today: new Date().toISOString().slice(0, 10),
    ...(exam
      ? {
          nearestExam: {
            name: exam.name,
            examDate: exam.examDate,
            daysRemaining: daysUntil(exam.examDate),
          },
        }
      : {}),
  };
}

export function systemPrompt(context: AssistantContext): AIMessage {
  const exam = context.nearestExam;
  return {
    role: "system",
    content: [
      "You are a personal exam-preparation assistant running inside a private, offline-first app.",
      `Today is ${context.today}.`,
      exam
        ? `The user's nearest exam is "${exam.name}"${
            exam.daysRemaining !== null ? ` in ${exam.daysRemaining} days` : ""
          }.`
        : "The user has not added any exams yet.",
      "Be concise, accurate and practical. Say plainly when you are unsure.",
    ].join(" "),
  };
}
