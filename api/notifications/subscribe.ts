import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonError, requirePost } from "../_lib/http.js";
import { subscriptionStore } from "../_lib/subscriptionStore.js";
import type { PushSubscriptionJSON } from "../_lib/push.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!requirePost(request, response)) return;
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as { subscription?: PushSubscriptionJSON })
      : undefined;
  const subscription = body?.subscription;
  if (!subscription?.endpoint || !subscription.keys?.auth || !subscription.keys.p256dh) {
    jsonError(response, 400, "A valid PushSubscription is required.");
    return;
  }
  try {
    await subscriptionStore.register(subscription);
    response.status(200).json({ ok: true });
  } catch {
    jsonError(response, 503, "Subscription storage is not configured for this deployment.");
  }
}
