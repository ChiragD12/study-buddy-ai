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
  items?: { title: string; summary: string; url: string; publishedAt?: string; guid?: string }[];
}

function stableId(item: { guid?: string; url: string; title: string }): string {
  const value = item.guid || item.url || item.title.trim().toLowerCase();
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
        return (payload.items ?? []).map((item) => ({
          id: stableId(item),
          title: item.title,
          summary: item.summary,
          url: item.url,
          sourceUrl: item.url,
          source: payload.source || feed.name,
          publishedAt:
            item.publishedAt && !Number.isNaN(Date.parse(item.publishedAt))
              ? new Date(item.publishedAt).toISOString()
              : new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          categories: feed.category ? [feed.category] : [],
          tags: feed.category ? [feed.category] : [],
          relatedExamIds: query.exams
            .filter((exam) => exam.name.toLowerCase().includes(feed.name.toLowerCase()))
            .map((exam) => exam.id),
        }));
      }),
    );
    const successful = results.filter((result) => result.status === "fulfilled");
    if (!successful.length && results.length)
      throw new Error(
        "Unable to refresh current affairs. Previously downloaded articles are still available.",
      );
    return results
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .slice(0, query.limit ?? 60);
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
