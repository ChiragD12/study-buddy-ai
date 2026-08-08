import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { clearGeminiKey, getGeminiKey, maskKey, setGeminiKey } from "@/ai/providers/keyStore";
import { GEMINI_MODELS } from "@/ai/providers/models";
import { resolveProvider } from "@/ai/providers";
import { settingsRepository } from "@/data/repositories/settings.repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer, PageHeader } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";

export const Route = createFileRoute("/settings/ai")({
  head: () => ({
    meta: [
      { title: "AI Settings — Exam Assistant" },
      {
        name: "description",
        content: "Connect your own Gemini API key, stored only on this device.",
      },
      { property: "og:title", content: "AI Settings — Exam Assistant" },
      {
        property: "og:description",
        content: "Connect your own Gemini API key, stored only on this device.",
      },
    ],
  }),
  component: AISettings,
});

function AISettings() {
  const settings = useRepoQuery(() => settingsRepository.get());
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(() => getGeminiKey());
  const [testing, setTesting] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        title="AI / Gemini"
        description="The assistant talks to Google's API directly from your browser. Your key never passes through any server of ours."
      />

      <div className="surface-card space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="gemini-key">Gemini API key</Label>
          <Input
            id="gemini-key"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={saved ? maskKey(saved) : "AIza…"}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Stored in this device's local storage. Avoid entering it on a shared device.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="tap-target"
            disabled={!draft.trim()}
            onClick={() => {
              setGeminiKey(draft);
              setSaved(draft.trim());
              setDraft("");
              void settingsRepository.update({ aiProvider: "gemini" });
              toast.success("Key saved on this device");
            }}
          >
            Save key
          </Button>
          {saved ? (
            <Button
              variant="ghost"
              className="tap-target text-destructive"
              onClick={() => {
                clearGeminiKey();
                setSaved(null);
                void settingsRepository.update({ aiProvider: "none" });
                toast.success("Key removed");
              }}
            >
              Remove key
            </Button>
          ) : null}
        </div>
      </div>

      <div className="surface-card mt-4 space-y-2 p-5">
        <Label htmlFor="model">Model</Label>
        <select
          id="model"
          value={settings?.geminiModel ?? GEMINI_MODELS[0]}
          onChange={(event) => void settingsRepository.update({ geminiModel: event.target.value })}
          className="tap-target w-full rounded-xl border bg-surface px-3 text-sm"
        >
          {GEMINI_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          className="tap-target"
          disabled={!saved || testing}
          onClick={async () => {
            setTesting(true);
            try {
              const provider = await resolveProvider();
              if (!provider) {
                toast.error("Add a Gemini API key before testing the connection.");
                return;
              }
              const result = await provider.testConnection();
              if (result.ok) toast.success(result.message);
              else toast.error(result.message);
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
      </div>
    </PageContainer>
  );
}
