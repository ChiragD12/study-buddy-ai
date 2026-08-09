import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonError, requirePost } from "../_lib/http.js";
import { subscriptionStore } from "../_lib/subscriptionStore.js";
import type { PushSubscriptionJSON } from "../_lib/push.js";
import { isCurrentAffairsTopic, type CurrentAffairsTopic } from "../_lib/currentAffairsTaxonomy.js";

interface SubscribeBody {
  subscription?: PushSubscriptionJSON;
  /**
   * Optional Current Affairs topic preferences (see
   * src/features/notifications/preferences.ts). Sent on initial subscribe
   * and again whenever the person changes their category checkboxes while
   * already subscribed (see settings.notifications.tsx) — subscriptionStore
   * upserts this onto the same record rather than requiring a fresh
   * subscribe/unsubscribe cycle.
   */
  currentAffairsCategories?: unknown;
}

function parseCategories(value: unknown): CurrentAffairsTopic[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isCurrentAffairsTopic);
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!requirePost(request, response)) return;
  const body =
    request.body && typeof request.body === "object" ? (request.body as SubscribeBody) : undefined;
  const subscription = body?.subscription;
  if (!subscription?.endpoint || !subscription.keys?.auth || !subscription.keys.p256dh) {
    jsonError(response, 400, "A valid PushSubscription is required.");
    return;
  }
  try {
    await subscriptionStore.register(subscription, parseCategories(body?.currentAffairsCategories));
    response.status(200).json({ ok: true });
  } catch {
    jsonError(response, 503, "Subscription storage is not configured for this deployment.");
  }
}
