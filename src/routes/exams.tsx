import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Pencil, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useSettings } from "@/app/providers/SettingsProvider";
import { daysUntil } from "@/ai/context/assistantContext";
import { examRepository } from "@/data/repositories/exams.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatRelativeDays } from "@/shared/utils/format";
import type { Exam, ExamPriority } from "@/shared/types/domain";

export const Route = createFileRoute("/exams")({
  head: () => ({
    meta: [
      { title: "Exams — Exam Assistant" },
      { name: "description", content: "Add your exams and dates to drive countdowns and study focus." },
      { property: "og:title", content: "Exams — Exam Assistant" },
      { property: "og:description", content: "Add your exams and dates to drive countdowns and study focus." },
    ],
  }),
  component: ExamsPage,
});

interface FormState {
  id?: string;
  name: string;
  examDate: string;
  description: string;
  priority: ExamPriority;
  syllabus: string;
  sourceUrl: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  examDate: "",
  description: "",
  priority: "medium",
  syllabus: "",
  sourceUrl: "",
};

function ExamsPage() {
  const exams = useRepoQuery(() => examRepository.list());
  const { settings, update } = useSettings();
  const [form, setForm] = useState<FormState | null>(null);

  async function save() {
    if (!form?.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      examDate: form.examDate || null,
      description: form.description,
      priority: form.priority,
      syllabus: form.syllabus,
      sourceUrl: form.sourceUrl,
    };
    if (form.id) {
      await examRepository.update(form.id, payload);
      toast.success("Exam updated");
    } else {
      await examRepository.create(payload);
      toast.success("Exam added");
    }
    setForm(null);
  }

  function edit(exam: Exam) {
    setForm({
      id: exam.id,
      name: exam.name,
      examDate: exam.examDate?.slice(0, 10) ?? "",
      description: exam.description ?? "",
      priority: exam.priority,
      syllabus: exam.syllabus ?? "",
      sourceUrl: exam.sourceUrl ?? "",
    });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Exams"
        description="Everything is user-defined: add any exam, set its date, and the assistant uses it for urgency and focus."
        action={
          <Button onClick={() => setForm(EMPTY_FORM)} className="tap-target">
            Add exam
          </Button>
        }
      />

      {form ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="surface-card mb-6 space-y-4 p-5"
        >
          <div className="space-y-2">
            <Label htmlFor="exam-name">Exam name</Label>
            <Input
              id="exam-name"
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. State Clerk Examination"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="exam-date">Exam date</Label>
              <Input
                id="exam-date"
                type="date"
                value={form.examDate}
                onChange={(event) => setForm({ ...form, examDate: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exam-priority">Priority</Label>
              <select
                id="exam-priority"
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value as ExamPriority })
                }
                className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-description">Description</Label>
            <Textarea
              id="exam-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-syllabus">Syllabus (optional)</Label>
            <Textarea
              id="exam-syllabus"
              value={form.syllabus}
              onChange={(event) => setForm({ ...form, syllabus: event.target.value })}
              rows={4}
              placeholder="Paste the official syllabus text if you have it."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="exam-source">Official notification URL (optional)</Label>
            <Input
              id="exam-source"
              type="url"
              value={form.sourceUrl}
              onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="tap-target">
              {form.id ? "Save changes" : "Add exam"}
            </Button>
            <Button type="button" variant="ghost" className="tap-target" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {exams === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : exams.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-6" />}
          title="No exams yet"
          description="Add your first exam to unlock countdowns, study focus and exam-aware assistance."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {exams.map((exam) => {
            const active = settings.activeExamId === exam.id;
            return (
              <li key={exam.id} className="surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{exam.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatRelativeDays(daysUntil(exam.examDate))} · {exam.priority} priority
                      {active ? " · active" : ""}
                    </p>
                    {exam.description ? (
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {exam.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={active ? "Active exam" : `Set ${exam.name} as active`}
                      aria-pressed={active}
                      onClick={() => void update({ activeExamId: active ? null : exam.id })}
                      className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
                    >
                      <Star
                        className={`size-4 ${active ? "fill-primary text-primary" : "text-muted-foreground"}`}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${exam.name}`}
                      onClick={() => edit(exam)}
                      className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
                    >
                      <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${exam.name}`}
                      onClick={async () => {
                        await examRepository.remove(exam.id);
                        toast.success("Exam deleted");
                      }}
                      className="tap-target inline-flex items-center justify-center rounded-xl hover:bg-accent"
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
