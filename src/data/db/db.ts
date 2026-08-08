import Dexie, { type Table } from "dexie";

import type {
  ChatMessage,
  Conversation,
  CurrentAffairsItem,
  Exam,
  Note,
  AppSettings,
  StudyPlanEntry,
  VaultBlob,
  VaultContent,
  VaultItem,
  VaultPdfDoc,
  WritingAttempt,
  WritingPrompt,
} from "@/shared/types/domain";
import { applyMigrations } from "@/data/migrations";

/**
 * Dexie database. Schema versions live in `src/data/migrations` so that
 * migration logic never leaks into UI or feature code.
 */
export class AppDatabase extends Dexie {
  exams!: Table<Exam, string>;
  notes!: Table<Note, string>;
  writingPrompts!: Table<WritingPrompt, string>;
  writingAttempts!: Table<WritingAttempt, string>;
  vaultItems!: Table<VaultItem, string>;
  vaultBlobs!: Table<VaultBlob, string>;
  vaultPdfDocs!: Table<VaultPdfDoc, string>;
  vaultContent!: Table<VaultContent, string>;
  conversations!: Table<Conversation, string>;
  messages!: Table<ChatMessage, string>;
  currentAffairs!: Table<CurrentAffairsItem, string>;
  studyPlan!: Table<StudyPlanEntry, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("exam-assistant");
    applyMigrations(this);
  }
}

let instance: AppDatabase | undefined;

/**
 * Lazy accessor. The database is only constructed in the browser so that
 * server-side rendering never touches IndexedDB.
 */
export function getDb(): AppDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable in this environment.");
  }
  if (!instance) instance = new AppDatabase();
  return instance;
}

export const isBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined";
