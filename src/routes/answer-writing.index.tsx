import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { useMemo, useState } from "react";

import { examRepository } from "@/data/repositories/exams.repository";
import { writingRepository } from "@/data/repositories/writing.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import type { WritingFormat, WritingStatus, WritingTrack } from "@/shared/types/domain";

export const Route = createFileRoute("/answer-writing/")({
  head: () => ({
    meta: [
      { title: "Answer Writing — Exam Assistant" },
      {
        name: "description",
        content: "Practice letters, précis, essays and structured answers locally.",
      },
      { property: "og:title", content: "Answer Writing — Exam Assistant" },
      {
        property: "og:description",
        content: "Practice letters, précis, essays and structured answers locally.",
      },
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

const TOPIC_SUGGESTIONS = [
  "Polity",
  "Economy",
  "History",
  "Geography",
  "Environment",
  "Science & Technology",
  "Judiciary",
  "Haryana",
  "Other",
];

const STATUS_LABEL: Record<WritingStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  completed: "Completed",
};

const STATUS_FILTERS: { value: WritingStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

function AnswerWritingPage() {
  const prompts = useRepoQuery(() => writingRepository.listPrompts());
  const exams = useRepoQuery(() => examRepository.list());
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [track, setTrack] = useState<WritingTrack>("english");
  const [format, setFormat] = useState<WritingFormat>("letter");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [topic, setTopic] = useState("");
  const [examId, setExamId] = useState("");
  const [wordLimit, setWordLimit] = useState("");
  const [minutes, setMinutes] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WritingStatus | "all">("all");
  const [examFilter, setExamFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");

  const examName = useMemo(() => {
    const map = new Map((exams ?? []).map((exam) => [exam.id, exam.name]));
    return (id: string | null | undefined) => (id ? map.get(id) : undefined);
  }, [exams]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const prompt of prompts ?? []) {
      if (prompt.topic) set.add(prompt.topic);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [prompts]);

  const filteredPrompts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (prompts ?? []).filter((prompt) => {
      if (statusFilter !== "all" && (prompt.status ?? "not-started") !== statusFilter) {
        return false;
      }
      if (examFilter !== "all") {
        if (examFilter === "none" ? Boolean(prompt.examId) : prompt.examId !== examFilter) {
          return false;
        }
      }
      if (topicFilter !== "all" && (prompt.topic ?? "") !== topicFilter) {
        return false;
      }
      if (query) {
        const haystack = `${prompt.title} ${prompt.brief ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [prompts, search, statusFilter, examFilter, topicFilter]);

  async function create() {
    if (!title.trim()) return;
    const prompt = await writingRepository.createPrompt({
      title: title.trim(),
      brief,
      track,
      format,
      ...(topic.trim() ? { topic: topic.trim() } : {}),
      ...(examId ? { examId } : {}),
      ...(wordLimit ? { wordLimit: Number(wordLimit) } : {}),
      ...(minutes ? { timeLimitMinutes: Number(minutes) } : {}),
    });
    setOpen(false);
    setTitle("");
    setBrief("");
    setTopic("");
    setExamId("");
    setWordLimit("");
    setMinutes("");
    void navigate({ to: "/answer-writing/$promptId", params: { promptId: prompt.id } });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Answer Writing"
        description="Two tracks: English/clerk-style writing and civil-services answers. Your working answer is saved as you type; explicit saves are kept as a history — nothing you write is overwritten."
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
              <Label htmlFor="prompt-topic">Topic / subject</Label>
              <Input
                id="prompt-topic"
                list="topic-suggestions"
                placeholder="e.g. Polity"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
              />
              <datalist id="topic-suggestions">
                {TOPIC_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-exam">Exam</Label>
              <select
                id="prompt-exam"
                value={examId}
                onChange={(event) => setExamId(event.target.value)}
                className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
              >
                <option value="">No exam</option>
                {(exams ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
              {exams?.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No exams available to associate yet.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-words">Target word count</Label>
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
            <Label htmlFor="prompt-brief">Prompt / question text</Label>
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
            <Button
              type="button"
              variant="ghost"
              className="tap-target"
              onClick={() => setOpen(false)}
            >
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
          title="No answer-writing prompts yet"
          description="Create a prompt to open the writing workspace with a timer and word counter."
        />
      ) : (
        <>
          <div className="surface-card mb-4 flex flex-col gap-3 p-4">
            <Input
              aria-label="Search prompts"
              placeholder="Search by title or prompt text…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={statusFilter === option.value ? "secondary" : "ghost"}
                  className="tap-target h-8 px-3 text-xs"
                  onClick={() => setStatusFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="filter-exam" className="text-xs text-muted-foreground">
                  Exam
                </Label>
                <select
                  id="filter-exam"
                  value={examFilter}
                  onChange={(event) => setExamFilter(event.target.value)}
                  className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
                >
                  <option value="all">All exams</option>
                  <option value="none">No exam</option>
                  {(exams ?? []).map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="filter-topic" className="text-xs text-muted-foreground">
                  Topic
                </Label>
                <select
                  id="filter-topic"
                  value={topicFilter}
                  onChange={(event) => setTopicFilter(event.target.value)}
                  className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
                  disabled={availableTopics.length === 0}
                >
                  <option value="all">All topics</option>
                  {availableTopics.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {filteredPrompts.length === 0 ? (
            <EmptyState
              icon={<PenLine className="size-6" />}
              title="No items match your filters"
              description="Try clearing the search or filters above."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {filteredPrompts.map((prompt) => (
                <li key={prompt.id}>
                  <Link
                    to="/answer-writing/$promptId"
                    params={{ promptId: prompt.id }}
                    className="surface-card block px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{prompt.title}</p>
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        {STATUS_LABEL[prompt.status ?? "not-started"]}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {prompt.track === "english" ? "English" : "Civil services"} · {prompt.format}
                      {prompt.topic ? ` · ${prompt.topic}` : ""}
                      {examName(prompt.examId) ? ` · ${examName(prompt.examId)}` : ""}
                      {prompt.wordLimit ? ` · target ${prompt.wordLimit} words` : ""}
                      {prompt.timeLimitMinutes ? ` · ${prompt.timeLimitMinutes} min` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageContainer>
  );
}
