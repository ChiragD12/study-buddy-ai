import { createFileRoute } from "@tanstack/react-router";

import { examRepository } from "@/data/repositories/exams.repository";
import { noteRepository } from "@/data/repositories/notes.repository";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { writingRepository } from "@/data/repositories/writing.repository";
import { useSettings } from "@/app/providers/SettingsProvider";
import { daysUntil } from "@/ai/context/assistantContext";
import { formatRelativeDays } from "@/shared/utils/format";
import { NotImplementedNote, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Exam Assistant" },
      { name: "description", content: "A factual view of what you have created and completed." },
      { property: "og:title", content: "Progress — Exam Assistant" },
      {
        property: "og:description",
        content: "A factual view of what you have created and completed.",
      },
    ],
  }),
  component: ProgressPage,
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface-card px-4 py-5">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ProgressPage() {
  const exams = useRepoQuery(() => examRepository.list());
  const notes = useRepoQuery(() => noteRepository.list());
  const prompts = useRepoQuery(() => writingRepository.listPrompts());
  const plan = useRepoQuery(() => studyPlanRepository.list());
  const { settings } = useSettings();

  const doneTasks = (plan ?? []).filter((entry) => entry.done).length;
  const totalTasks = plan?.length ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = (plan ?? []).filter((entry) => entry.date.slice(0, 10) === today);
  const todayDone = todayTasks.filter((entry) => entry.done).length;
  const activeExam = (exams ?? []).find((exam) => exam.id === settings.activeExamId);
  const nearestExam = (exams ?? []).find((exam) => exam.examDate && exam.examDate >= today);

  return (
    <PageContainer>
      <PageHeader
        title="Progress"
        description="Counts come straight from your local database — no estimates or invented metrics."
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Tasks completed" value={plan ? `${doneTasks}/${totalTasks}` : "—"} />
        <Stat
          label="Completion"
          value={totalTasks ? `${Math.round((doneTasks / totalTasks) * 100)}%` : "0%"}
        />
        <Stat
          label="Today's progress"
          value={todayTasks.length ? `${todayDone}/${todayTasks.length}` : "0/0"}
        />
        <Stat label="Exams tracked" value={exams?.length ?? "—"} />
        <Stat label="Notes" value={notes?.length ?? "—"} />
        <Stat label="Writing prompts" value={prompts?.length ?? "—"} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Active exam</p>
          <p className="mt-1 font-medium">{activeExam?.name ?? "No active exam selected."}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Nearest exam</p>
          <p className="mt-1 font-medium">{nearestExam?.name ?? "No upcoming exam."}</p>
          {nearestExam ? (
            <p className="text-sm text-muted-foreground">
              {formatRelativeDays(daysUntil(nearestExam.examDate))}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <NotImplementedNote>
          Deeper analytics (coverage by subject, revision cycles, retention) are intentionally
          deferred — they need real usage data before the model is designed.
        </NotImplementedNote>
      </div>
    </PageContainer>
  );
}
