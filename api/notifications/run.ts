import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonError, requireCronSecret } from "../_lib/http.js";
import { sendPushNotification, type PushPayload } from "../_lib/push.js";
import { subscriptionStore } from "../_lib/subscriptionStore.js";
import {
  CURRENT_AFFAIRS_FEED_URLS,
  fetchFeedXml,
  parseFeed,
  type NormalizedFeedItem,
} from "../current-affairs/feeds.js";
import { classifyArticles } from "../_lib/geminiClassifier.js";
import { processedStore } from "../_lib/processedStore.js";
import {
  CURRENT_AFFAIRS_TOPICS,
  type CurrentAffairsTopic,
} from "../_lib/currentAffairsTaxonomy.js";
import { canonicalArticleId } from "../_lib/articleIdentity.js";

/** Safety cap per run, mirroring MAX_ITEMS_PER_RUN in
 *  src/ai/context/currentAffairsClassification.ts — bounds AI spend even if
 *  a huge backlog of "new" articles ever accumulates (e.g. after downtime).
 *  Anything past the cap simply isn't processed yet and is picked up on a
 *  later run, same as an AI-classification failure. */
const MAX_ARTICLES_PER_RUN = 60;

interface FetchedArticle extends NormalizedFeedItem {
  id: string;
  source: string;
}

interface DeadSubscriptionError {
  statusCode?: number;
}

function isDeadSubscriptionError(error: unknown): boolean {
  const statusCode = (error as DeadSubscriptionError | null)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  // cron-job.org invokes this endpoint with GET; POST is also still accepted.
  // `requirePost` (in http.ts) only allows POST, so the method check is done
  // inline here rather than changing that shared helper.
  if (request.method !== "GET" && request.method !== "POST") {
    jsonError(response, 405, "GET or POST required.");
    return;
  }
  if (!requireCronSecret(request, response)) return;

  let stored;
  try {
    stored = await subscriptionStore.get();
  } catch {
    jsonError(response, 503, "Subscription storage is not configured for this deployment.");
    return;
  }
  if (!stored) {
    response.status(200).json({ ok: true, status: "subscription-storage-not-configured" });
    return;
  }

  // Undefined preferences (never set) default to every topic enabled; an
  // explicit `[]` (every checkbox unchecked) means notify for nothing. See
  // StoredSubscription in subscriptionStore.ts.
  const enabledTopics = new Set<CurrentAffairsTopic>(
    stored.currentAffairsCategories ?? CURRENT_AFFAIRS_TOPICS,
  );

  // ---- 1. Fetch + normalize every configured feed. One feed failing must
  // not abort the rest — same fault-tolerance the client-side page has. ----
  let feedsChecked = 0;
  const fetched: FetchedArticle[] = [];
  await Promise.all(
    CURRENT_AFFAIRS_FEED_URLS.map(async (feedUrl) => {
      feedsChecked += 1;
      try {
        const xml = await fetchFeedXml(feedUrl);
        const { source, items } = parseFeed(xml, feedUrl);
        const sourceName = source || feedUrl;
        for (const item of items) {
          fetched.push({
            ...item,
            source: sourceName,
            id: canonicalArticleId({
              guid: item.guid,
              url: item.url,
              title: item.title,
              source: sourceName,
              publishedAt: item.publishedAt,
            }),
          });
        }
      } catch (error) {
        console.error(`[notifications/run] Failed to fetch/parse ${feedUrl}:`, error);
      }
    }),
  );

  // ---- 2. Dedupe within this run (a story can appear in more than one
  // feed, or a feed can repeat an entry across polls). ----
  const byId = new Map<string, FetchedArticle>();
  for (const article of fetched) {
    if (!byId.has(article.id)) byId.set(article.id, article);
  }
  const articlesFetched = byId.size;

  // ---- 3. Only articles this worker hasn't processed before. ----
  let newIds: string[];
  try {
    newIds = await processedStore.filterNew([...byId.keys()]);
  } catch {
    jsonError(response, 503, "Subscription storage is not configured for this deployment.");
    return;
  }
  const newArticles = newIds.slice(0, MAX_ARTICLES_PER_RUN).map((id) => byId.get(id)!);

  if (!newArticles.length) {
    response.status(200).json({
      ok: true,
      feedsChecked,
      articlesFetched,
      newArticles: 0,
      classified: 0,
      important: 0,
      notificationsSent: 0,
    });
    return;
  }

  // ---- 4. Classify only the new articles. Any article the classifier
  // doesn't return a result for is left unmarked below, so it's retried
  // (reclassified) on a later run rather than guessed at or silently
  // dropped. ----
  const classifications = await classifyArticles(
    newArticles.map((article) => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      source: article.source,
    })),
  );

  let classified = 0;
  let important = 0;
  let notificationsSent = 0;
  const toMarkProcessed: string[] = [];
  let subscriptionDead = false;

  for (const article of newArticles) {
    const classification = classifications.get(article.id);
    if (!classification) continue; // AI unavailable/failed — retry next run, don't mark processed.
    classified += 1;

    const isImportantOrCritical =
      classification.importanceLevel === "important" ||
      classification.importanceLevel === "critical";
    if (isImportantOrCritical) important += 1;

    const eligible =
      classification.notificationEligible &&
      isImportantOrCritical &&
      enabledTopics.has(classification.primaryTopic) &&
      Boolean(article.url);

    if (!eligible) {
      // Classified and decided against — done with this article; don't
      // reclassify it every 15 minutes.
      toMarkProcessed.push(article.id);
      continue;
    }

    if (subscriptionDead) {
      // No subscription left to send to this run, but the classification
      // decision was made — still mark processed rather than reclassifying
      // it next run just because delivery had nowhere to go this time.
      toMarkProcessed.push(article.id);
      continue;
    }

    const payload: PushPayload = {
      type: "current-affairs",
      itemId: article.id,
      title: "Important Current Affairs",
      body: article.title,
      category: classification.primaryTopic,
      source: article.source,
      url: article.url,
    };

    try {
      await sendPushNotification(stored.subscription, payload);
      notificationsSent += 1;
      toMarkProcessed.push(article.id);
    } catch (error) {
      if (isDeadSubscriptionError(error)) {
        subscriptionDead = true;
        try {
          await subscriptionStore.remove(stored.subscription.endpoint);
        } catch {
          // Best effort — a stale subscription that fails to delete just
          // gets removed on a future attempt.
        }
        // Subscription is gone; nothing more to retry this article for.
        toMarkProcessed.push(article.id);
      } else {
        console.error("[notifications/run] Push delivery failed:", error);
        // Transient failure (network, Web Push server hiccup, etc.) — leave
        // unprocessed so this article is retried next run.
      }
    }
  }

  try {
    await processedStore.markProcessed(toMarkProcessed);
  } catch (error) {
    console.error("[notifications/run] Failed to persist processed articles:", error);
  }

  response.status(200).json({
    ok: true,
    feedsChecked,
    articlesFetched,
    newArticles: newArticles.length,
    classified,
    important,
    notificationsSent,
  });
}
