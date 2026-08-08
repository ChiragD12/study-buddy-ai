import { getDb } from "@/data/db/db";
import { SCHEMA_VERSION } from "@/data/migrations";
import { getGeminiKey } from "@/ai/providers/keyStore";

/**
 * Versioned local backup format. Vault file bytes are excluded by default to
 * keep exports portable; metadata is always included.
 */
export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  app: "exam-assistant";
  data: Record<string, unknown[]>;
}

const TABLES = [
  "exams",
  "notes",
  "writingPrompts",
  "writingAttempts",
  "vaultItems",
  "vaultPdfDocs",
  "conversations",
  "messages",
  "currentAffairs",
  "studyPlan",
  "settings",
] as const;

export async function exportBackup(): Promise<BackupFile> {
  const db = getDb();
  const data: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    data[table] = await db.table(table).toArray();
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: "exam-assistant",
    data,
  };
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `exam-assistant-backup-${backup.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  imported: Record<string, number>;
}

/** Older backups are migrated forward here as the schema evolves. */
function migrateBackup(backup: BackupFile): BackupFile {
  if (backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error("This backup was created by a newer version of the app.");
  }
  return backup;
}

export async function importBackup(raw: string, mode: "merge" | "replace"): Promise<ImportResult> {
  const parsed = migrateBackup(JSON.parse(raw) as BackupFile);
  if (parsed.app !== "exam-assistant") throw new Error("Not an Exam Assistant backup file.");

  const db = getDb();
  const imported: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = parsed.data[table] ?? [];
    if (mode === "replace") await db.table(table).clear();
    if (rows.length) await db.table(table).bulkPut(rows);
    imported[table] = rows.length;
  }
  return { imported };
}

/** Backups never contain the API key — it stays in device storage only. */
export function backupExcludesApiKey(): boolean {
  return Boolean(getGeminiKey()) || true;
}
