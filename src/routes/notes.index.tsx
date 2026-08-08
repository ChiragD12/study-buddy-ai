import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileUp, NotebookPen, Search } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { noteRepository } from "@/data/repositories/notes.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatDate } from "@/shared/utils/format";

export const Route = createFileRoute("/notes/")({
  head: () => ({
    meta: [
      { title: "Notes — Exam Assistant" },
      { name: "description", content: "Your personal study notes, stored locally on this device." },
      { property: "og:title", content: "Notes — Exam Assistant" },
      {
        property: "og:description",
        content: "Your personal study notes, stored locally on this device.",
      },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  const [query, setQuery] = useState("");
  const notes = useRepoQuery(() => noteRepository.search(query), [query]);
  const navigate = useNavigate();
  const importRef = useRef<HTMLInputElement>(null);

  async function createNote() {
    const note = await noteRepository.create({ title: "Untitled note" });
    void navigate({ to: "/notes/$noteId", params: { noteId: note.id } });
  }

  async function importNotes(files: FileList | null) {
    if (!files?.length) return;
    const textFiles = Array.from(files).filter((file) => /\.(txt|md)$/i.test(file.name));
    if (!textFiles.length) {
      toast.error("Choose a .txt or .md file to import as a note.");
      return;
    }
    for (const file of textFiles) {
      const content = await file.text();
      await noteRepository.create({
        title: file.name.replace(/\.(txt|md)$/i, "") || "Imported note",
        content,
      });
    }
    toast.success(`Imported ${textFiles.length} note${textFiles.length === 1 ? "" : "s"}`);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Notes"
        description="Written, pasted or imported — notes never leave your device unless you explicitly ask the assistant about one."
        action={
          <div className="flex gap-2">
            <input
              ref={importRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              multiple
              className="sr-only"
              onChange={(event) => {
                void importNotes(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <Button
              variant="secondary"
              className="tap-target"
              onClick={() => importRef.current?.click()}
            >
              <FileUp className="size-4" aria-hidden="true" /> Import
            </Button>
            <Button className="tap-target" onClick={() => void createNote()}>
              New note
            </Button>
          </div>
        }
      />

      <div className="relative mb-5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes, tags, topics"
          aria-label="Search notes"
          className="pl-9"
        />
      </div>

      {notes === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<NotebookPen className="size-6" />}
          title={query ? "No matching notes" : "No notes yet"}
          description={
            query
              ? "Try a different search term."
              : "Create a note, paste existing material, or import .txt and .md files. Everything stays on this device."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                to="/notes/$noteId"
                params={{ noteId: note.id }}
                className="surface-card block px-4 py-3 transition-colors hover:bg-accent"
              >
                <p className="truncate font-medium">{note.title || "Untitled note"}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {note.content || "Empty note"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDate(note.updatedAt)} · {note.verification}
                  {note.tags.length ? ` · ${note.tags.join(", ")}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
