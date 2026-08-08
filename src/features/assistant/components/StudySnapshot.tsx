import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { useSettings } from "@/app/providers/SettingsProvider";
import { daysUntil } from "@/ai/context/assistantContext";
import { examRepository } from "@/data/repositories/exams.repository";
import { studyPlanRepository } from "@/data/repositories/knowledge.repository";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatRelativeDays } from "@/shared/utils/format";

const SESSION_KEY = "exam-assistant.snapshot.dismissed";

/**
 * Temporary launch overlay. Dismissal lasts for the current app session only;
 * the persistent on/off preference lives in settings.
 */
export function StudySnapshot() {
  const { settings, ready } = useSettings();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const alreadyDismissed = sessionStorage.getItem(SESSION_KEY) === "1";
    setDismissed(alreadyDismissed || !settings.showStudySnapshotOnLaunch);
  }, [ready, settings.showStudySnapshotOnLaunch]);

  const exams = useRepoQuery(() => examRepository.list());
  const plan = useRepoQuery(() => studyPlanRepository.list());

  if (dismissed) return null;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (exams ?? []).filter((exam) => exam.examDate && exam.examDate >= today);
  const nearest =
    (settings.activeExamId
      ? (exams ?? []).find((exam) => exam.id === settings.activeExamId)
      : undefined) ?? upcoming[0];
  const todayTasks = (plan ?? []).filter((entry) => entry.date.slice(0, 10) === today);
  const done = todayTasks.filter((entry) => entry.done).length;

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      role="region"
      aria-label="Study snapshot"
      className="animate-in fade-in slide-in-from-top-2 mx-auto mb-4 w-full max-w-2xl rounded-3xl border bg-surface-raised p-5 shadow-[var(--shadow-soft)] duration-300"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Study snapshot
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss study snapshot"
          className="tap-target -m-2 inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {nearest ? (
        <div className="mt-3">
          <p className="text-lg font-semibold">{nearest.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatRelativeDays(daysUntil(nearest.examDate))}
            {nearest.examDate ? ` · ${new Date(nearest.examDate).toLocaleDateString()}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No upcoming exam yet — add one from Exams to see your countdown here.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-surface-sunken px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Today's plan</dt>
          <dd className="font-medium">
            {todayTasks.length ? `${done}/${todayTasks.length} done` : "Nothing scheduled"}
          </dd>
        </div>
        <div className="rounded-2xl bg-surface-sunken px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Other exams</dt>
          <dd className="font-medium">{Math.max(upcoming.length - 1, 0)} upcoming</dd>
        </div>
      </dl>
    </div>
  );
}
