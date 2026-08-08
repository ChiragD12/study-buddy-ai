import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { noteRepository } from "@/data/repositories/notes.repository";
import { examRepository } from "@/data/repositories/exams.repository";
import { getGeminiKey } from "@/ai/providers/keyStore";
import { NoteVerificationUnavailableError, verifyNote } from "@/ai/context/noteVerification";
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
  const [verifying, setVerifying] = useState(false);

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

  async function runVerification() {
    setVerifying(true);
    try {
      const result = await verifyNote(noteId, { force: true });
      if (result.status === "flagged") {
        toast.warning(
          `Found ${result.findings.length} claim${result.findings.length === 1 ? "" : "s"} to review.`,
        );
      } else {
        toast.success("No factual issues found.");
      }
    } catch (error) {
      toast.error(
        error instanceof NoteVerificationUnavailableError
          ? error.message
          : "Verification failed. Try again in a moment.",
      );
    } finally {
      setVerifying(false);
    }
  }

  const lastEntry = note.verificationHistory.at(-1);
  const latestFindings =
    note.verification === "flagged" && lastEntry?.findings?.length ? lastEntry.findings : undefined;

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

        {providerConfigured ? (
          <div className="space-y-3 rounded-2xl border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Verification status: <strong className="text-foreground">{note.verification}</strong>
                {lastEntry?.summary && note.verification !== "pending" ? ` — ${lastEntry.summary}` : ""}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="tap-target"
                disabled={verifying}
                onClick={() => void runVerification()}
              >
                {verifying ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
                Verify facts
              </Button>
            </div>

            {latestFindings ? (
              <ul className="space-y-2">
                {latestFindings.map((finding, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm"
                  >
                    <ShieldAlert
                      className="mt-0.5 shrink-0 text-destructive"
                      size={16}
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-muted-foreground">
                        “{finding.claim}” —{" "}
                        <span className="font-medium text-foreground">
                          {finding.status === "incorrect" ? "Incorrect" : "Outdated"}
                        </span>
                      </p>
                      <p>{finding.correction}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : note.verification === "verified" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
                No factual issues found.
              </p>
            ) : null}
          </div>
        ) : (
          <NotImplementedNote>
            Add a Gemini key in Settings to enable automatic fact verification for notes.
          </NotImplementedNote>
        )}

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
