import { createFileRoute } from "@tanstack/react-router";

import { settingsRepository } from "@/data/repositories/settings.repository";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import type { Appearance } from "@/shared/types/domain";

export const Route = createFileRoute("/settings/appearance")({
  head: () => ({
    meta: [
      { title: "Appearance — Exam Assistant" },
      { name: "description", content: "Theme, motion and launch behaviour for your study app." },
      { property: "og:title", content: "Appearance — Exam Assistant" },
      { property: "og:description", content: "Theme, motion and launch behaviour for your study app." },
    ],
  }),
  component: AppearanceSettings,
});

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceSettings() {
  const settings = useRepoQuery(() => settingsRepository.get());

  return (
    <PageContainer>
      <PageHeader title="Appearance" description="Small, calm choices — nothing that fights the system." />

      <div className="surface-card space-y-3 p-5">
        <p className="text-sm font-medium">Theme</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {OPTIONS.map((option) => {
            const active = settings?.appearance === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => void settingsRepository.update({ appearance: option.value })}
                className={`tap-target flex-1 rounded-xl border px-3 text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-accent"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="surface-card mt-4 flex items-center justify-between gap-4 p-5">
        <Label htmlFor="reduce-motion" className="flex-1 text-sm font-medium">
          Reduce motion
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Minimises transitions across the app.
          </span>
        </Label>
        <Switch
          id="reduce-motion"
          checked={settings?.reduceMotion ?? false}
          onCheckedChange={(checked) => void settingsRepository.update({ reduceMotion: checked })}
        />
      </div>

      <div className="surface-card mt-4 flex items-center justify-between gap-4 p-5">
        <Label htmlFor="snapshot" className="flex-1 text-sm font-medium">
          Show study snapshot on launch
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            A short overview of exams and today's plan when the app opens.
          </span>
        </Label>
        <Switch
          id="snapshot"
          checked={settings?.showStudySnapshotOnLaunch ?? true}
          onCheckedChange={(checked) =>
            void settingsRepository.update({ showStudySnapshotOnLaunch: checked })
          }
        />
      </div>
    </PageContainer>
  );
}
