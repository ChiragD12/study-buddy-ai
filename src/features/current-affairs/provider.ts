import type { CurrentAffairsItem, Exam } from "@/shared/types/domain";

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
