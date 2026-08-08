import { createFileRoute } from "@tanstack/react-router";
import { Newspaper, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { currentAffairsProviders, orderByRelevance } from "@/features/current-affairs/provider";
import { currentAffairsRepository } from "@/data/repositories/knowledge.repository";
import { examRepository } from "@/data/repositories/exams.repository";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  NotImplementedNote,
  PageContainer,
  PageHeader,
} from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatDate } from "@/shared/utils/format";

export const Route = createFileRoute("/current-affairs")({
  head: () => ({
    meta: [
      { title: "Current Affairs — Exam Assistant" },
      {
        name: "description",
        content: "Exam-aware current affairs, ordered by internal relevance.",
      },
      { property: "og:title", content: "Current Affairs — Exam Assistant" },
      {
        property: "og:description",
        content: "Exam-aware current affairs, ordered by internal relevance.",
      },
    ],
  }),
  component: CurrentAffairsPage,
});

function CurrentAffairsPage() {
  const stored = useRepoQuery(() => currentAffairsRepository.list());
  const exams = useRepoQuery(() => examRepository.list());
  const [refreshing, setRefreshing] = useState(false);
  const provider = currentAffairsProviders.active();
  const itemId = new URLSearchParams(window.location.search).get("itemId");

  useEffect(() => {
    if (!itemId || !stored) return;
    document.getElementById(`current-affairs-${itemId}`)?.scrollIntoView({ block: "center" });
    void currentAffairsRepository.markRead(itemId);
  }, [itemId, stored]);

  async function refresh() {
    if (!provider) {
      toast.error("No current-affairs source configured yet.");
      return;
    }
    setRefreshing(true);
    try {
      const items = await provider.fetchItems({ exams: exams ?? [] });
      await currentAffairsRepository.saveMany(items);
      toast.success(`Updated from ${provider.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retrieval failed.");
    } finally {
      setRefreshing(false);
    }
  }

  const items = orderByRelevance(stored ?? []);

  return (
    <PageContainer>
      <PageHeader
        title="Today's Important Current Affairs"
        description="Ordering is decided internally from your exams, subjects and recency. No scores are shown."
        action={
          <Button
            variant="secondary"
            className="tap-target"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        }
      />

      {!provider ? (
        <NotImplementedNote>
          No retrieval source is connected. Providers implement <code>CurrentAffairsProvider</code>{" "}
          (RSS, API or custom) and register themselves — the app deliberately ships without sample
          news.
        </NotImplementedNote>
      ) : null}

      <div className="mt-5">
        {stored === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Newspaper className="size-6" />}
            title="Nothing retrieved yet"
            description="Once a source is connected, items appear here ordered by relevance to your exams."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li id={`current-affairs-${item.id}`} key={item.id} className="surface-card p-4">
                <p className="font-medium">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.source} · {formatDate(item.publishedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
