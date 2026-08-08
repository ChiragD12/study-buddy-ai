import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { examRepository } from "@/data/repositories/exams.repository";
import { countWords, writingRepository } from "@/data/repositories/writing.repository";
import { getGeminiKey } from "@/ai/providers/keyStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NotImplementedNote, PageContainer } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatDate } from "@/shared/utils/format";
import type { WritingStatus } from "@/shared/types/domain";

export const Route = createFileRoute("/answer-writing/$promptId")({
  head: () => ({
    meta: [
      { title: "Writing workspace — Exam Assistant" },
      { name: "description", content: "Timed, local writing workspace with attempt history." },
      { property: "og:title", content: "Writing workspace — Exam Assistant" },
      {
        property: "og:description",
        content: "Timed, local writing workspace with attempt history.",
      },
    ],
  }),
  component: WritingWorkspace,
});

const STATUS_OPTIONS: { value: WritingStatus; label: string }[] = [
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const DRAFT_SAVE_DELAY_MS = 600;

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    ref.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [running]);

  return { seconds, reset: () => setSeconds(0) };
}

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function WritingWorkspace() {
  const { promptId } = Route.useParams();
  const navigate = useNavigate();
  const prompt = useRepoQuery(() => writingRepository.getPrompt(promptId), [promptId]);
  const attempts = useRepoQuery(() => writingRepository.listAttempts(promptId), [promptId]);
  const exam = useRepoQuery(
    () => (prompt?.examId ? examRepository.get(prompt.examId) : Promise.resolve(undefined)),
    [prompt?.examId],
  );
  const exams = useRepoQuery(() => examRepository.list());

  const [content, setContent] = useState("");
  const [loadedPromptId, setLoadedPromptId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { seconds, reset } = useTimer(running);
  const saveTimeout = useRef<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBrief, setEditBrief] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editExamId, setEditExamId] = useState("");
  const [editWordLimit, setEditWordLimit] = useState("");
  const [editMinutes, setEditMinutes] = useState("");

  // Load the persisted draft into the editor once per prompt, so we don't
  // stomp on in-progress typing every time the reactive query re-fires.
  useEffect(() => {
    if (!prompt || loadedPromptId === prompt.id) return;
    setContent(prompt.draftContent ?? "");
    setLoadedPromptId(prompt.id);
  }, [prompt, loadedPromptId]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    };
  }, []);

  if (!prompt) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    );
  }

  // Narrowed once so nested closures below (e.g. openEdit) keep the type
  // without TypeScript losing the non-null narrowing across function
  // boundaries.
  const currentPrompt = prompt;

  const words = countWords(content);
  const overLimit = currentPrompt.wordLimit ? words > currentPrompt.wordLimit : false;
  const status = currentPrompt.status ?? "not-started";

  function scheduleDraftSave(next: string) {
    setContent(next);
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => {
      void writingRepository.saveDraft(promptId, next);
    }, DRAFT_SAVE_DELAY_MS);
  }

  async function save() {
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    await writingRepository.saveDraft(promptId, content);
    if (content.trim()) {
      await writingRepository.saveAttempt({ promptId, content, durationSeconds: seconds });
    }
    toast.success("Answer saved");
  }

  async function changeStatus(next: WritingStatus) {
    await writingRepository.setStatus(promptId, next);
    if (next !== "not-started") {
      // Flushes any pending debounce so status and content agree immediately.
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
      await writingRepository.saveDraft(promptId, content);
    }
  }

  function openEdit() {
    setEditTitle(currentPrompt.title);
    setEditBrief(currentPrompt.brief ?? "");
    setEditTopic(currentPrompt.topic ?? "");
    setEditExamId(currentPrompt.examId ?? "");
    setEditWordLimit(currentPrompt.wordLimit ? String(currentPrompt.wordLimit) : "");
    setEditMinutes(currentPrompt.timeLimitMinutes ? String(currentPrompt.timeLimitMinutes) : "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!editTitle.trim()) return;
    await writingRepository.updatePrompt(promptId, {
      title: editTitle.trim(),
      brief: editBrief,
      topic: editTopic.trim() || undefined,
      examId: editExamId || null,
      wordLimit: editWordLimit ? Number(editWordLimit) : undefined,
      timeLimitMinutes: editMinutes ? Number(editMinutes) : undefined,
    });
    setEditing(false);
    toast.success("Prompt updated");
  }

  return (
    <PageContainer>
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-balance-tight text-2xl font-semibold">{prompt.title}</h1>
          <Button variant="ghost" className="tap-target shrink-0" onClick={openEdit}>
            Edit details
          </Button>
        </div>
        {prompt.brief ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{prompt.brief}</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          {prompt.track === "english" ? "English" : "Civil services"} · {prompt.format}
          {prompt.topic ? ` · ${prompt.topic}` : ""}
          {exam ? ` · ${exam.name}` : prompt.examId ? " · exam removed" : ""}
        </p>
      </header>

      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit();
          }}
          className="surface-card mb-6 space-y-4 p-5"
        >
          <div className="space-y-2">
            <Label htmlFor="edit-title">Prompt title</Label>
            <Input
              id="edit-title"
              required
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-topic">Topic / subject</Label>
              <Input
                id="edit-topic"
                value={editTopic}
                onChange={(event) => setEditTopic(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-exam">Exam</Label>
              <select
                id="edit-exam"
                value={editExamId}
                onChange={(event) => setEditExamId(event.target.value)}
                className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
              >
                <option value="">No exam</option>
                {(exams ?? []).map((examOption) => (
                  <option key={examOption.id} value={examOption.id}>
                    {examOption.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-words">Target word count</Label>
              <Input
                id="edit-words"
                inputMode="numeric"
                value={editWordLimit}
                onChange={(event) => setEditWordLimit(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-minutes">Time limit (minutes)</Label>
              <Input
                id="edit-minutes"
                inputMode="numeric"
                value={editMinutes}
                onChange={(event) => setEditMinutes(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-brief">Prompt / question text</Label>
            <Textarea
              id="edit-brief"
              rows={3}
              value={editBrief}
              onChange={(event) => setEditBrief(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="tap-target">
              Save details
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="tap-target"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          className="tap-target"
          onClick={() => setRunning((value) => !value)}
          aria-pressed={running}
        >
          {running ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
          {formatDuration(seconds)}
        </Button>
        <p
          className={`text-sm ${overLimit ? "font-medium text-destructive" : "text-muted-foreground"}`}
        >
          {words} words{prompt.wordLimit ? ` / ${prompt.wordLimit}` : ""}
          {overLimit ? " · over limit" : ""}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={status === option.value ? "secondary" : "ghost"}
            className="tap-target h-8 px-3 text-xs"
            onClick={() => void changeStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Textarea
        aria-label="Your answer"
        value={content}
        onChange={(event) => scheduleDraftSave(event.target.value)}
        onBlur={() => void writingRepository.saveDraft(promptId, content)}
        rows={16}
        placeholder="Start writing…"
        className="min-h-72 rounded-2xl leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="tap-target" onClick={() => void save()} disabled={!content.trim()}>
          Save answer
        </Button>
        <Button
          variant="ghost"
          className="tap-target text-destructive"
          onClick={async () => {
            await writingRepository.removePrompt(promptId);
            toast.success("Prompt deleted");
            void navigate({ to: "/answer-writing" });
          }}
        >
          Delete prompt
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Your answer is saved automatically as you type. "Save answer" also records a timestamped
        snapshot below, which is never overwritten.
      </p>

      <NotImplementedNote>
        {getGeminiKey()
          ? "AI evaluation is optional and not implemented yet — the attempt model already stores an evaluation slot."
          : "AI evaluation will be optional. Add a Gemini key in Settings when it ships."}
      </NotImplementedNote>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Saved snapshots
        </h2>
        {attempts?.length ? (
          <ul className="flex flex-col gap-2">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(attempt.createdAt)} · {attempt.wordCount} words ·{" "}
                    {formatDuration(attempt.durationSeconds)}
                  </p>
                  <button
                    type="button"
                    className="tap-target text-xs text-destructive"
                    onClick={async () => {
                      await writingRepository.removeAttempt(attempt.id);
                      toast.success("Snapshot removed");
                    }}
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {attempt.content}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No answers have been written yet.</p>
        )}
      </section>
    </PageContainer>
  );
}
