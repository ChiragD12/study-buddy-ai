import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { noteRepository } from "@/data/repositories/notes.repository";
import { examRepository } from "@/data/repositories/exams.repository";
import { getGeminiKey } from "@/ai/providers/keyStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NotImplementedNote, PageContainer } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import type { NoteConfidence, NoteVerification } from "@/shared/types/domain";

export const Route = createFileRoute("/notes/$noteId")({
  head: () => ({
    meta: [
      { title: "Note — Exam Assistant" },
      { name: "description", content: "Edit a locally stored study note." },
      { property: "og:title", content: "Note — Exam Assistant" },
      { property: "og:description", content: "Edit a locally stored study note." },
    ],
  }),
  component: NoteDetailPage,
});

function NoteDetailPage() {
  const { noteId } = Route.useParams();
  const navigate = useNavigate();
  const note = useRepoQuery(() => noteRepository.get(noteId), [noteId]);
  const exams = useRepoQuery(() => examRepository.list());

  const [draft, setDraft] = useState({
    title: "",
    content: "",
    tags: "",
    subject: "",
    topic: "",
    source: "",
    examId: "",
    confidence: "medium" as NoteConfidence,
    verification: "unverified" as NoteVerification,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!note || loaded) return;
    setDraft({
      title: note.title,
      content: note.content,
      tags: note.tags.join(", "),
      subject: note.subject ?? "",
      topic: note.topic ?? "",
      source: note.source ?? "",
      examId: note.examId ?? "",
      confidence: note.confidence,
      verification: note.verification,
    });
    setLoaded(true);
  }, [note, loaded]);

  if (note === undefined) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    );
  }

  if (note === null || !note) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">This note no longer exists.</p>
      </PageContainer>
    );
  }

  async function save() {
    const priorVerification = note?.verification;
    const verificationHistory = note?.verificationHistory ?? [];
    await noteRepository.update(noteId, {
      title: draft.title,
      content: draft.content,
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      subject: draft.subject,
      topic: draft.topic,
      source: draft.source,
      examId: draft.examId || null,
      confidence: draft.confidence,
      verification: draft.verification,
      ...(priorVerification !== draft.verification
        ? {
            verificationHistory: [
              ...verificationHistory,
              {
                at: new Date().toISOString(),
                status: draft.verification,
                summary: "Set manually by the user.",
              },
            ],
          }
        : {}),
    });
    toast.success("Note saved");
  }

  const providerConfigured = Boolean(getGeminiKey());

  return (
    <PageContainer>
      <div className="space-y-5">
        <Input
          aria-label="Note title"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className="h-12 rounded-xl border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
          placeholder="Untitled note"
        />

        <Textarea
          aria-label="Note content"
          value={draft.content}
          onChange={(event) => setDraft({ ...draft, content: event.target.value })}
          rows={14}
          placeholder="Write or paste your notes…"
          className="min-h-64 rounded-2xl leading-relaxed"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="note-subject">Subject</Label>
            <Input
              id="note-subject"
              value={draft.subject}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-verification">Verification</Label>
            <select
              id="note-verification"
              value={draft.verification}
              onChange={(event) =>
                setDraft({ ...draft, verification: event.target.value as NoteVerification })
              }
              className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
            >
              <option value="unverified">Unverified</option>
              <option value="verified">Verified</option>
              <option value="pending">Needs review</option>
              <option value="flagged">Flagged</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-topic">Topic</Label>
            <Input
              id="note-topic"
              value={draft.topic}
              onChange={(event) => setDraft({ ...draft, topic: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-tags">Tags (comma separated)</Label>
            <Input
              id="note-tags"
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-source">Source</Label>
            <Input
              id="note-source"
              value={draft.source}
              onChange={(event) => setDraft({ ...draft, source: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-exam">Exam</Label>
            <select
              id="note-exam"
              value={draft.examId}
              onChange={(event) => setDraft({ ...draft, examId: event.target.value })}
              className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
            >
              <option value="">Not linked</option>
              {(exams ?? []).map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-confidence">Confidence</Label>
            <select
              id="note-confidence"
              value={draft.confidence}
              onChange={(event) =>
                setDraft({ ...draft, confidence: event.target.value as NoteConfidence })
              }
              className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <NotImplementedNote>
          Verification status: <strong>{note.verification}</strong>.{" "}
          {providerConfigured
            ? "AI verification is not implemented yet — the data model and history are ready for it."
            : "Add a Gemini key in Settings to enable verification once it ships."}
        </NotImplementedNote>

        <div className="flex flex-wrap gap-2">
          <Button className="tap-target" onClick={() => void save()}>
            Save note
          </Button>
          <Button
            variant="ghost"
            className="tap-target text-destructive"
            onClick={async () => {
              await noteRepository.remove(noteId);
              toast.success("Note deleted");
              void navigate({ to: "/notes" });
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
