import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Trash2 } from "lucide-react";
import { useState } from "react";

import { examRepository } from "@/data/repositories/exams.repository";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatDate } from "@/shared/utils/format";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Study Plan — Exam Assistant" },
      { name: "description", content: "Plan study sessions against your own exam dates." },
      { property: "og:title", content: "Study Plan — Exam Assistant" },
      { property: "og:description", content: "Plan study sessions against your own exam dates." },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const entries = useRepoQuery(() => studyPlanRepository.list());
  const exams = useRepoQuery(() => examRepository.list());
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [examId, setExamId] = useState("");

  async function add() {
    if (!title.trim()) return;
    await studyPlanRepository.create({ title: title.trim(), date, examId: examId || null });
    setTitle("");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Study Plan"
        description="A simple, local schedule. Automated planning will build on this data later."
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
        className="surface-card mb-6 space-y-4 p-5"
      >
        <div className="space-y-2">
          <Label htmlFor="plan-title">Task</Label>
          <Input
            id="plan-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Revise reasoning — syllogisms"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="plan-date">Date</Label>
            <Input
              id="plan-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-exam">Exam</Label>
            <select
              id="plan-exam"
              value={examId}
              onChange={(event) => setExamId(event.target.value)}
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
        </div>
        <Button type="submit" className="tap-target">
          Add to plan
        </Button>
      </form>

      {entries === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title="Nothing planned"
          description="Add study tasks and they'll show up in your launch snapshot."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="surface-card flex items-center gap-3 p-4">
              <input
                type="checkbox"
                checked={entry.done}
                onChange={() => void studyPlanRepository.toggleDone(entry.id)}
                id={`plan-${entry.id}`}
                className="size-5 rounded"
              />
              <label htmlFor={`plan-${entry.id}`} className="min-w-0 flex-1">
                <span className={entry.done ? "text-muted-foreground line-through" : "font-medium"}>
                  {entry.title}
                </span>
                <span className="block text-xs text-muted-foreground">{formatDate(entry.date)}</span>
              </label>
              <button
                type="button"
                aria-label={`Delete ${entry.title}`}
                onClick={() => void studyPlanRepository.remove(entry.id)}
                className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
              >
                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
