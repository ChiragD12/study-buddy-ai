import type Dexie from "dexie";
import { DEFAULT_GEMINI_MODEL, isGeminiModel } from "@/ai/providers/models";

/**
 * Exported backup schema version. Bump whenever the shape of exported data
 * changes so importers can migrate older backups.
 */
export const SCHEMA_VERSION = 1;

/**
 * All Dexie schema versions in order. Add a new `db.version(n).stores({...})`
 * block (plus an optional `.upgrade()`) instead of editing an existing one.
 */
export function applyMigrations(db: Dexie): void {
  db.version(1).stores({
    exams: "id, name, examDate, priority, updatedAt",
    notes: "id, title, examId, subject, topic, verification, updatedAt, *tags",
    writingPrompts: "id, track, format, examId, updatedAt",
    writingAttempts: "id, promptId, createdAt, updatedAt",
    vaultItems: "id, name, kind, favorite, examId, updatedAt, *tags",
    vaultBlobs: "key",
    conversations: "id, updatedAt",
    messages: "id, conversationId, createdAt",
    currentAffairs: "id, publishedAt, source, savedAt, *tags",
    studyPlan: "id, examId, date, done",
    settings: "id",
  });
  db.version(2)
    .stores({
      exams: "id, name, examDate, priority, updatedAt",
      notes: "id, title, examId, subject, topic, verification, updatedAt, *tags",
      writingPrompts: "id, track, format, examId, updatedAt",
      writingAttempts: "id, promptId, createdAt, updatedAt",
      vaultItems: "id, name, kind, favorite, examId, updatedAt, *tags",
      vaultBlobs: "key",
      conversations: "id, updatedAt",
      messages: "id, conversationId, createdAt",
      currentAffairs: "id, publishedAt, source, savedAt, *tags",
      studyPlan: "id, examId, date, done",
      settings: "id",
    })
    .upgrade((transaction) =>
      transaction
        .table("settings")
        .toCollection()
        .modify((settings: { geminiModel?: string }) => {
          if (settings.geminiModel && !isGeminiModel(settings.geminiModel)) {
            settings.geminiModel = DEFAULT_GEMINI_MODEL;
          }
        }),
    );
}
