import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { backupExcludesApiKey, downloadBackup, exportBackup, importBackup } from "@/data/backup";
import { Button } from "@/components/ui/button";
import { NotImplementedNote, PageContainer, PageHeader } from "@/shared/components/Page";

export const Route = createFileRoute("/settings/data")({
  head: () => ({
    meta: [
      { title: "Data & Backup — Exam Assistant" },
      { name: "description", content: "Export and restore your study data as a portable JSON file." },
      { property: "og:title", content: "Data & Backup — Exam Assistant" },
      { property: "og:description", content: "Export and restore your study data as a portable JSON file." },
    ],
  }),
  component: DataSettings,
});

function DataSettings() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");

  async function handleImport(file: File | undefined) {
    if (!file) return;
    try {
      const result = await importBackup(await file.text(), mode);
      toast.success(`Imported ${Object.values(result).reduce((sum, n) => sum + n, 0)} records`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Data & Backup"
        description="Everything lives on this device. Export regularly — clearing browser data deletes your study history."
      />

      <div className="surface-card space-y-3 p-5">
        <p className="text-sm font-medium">Export</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Creates a versioned JSON file with exams, notes, writing, plan and chat history.
          {backupExcludesApiKey() ? " Your API key is never included." : ""}
        </p>
        <Button
          className="tap-target"
          onClick={async () => {
            downloadBackup(await exportBackup());
            toast.success("Backup downloaded");
          }}
        >
          Export backup
        </Button>
      </div>

      <div className="surface-card mt-4 space-y-3 p-5">
        <p className="text-sm font-medium">Import</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Import mode">
          {(["merge", "replace"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`tap-target flex-1 rounded-xl border px-3 text-sm capitalize transition-colors ${
                mode === value ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-accent"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {mode === "merge"
            ? "Adds records from the file, keeping what's already here."
            : "Clears existing data first, then restores the file exactly."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          className="sr-only"
          aria-label="Choose a backup file"
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
        <Button variant="secondary" className="tap-target" onClick={() => inputRef.current?.click()}>
          Choose backup file
        </Button>
      </div>

      <div className="mt-4">
        <NotImplementedNote>
          Vault file bytes are excluded from the JSON backup to keep it small; re-add large files
          manually after a restore.
        </NotImplementedNote>
      </div>
    </PageContainer>
  );
}
