import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { countWords, writingRepository } from "@/data/repositories/writing.repository";
import { resolveProvider } from "@/ai/providers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NotImplementedNote, PageContainer } from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatDate } from "@/shared/utils/format";

export const Route = createFileRoute("/answer-writing/$promptId")({
  head: () => ({
    meta: [
      { title: "Writing workspace — Exam Assistant" },
      { name: "description", content: "Timed, local writing workspace with attempt history." },
      { property: "og:title", content: "Writing workspace — Exam Assistant" },
      { property: "og:description", content: "Timed, local writing workspace with attempt history." },
    ],
  }),
  component: WritingWorkspace,
});

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    ref.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [running]);

  return { seconds, reset: () => setSeconds(0) };
}

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function WritingWorkspace() {
  const { promptId } = Route.useParams();
  const navigate = useNavigate();
  const prompt = useRepoQuery(() => writingRepository.getPrompt(promptId), [promptId]);
  const attempts = useRepoQuery(() => writingRepository.listAttempts(promptId), [promptId]);

  const [content, setContent] = useState("");
  const [running, setRunning] = useState(false);
  const { seconds, reset } = useTimer(running);

  if (!prompt) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageContainer>
    );
  }

  const words = countWords(content);
  const overLimit = prompt.wordLimit ? words > prompt.wordLimit : false;

  async function save() {
    if (!content.trim()) return;
    await writingRepository.saveAttempt({ promptId, content, durationSeconds: seconds });
    setContent("");
    setRunning(false);
    reset();
    toast.success("Attempt saved");
  }

  return (
    <PageContainer>
      <header className="mb-5">
        <h1 className="text-balance-tight text-2xl font-semibold">{prompt.title}</h1>
        {prompt.brief ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{prompt.brief}</p>
        ) : null}
      </header>

      <div className="mb-3 flex items-center gap-3">
        <Button
          variant="secondary"
          className="tap-target"
          onClick={() => setRunning((value) => !value)}
          aria-pressed={running}
        >
          {running ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          {formatDuration(seconds)}
        </Button>
        <p className={`text-sm ${overLimit ? "font-medium text-destructive" : "text-muted-foreground"}`}>
          {words} words{prompt.wordLimit ? ` / ${prompt.wordLimit}` : ""}
          {overLimit ? " · over limit" : ""}
        </p>
      </div>

      <Textarea
        aria-label="Your answer"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={16}
        placeholder="Start writing…"
        className="min-h-72 rounded-2xl leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="tap-target" onClick={() => void save()} disabled={!content.trim()}>
          Save attempt
        </Button>
        <Button
          variant="ghost"
          className="tap-target text-destructive"
          onClick={async () => {
            await writingRepository.removePrompt(promptId);
            toast.success("Prompt deleted");
            void navigate({ to: "/answer-writing" });
          }}
        >
          Delete prompt
        </Button>
      </div>

      <NotImplementedNote>
        {resolveProvider()
          ? "AI evaluation is optional and not implemented yet — the attempt model already stores an evaluation slot."
          : "AI evaluation will be optional. Add a Gemini key in Settings when it ships."}
      </NotImplementedNote>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Attempt history
        </h2>
        {attempts?.length ? (
          <ul className="flex flex-col gap-2">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="surface-card p-4">
                <p className="text-xs text-muted-foreground">
                  {formatDate(attempt.createdAt)} · {attempt.wordCount} words ·{" "}
                  {formatDuration(attempt.durationSeconds)}
                </p>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed">
                  {attempt.content}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No attempts saved yet.</p>
        )}
      </section>
    </PageContainer>
  );
}
