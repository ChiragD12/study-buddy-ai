import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Check, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { examRepository } from "@/data/repositories/exams.repository";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatDate } from "@/shared/utils/format";
import type { ExamPriority, StudyPlanEntry } from "@/shared/types/domain";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Study Plan — Exam Assistant" },
      { name: "description", content: "Plan study sessions against your own exam dates." },
    ],
  }),
  component: PlanPage,
});

type View = "today" | "upcoming" | "overdue" | "completed" | "all";
interface Draft {
  id?: string;
  title: string;
  description: string;
  date: string;
  examId: string;
  priority: ExamPriority;
  minutes: string;
}

const blankDraft = (): Draft => ({
  title: "",
  description: "",
  date: new Date().toISOString().slice(0, 10),
  examId: "",
  priority: "medium",
  minutes: "",
});

function PlanPage() {
  const entries = useRepoQuery(() => studyPlanRepository.list());
  const exams = useRepoQuery(() => examRepository.list());
  const [view, setView] = useState<View>("today");
  const [examFilter, setExamFilter] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const examNames = useMemo(
    () => new Map((exams ?? []).map((exam) => [exam.id, exam.name])),
    [exams],
  );
  const visibleEntries = (entries ?? []).filter((entry) => {
    if (examFilter && entry.examId !== examFilter) return false;
    const date = entry.date.slice(0, 10);
    if (view === "today") return date === today;
    if (view === "upcoming") return date > today && !entry.done;
    if (view === "overdue") return date < today && !entry.done;
    if (view === "completed") return entry.done;
    return true;
  });

  async function save() {
    if (!draft?.title.trim() || !draft.date) return;
    const patch = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      date: draft.date,
      examId: draft.examId || null,
      priority: draft.priority,
      minutes: draft.minutes ? Number(draft.minutes) : undefined,
    };
    if (draft.id) await studyPlanRepository.update(draft.id, patch);
    else await studyPlanRepository.create(patch);
    setDraft(null);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Study Plan"
        description="Plan focused sessions against your exams, then track what is complete."
        action={
          <Button className="tap-target" onClick={() => setDraft(blankDraft())}>
            Add task
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {(["today", "upcoming", "overdue", "completed", "all"] as View[]).map((option) => (
          <Button
            key={option}
            variant={view === option ? "default" : "secondary"}
            className="tap-target capitalize"
            onClick={() => setView(option)}
          >
            {option === "today" ? "Today" : option}
          </Button>
        ))}
        <select
          aria-label="Filter by exam"
          value={examFilter}
          onChange={(event) => setExamFilter(event.target.value)}
          className="tap-target rounded-xl border bg-surface px-3 text-sm"
        >
          <option value="">All exams</option>
          {(exams ?? []).map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
      </div>
      {draft ? (
        <TaskForm
          draft={draft}
          exams={exams ?? []}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
        />
      ) : null}
      {entries === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visibleEntries.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title={view === "today" ? "No study tasks planned for today" : "No study tasks here"}
          description={
            entries.length
              ? "Try another view or add a task for this period."
              : "You don't have any study tasks yet."
          }
          action={
            <Button className="tap-target" onClick={() => setDraft(blankDraft())}>
              Add task
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleEntries.map((entry) => (
            <TaskRow
              key={entry.id}
              entry={entry}
              examName={entry.examId ? examNames.get(entry.examId) : undefined}
              onEdit={() =>
                setDraft({
                  id: entry.id,
                  title: entry.title,
                  description: entry.description ?? "",
                  date: entry.date.slice(0, 10),
                  examId: entry.examId ?? "",
                  priority: entry.priority,
                  minutes: entry.minutes?.toString() ?? "",
                })
              }
              onToggle={() => void studyPlanRepository.toggleDone(entry.id)}
              onDelete={() => void studyPlanRepository.remove(entry.id)}
            />
          ))}
        </ul>
      )}
    </PageContainer>
  );
}

function TaskForm({
  draft,
  exams,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  exams: { id: string; name: string }[];
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      className="surface-card mb-5 space-y-4 p-5"
    >
      <div className="space-y-2">
        <Label htmlFor="task-title">Task title</Label>
        <Input
          id="task-title"
          required
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="Revise Fundamental Rights"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-description">Notes</Label>
        <Textarea
          id="task-description"
          rows={3}
          value={draft.description}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="task-date">Date</Label>
          <Input
            id="task-date"
            type="date"
            required
            value={draft.date}
            onChange={(event) => onChange({ ...draft, date: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-priority">Priority</Label>
          <select
            id="task-priority"
            value={draft.priority}
            onChange={(event) =>
              onChange({ ...draft, priority: event.target.value as ExamPriority })
            }
            className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-exam">Exam</Label>
          <select
            id="task-exam"
            value={draft.examId}
            onChange={(event) => onChange({ ...draft, examId: event.target.value })}
            className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
          >
            <option value="">Not linked</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-minutes">Minutes</Label>
          <Input
            id="task-minutes"
            inputMode="numeric"
            value={draft.minutes}
            onChange={(event) => onChange({ ...draft, minutes: event.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="tap-target">
          {draft.id ? "Save changes" : "Add task"}
        </Button>
        <Button type="button" variant="ghost" className="tap-target" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TaskRow({
  entry,
  examName,
  onEdit,
  onToggle,
  onDelete,
}: {
  entry: StudyPlanEntry;
  examName?: string | undefined;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="surface-card flex items-start gap-3 p-4">
      <button
        type="button"
        aria-label={entry.done ? `Mark ${entry.title} incomplete` : `Mark ${entry.title} complete`}
        aria-pressed={entry.done}
        onClick={onToggle}
        className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${entry.done ? "bg-primary text-primary-foreground" : ""}`}
      >
        {entry.done ? <Check className="size-4" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={entry.done ? "font-medium text-muted-foreground line-through" : "font-medium"}
        >
          {entry.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(entry.date)} · {entry.priority} priority{examName ? ` · ${examName}` : ""}
          {entry.minutes ? ` · ${entry.minutes} min` : ""}
        </p>
        {entry.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{entry.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          aria-label={`Edit ${entry.title}`}
          onClick={onEdit}
          className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${entry.title}`}
          onClick={onDelete}
          className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
        >
          <Trash2 className="size-4 text-destructive" />
        </button>
      </div>
    </li>
  );
}
