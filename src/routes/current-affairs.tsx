import { createFileRoute } from "@tanstack/react-router";
import { Bookmark, Newspaper, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { currentAffairsProviders } from "@/features/current-affairs/provider";
import { currentAffairsRepository } from "@/data/repositories/knowledge.repository";
import { examRepository } from "@/data/repositories/exams.repository";
import { settingsRepository } from "@/data/repositories/settings.repository";
import { now } from "@/data/repositories/util";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  NotImplementedNote,
  PageContainer,
  PageHeader,
} from "@/shared/components/Page";
import { useRepoQuery } from "@/shared/hooks/useRepoQuery";
import { formatDate } from "@/shared/utils/format";
import type { CurrentAffairsItem } from "@/shared/types/domain";

/** How long a background refresh is skipped after a successful one. */
const CURRENT_AFFAIRS_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

export const Route = createFileRoute("/current-affairs")({
  head: () => ({
    meta: [
      { title: "Current Affairs — Exam Assistant" },
      { name: "description", content: "Browse and save locally stored current affairs." },
    ],
  }),
  component: CurrentAffairsPage,
});

function CurrentAffairsPage() {
  const stored = useRepoQuery(() => currentAffairsRepository.list());
  const exams = useRepoQuery(() => examRepository.list());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const provider = currentAffairsProviders.active();
  const categories = useMemo(
    () => [...new Set((stored ?? []).flatMap((item) => item.categories ?? []))].sort(),
    [stored],
  );
  const sources = useMemo(
    () => [...new Set((stored ?? []).map((item) => item.source))].sort(),
    [stored],
  );
  const items = (stored ?? []).filter((item) => {
    const haystack = [item.title, item.summary, item.source, ...(item.categories ?? [])]
      .join(" ")
      .toLowerCase();
    return (
      (!query || haystack.includes(query.toLowerCase())) &&
      (!category || item.categories?.includes(category)) &&
      (!source || item.source === source) &&
      (!savedOnly || Boolean(item.savedAt))
    );
  });

  async function refresh(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!provider) {
      if (!silent)
        toast.error(
          "No feed is configured yet. Add a verified public RSS or Atom URL to the feed catalogue.",
        );
      return;
    }
    setRefreshing(true);
    try {
      // `provider.fetchItems` aggregates across every configured feed and
      // only rejects when none of them could be retrieved; a resolved call
      // here already represents a successful (possibly partial) refresh, so
      // any articles it returns are saved and the error state is cleared —
      // failures never delete or hide previously cached articles.
      const incoming = await provider.fetchItems({ exams: exams ?? [], limit: 60 });
      await currentAffairsRepository.saveMany(incoming);
      await settingsRepository.update({ currentAffairsRefreshedAt: now() });
      setRefreshError(null);
      if (!silent) toast.success(`Refreshed ${incoming.length} current-affairs items`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Couldn't refresh current affairs. Previously downloaded articles are still available.";
      // Cached articles (`stored`) are left untouched here — nothing is
      // deleted on failure, so the list below keeps rendering what's
      // already downloaded.
      setRefreshError(message);
      if (!silent) toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }

  // Cached articles render immediately from IndexedDB (see `stored` above).
  // On top of that, silently refresh in the background at most once per
  // cache interval — never on every render, never blocking the cached list.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await settingsRepository.get();
      const lastRefresh = settings.currentAffairsRefreshedAt;
      const stale =
        !lastRefresh ||
        Date.now() - new Date(lastRefresh).getTime() > CURRENT_AFFAIRS_REFRESH_INTERVAL_MS;
      if (stale && !cancelled) await refresh({ silent: true });
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount; `refresh` closes over the latest provider/exams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasCachedArticles = Boolean(stored && stored.length > 0);

  /** Marks the article read, then opens the original URL in a new tab/window. */
  function openArticle(item: CurrentAffairsItem) {
    void currentAffairsRepository.markRead(item.id);
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Current Affairs"
        description="Browse public-feed summaries stored locally for revision."
        action={
          <Button
            variant="secondary"
            className="tap-target"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} /> Refresh
          </Button>
        }
      />
      {!provider ? (
        <NotImplementedNote>
          No verified public feed is configured yet. Previously downloaded articles remain available
          offline.
        </NotImplementedNote>
      ) : refreshError ? (
        <NotImplementedNote>
          {refreshError}{" "}
          {hasCachedArticles
            ? "Showing previously downloaded articles."
            : "Previously downloaded articles remain available offline."}
        </NotImplementedNote>
      ) : null}
      <div className="mt-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search current affairs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, summary, source"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="tap-target rounded-xl border bg-surface px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="tap-target rounded-xl border bg-surface px-3 text-sm"
          >
            <option value="">All sources</option>
            {sources.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <Button
            variant={savedOnly ? "default" : "secondary"}
            className="tap-target"
            onClick={() => setSavedOnly((value) => !value)}
          >
            <Bookmark className="size-4" /> Saved
          </Button>
        </div>
      </div>
      <div className="mt-5">
        {stored === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !stored.length ? (
          <EmptyState
            icon={<Newspaper className="size-6" />}
            title="No current-affairs articles yet"
            description="Refresh after configuring a verified public RSS or Atom feed."
          />
        ) : !items.length ? (
          <EmptyState
            title="No current-affairs items match your search"
            description="Try another search or filter."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <ArticleCard
                key={item.id}
                item={item}
                onOpen={() => openArticle(item)}
                onToggleSave={() => void currentAffairsRepository.toggleSaved(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

function ArticleCard({
  item,
  onOpen,
  onToggleSave,
}: {
  item: CurrentAffairsItem;
  onOpen: () => void;
  onToggleSave: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;

  // The whole card opens the original article externally. It's a
  // non-button element (an <li>) acting as a link — role="link" plus
  // Enter-key handling — specifically so the Save control below can stay
  // a real <button> without nesting one interactive element inside
  // another. Save's own click handler stops propagation so it never
  // triggers the card's open behavior.
  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <li
      role="link"
      tabIndex={0}
      aria-label={item.title}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="surface-card cursor-pointer p-4"
    >
      <div className="flex items-start gap-3">
        {showImage ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="size-16 shrink-0 rounded-lg border object-cover sm:size-20"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-medium ${item.readAt ? "" : "font-semibold"}`}>{item.title}</p>
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {item.summary || "No summary provided."}
            </p>
          </div>
          <button
            type="button"
            aria-label={item.savedAt ? `Unsave ${item.title}` : `Save ${item.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSave();
            }}
            className="tap-target inline-flex shrink-0 items-center justify-center rounded-xl hover:bg-accent"
          >
            <Bookmark
              className={
                item.savedAt ? "size-4 fill-primary text-primary" : "size-4 text-muted-foreground"
              }
            />
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {item.source} · {formatDate(item.publishedAt)}
        {item.categories?.length ? ` · ${item.categories.join(", ")}` : ""}
      </p>
    </li>
  );
}
