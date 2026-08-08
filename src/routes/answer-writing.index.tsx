import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { useState } from "react";

import { writingRepository } from "@/data/repositories/writing.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import type { WritingFormat, WritingTrack } from "@/shared/types/domain";

export const Route = createFileRoute("/answer-writing/")({
  head: () => ({
    meta: [
      { title: "Answer Writing — Exam Assistant" },
      { name: "description", content: "Practice letters, précis, essays and structured answers locally." },
      { property: "og:title", content: "Answer Writing — Exam Assistant" },
      { property: "og:description", content: "Practice letters, précis, essays and structured answers locally." },
    ],
  }),
  component: AnswerWritingPage,
});

const FORMATS: Record<WritingTrack, { value: WritingFormat; label: string }[]> = {
  english: [
    { value: "letter", label: "Letter writing" },
    { value: "precis", label: "Précis" },
    { value: "essay", label: "Essay" },
    { value: "comprehension", label: "Comprehension" },
    { value: "other", label: "Other" },
  ],
  "civil-services": [
    { value: "gs-answer", label: "GS answer" },
    { value: "structured-answer", label: "Structured answer" },
    { value: "essay", label: "Essay" },
    { value: "other", label: "Other" },
  ],
};

function AnswerWritingPage() {
  const prompts = useRepoQuery(() => writingRepository.listPrompts());
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [track, setTrack] = useState<WritingTrack>("english");
  const [format, setFormat] = useState<WritingFormat>("letter");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [wordLimit, setWordLimit] = useState("");
  const [minutes, setMinutes] = useState("");

  async function create() {
    if (!title.trim()) return;
    const prompt = await writingRepository.createPrompt({
      title: title.trim(),
      brief,
      track,
      format,
      ...(wordLimit ? { wordLimit: Number(wordLimit) } : {}),
      ...(minutes ? { timeLimitMinutes: Number(minutes) } : {}),
    });
    setOpen(false);
    setTitle("");
    setBrief("");
    void navigate({ to: "/answer-writing/$promptId", params: { promptId: prompt.id } });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Answer Writing"
        description="Two tracks: English/clerk-style writing and civil-services answers. Attempts are append-only — nothing you write is overwritten."
        action={
          <Button className="tap-target" onClick={() => setOpen((value) => !value)}>
            New prompt
          </Button>
        }
      />

      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          className="surface-card mb-6 space-y-4 p-5"
        >
          <div className="space-y-2">
            <Label htmlFor="prompt-title">Prompt title</Label>
            <Input
              id="prompt-title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prompt-track">Track</Label>
              <select
                id="prompt-track"
                value={track}
                onChange={(event) => {
                  const next = event.target.value as WritingTrack;
                  setTrack(next);
                  setFormat(FORMATS[next][0]!.value);
                }}
                className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
              >
                <option value="english">English / Clerk-style</option>
                <option value="civil-services">Civil services</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-format">Format</Label>
              <select
                id="prompt-format"
                value={format}
                onChange={(event) => setFormat(event.target.value as WritingFormat)}
                className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
              >
                {FORMATS[track].map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-words">Word limit</Label>
              <Input
                id="prompt-words"
                inputMode="numeric"
                value={wordLimit}
                onChange={(event) => setWordLimit(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-minutes">Time limit (minutes)</Label>
              <Input
                id="prompt-minutes"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt-brief">Brief</Label>
            <Textarea
              id="prompt-brief"
              rows={3}
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="tap-target">
              Create
            </Button>
            <Button type="button" variant="ghost" className="tap-target" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {prompts === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : prompts.length === 0 ? (
        <EmptyState
          icon={<PenLine className="size-6" />}
          title="No writing prompts yet"
          description="Create a prompt to open the writing workspace with a timer and word counter."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {prompts.map((prompt) => (
            <li key={prompt.id}>
              <Link
                to="/answer-writing/$promptId"
                params={{ promptId: prompt.id }}
                className="surface-card block px-4 py-3 transition-colors hover:bg-accent"
              >
                <p className="font-medium">{prompt.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {prompt.track === "english" ? "English" : "Civil services"} · {prompt.format}
                  {prompt.wordLimit ? ` · ${prompt.wordLimit} words` : ""}
                  {prompt.timeLimitMinutes ? ` · ${prompt.timeLimitMinutes} min` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
