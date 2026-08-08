import { createFileRoute } from "@tanstack/react-router";

import { examRepository } from "@/data/repositories/exams.repository";
import { noteRepository } from "@/data/repositories/notes.repository";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { writingRepository } from "@/data/repositories/writing.repository";
import { NotImplementedNote, PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress — Exam Assistant" },
      { name: "description", content: "A factual view of what you have created and completed." },
      { property: "og:title", content: "Progress — Exam Assistant" },
      { property: "og:description", content: "A factual view of what you have created and completed." },
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

  const doneTasks = (plan ?? []).filter((entry) => entry.done).length;

  return (
    <PageContainer>
      <PageHeader
        title="Progress"
        description="Counts come straight from your local database — no estimates or invented metrics."
      />

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Exams tracked" value={exams?.length ?? "—"} />
        <Stat label="Notes" value={notes?.length ?? "—"} />
        <Stat label="Writing prompts" value={prompts?.length ?? "—"} />
        <Stat
          label="Plan tasks completed"
          value={plan ? `${doneTasks}/${plan.length}` : "—"}
        />
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
