import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonError, requireCronSecret } from "../_lib/http.js";
import { sendPushNotification } from "../_lib/push.js";
import { subscriptionStore } from "../_lib/subscriptionStore.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  // cron-job.org invokes this endpoint with GET; POST is also still accepted.
  // `requirePost` (in http.ts) only allows POST, so the method check is done
  // inline here rather than changing that shared helper.
  if (request.method !== "GET" && request.method !== "POST") {
    jsonError(response, 405, "GET or POST required.");
    return;
  }
  if (!requireCronSecret(request, response)) return;
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
