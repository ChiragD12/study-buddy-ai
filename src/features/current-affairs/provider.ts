import type { CurrentAffairsItem, Exam } from "@/shared/types/domain";
import { CURRENT_AFFAIRS_FEEDS } from "@/features/current-affairs/feeds";

/**
 * Current-affairs retrieval boundary.
 *
 * Providers (RSS, API, manual paste, AI-assisted retrieval) implement this
 * interface so the UI never changes when a source is added. No sample or
 * fabricated news is shipped with the app.
 */
export interface CurrentAffairsQuery {
  exams: Exam[];
  since?: string;
  limit?: number;
}

export interface CurrentAffairsProvider {
  readonly id: string;
  readonly label: string;
  readonly requiresNetwork: boolean;
  isConfigured(): boolean;
  fetchItems(query: CurrentAffairsQuery): Promise<CurrentAffairsItem[]>;
}

/** Development boundary only: no fabricated stories are presented as live data. */
export const developmentCurrentAffairsProvider: CurrentAffairsProvider = {
  id: "development-empty",
  label: "Development (empty)",
  requiresNetwork: false,
  isConfigured: () => false,
  async fetchItems() {
    return [];
  },
};

export class NoCurrentAffairsProviderError extends Error {
  constructor() {
    super("No current-affairs source is configured yet.");
    this.name = "NoCurrentAffairsProviderError";
  }
}

class ProviderRegistry {
  private readonly providers: CurrentAffairsProvider[] = [];

  register(provider: CurrentAffairsProvider) {
    this.providers.push(provider);
  }

  list(): CurrentAffairsProvider[] {
    return [...this.providers];
  }

  active(): CurrentAffairsProvider | undefined {
    return this.providers.find((provider) => provider.isConfigured());
  }
}

export const currentAffairsProviders = new ProviderRegistry();

interface FeedPayload {
  source?: string;
  items?: {
    title: string;
    summary: string;
    url: string;
    publishedAt?: string;
    guid?: string;
    author?: string;
    imageUrl?: string;
  }[];
}

/**
 * Stable identity for a feed item, in priority order: RSS GUID / Atom id,
 * then canonical article URL, then a normalized title+source+publication-date
 * fallback. This keeps the same article from appearing twice even when
 * multiple feeds carry it, and lets a re-fetch update an existing record
 * instead of creating a duplicate.
 */
function stableId(item: {
  guid?: string;
  url: string;
  title: string;
  source: string;
  publishedAt: string;
}): string {
  const value =
    item.guid ||
    item.url ||
    `${item.title.trim().toLowerCase()}|${item.source.trim().toLowerCase()}|${item.publishedAt.slice(0, 10)}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `ca-${(hash >>> 0).toString(36)}`;
}

export const configuredFeedProvider: CurrentAffairsProvider = {
  id: "public-feeds",
  label: "Configured public feeds",
  requiresNetwork: true,
  isConfigured: () => CURRENT_AFFAIRS_FEEDS.some((feed) => feed.enabled && feed.url),
  async fetchItems(query) {
    const feeds = CURRENT_AFFAIRS_FEEDS.filter((feed) => feed.enabled && feed.url);
    const results = await Promise.allSettled(
      feeds.map(async (feed) => {
        const response = await fetch(
          `/api/current-affairs/feeds?url=${encodeURIComponent(feed.url)}`,
        );
        const payload = (await response.json()) as FeedPayload & { error?: string };
        if (!response.ok) throw new Error(`${feed.name}: ${payload.error ?? "Feed unavailable."}`);
        const source = payload.source || feed.name;
        return (payload.items ?? []).map((item) => {
          const publishedAt =
            item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt))
              ? new Date(item.publishedAt).toISOString()
              : new Date().toISOString();
          return {
            id: stableId({ ...item, source, publishedAt }),
            title: item.title,
            summary: item.summary,
            url: item.url,
            sourceUrl: item.url,
            source,
            author: item.author,
            imageUrl: item.imageUrl,
            publishedAt,
            fetchedAt: new Date().toISOString(),
            categories: feed.category ? [feed.category] : [],
            tags: feed.category ? [feed.category] : [],
            relatedExamIds: query.exams
              .filter((exam) => exam.name.toLowerCase().includes(feed.name.toLowerCase()))
              .map((exam) => exam.id),
          };
        });
      }),
    );
    const successful = results.filter((result) => result.status === "fulfilled");
    if (!successful.length && results.length)
      throw new Error(
        "Unable to refresh current affairs. Previously downloaded articles are still available.",
      );
    const flattened = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
    // The same article can appear in more than one configured feed (e.g. a
    // syndicated wire story); merge by stable id so it is stored once.
    const byId = new Map<string, (typeof flattened)[number]>();
    for (const item of flattened) {
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        continue;
      }
      byId.set(item.id, {
        ...existing,
        categories: [...new Set([...(existing.categories ?? []), ...(item.categories ?? [])])],
        tags: [...new Set([...(existing.tags ?? []), ...(item.tags ?? [])])],
      });
    }
    return [...byId.values()].slice(0, query.limit ?? 60);
  },
};

currentAffairsProviders.register(configuredFeedProvider);

/**
 * Internal ordering only. The score is never rendered as a rating — it just
 * decides sequence in "Today's Important Current Affairs".
 */
export function orderByRelevance(items: CurrentAffairsItem[]): CurrentAffairsItem[] {
  return [...items].sort(
    (a, b) =>
      (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
      b.publishedAt.localeCompare(a.publishedAt),
  );
}
