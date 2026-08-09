import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonError, requireCronSecret, requirePost } from "../_lib/http.js";
import { sendPushNotification } from "../_lib/push.js";
import { subscriptionStore } from "../_lib/subscriptionStore.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!requirePost(request, response) || !requireCronSecret(request, response)) return;
  let subscription;
  try {
    subscription = await subscriptionStore.get();
  } catch {
    jsonError(response, 503, "Subscription storage is not configured for this deployment.");
    return;
  }
  if (!subscription) {
    response.status(200).json({ ok: true, status: "subscription-storage-not-configured" });
    return;
  }
  try {
    await sendPushNotification(subscription, {
      type: "current-affairs",
      title: "Current Affairs update",
      category: "Other state-specific relevance",
    });
    response.status(200).json({ ok: true, status: "push-sent" });
  } catch (error) {
    jsonError(
      response,
      502,
      error instanceof Error ? "Push delivery failed." : "Push delivery failed.",
    );
  }
}
