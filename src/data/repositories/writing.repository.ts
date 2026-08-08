import { getDb } from "@/data/db/db";
import { newId, now, timestamps } from "@/data/repositories/util";
import type { ID, WritingAttempt, WritingPrompt, WritingStatus } from "@/shared/types/domain";

export type PromptDraft = Pick<WritingPrompt, "title" | "track" | "format"> &
  Partial<WritingPrompt>;

export interface WritingRepository {
  listPrompts(): Promise<WritingPrompt[]>;
  getPrompt(id: ID): Promise<WritingPrompt | undefined>;
  createPrompt(draft: PromptDraft): Promise<WritingPrompt>;
  updatePrompt(id: ID, patch: Partial<WritingPrompt>): Promise<void>;
  removePrompt(id: ID): Promise<void>;
  /**
   * Persists the live working answer for a prompt. Called on every
   * (debounced) keystroke so the answer survives a refresh or navigating
   * away. Auto-advances status from "not-started" to "in-progress" the
   * first time real content is written; never auto-completes a prompt.
   */
  saveDraft(id: ID, content: string): Promise<void>;
  setStatus(id: ID, status: WritingStatus): Promise<void>;
  listAttempts(promptId: ID): Promise<WritingAttempt[]>;
  /** Attempts are append-only: saving a snapshot never overwrites earlier work. */
  saveAttempt(input: {
    promptId: ID;
    content: string;
    durationSeconds: number;
  }): Promise<WritingAttempt>;
  removeAttempt(id: ID): Promise<void>;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export const writingRepository: WritingRepository = {
  listPrompts() {
    return getDb().writingPrompts.orderBy("updatedAt").reverse().toArray();
  },
  getPrompt(id) {
    return getDb().writingPrompts.get(id);
  },
  async createPrompt(draft) {
    const prompt: WritingPrompt = {
      id: newId(),
      title: draft.title,
      brief: draft.brief,
      track: draft.track,
      format: draft.format,
      topic: draft.topic,
      status: draft.status ?? "not-started",
      wordLimit: draft.wordLimit,
      timeLimitMinutes: draft.timeLimitMinutes,
      examId: draft.examId ?? null,
      draftContent: draft.draftContent ?? "",
      draftUpdatedAt: undefined,
      ...timestamps(),
    };
    await getDb().writingPrompts.add(prompt);
    return prompt;
  },
  async updatePrompt(id, patch) {
    await getDb().writingPrompts.update(id, { ...patch, updatedAt: now() });
  },
  async removePrompt(id) {
    await getDb().transaction("rw", getDb().writingPrompts, getDb().writingAttempts, async () => {
      await getDb().writingPrompts.delete(id);
      await getDb().writingAttempts.where("promptId").equals(id).delete();
    });
  },
  async saveDraft(id, content) {
    const db = getDb();
    const prompt = await db.writingPrompts.get(id);
    if (!prompt) return;
    const patch: Partial<WritingPrompt> = {
      draftContent: content,
      draftUpdatedAt: now(),
      updatedAt: now(),
    };
    if (prompt.status === "not-started" && content.trim()) {
      patch.status = "in-progress";
    }
    await db.writingPrompts.update(id, patch);
  },
  async setStatus(id, status) {
    await getDb().writingPrompts.update(id, { status, updatedAt: now() });
  },
  async listAttempts(promptId) {
    const attempts = await getDb().writingAttempts.where("promptId").equals(promptId).toArray();
    return attempts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async saveAttempt({ promptId, content, durationSeconds }) {
    const attempt: WritingAttempt = {
      id: newId(),
      promptId,
      content,
      wordCount: countWords(content),
      durationSeconds,
      ...timestamps(),
    };
    await getDb().writingAttempts.add(attempt);
    return attempt;
  },
  async removeAttempt(id) {
    await getDb().writingAttempts.delete(id);
  },
};
