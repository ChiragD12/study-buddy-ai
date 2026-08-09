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
    jsonError(response, 503, "No push subscription is registered.");
    return;
  }
  try {
    await sendPushNotification(subscription, {
      type: "test",
      title: "Exam Assistant test notification",
    });
    response.status(200).json({ ok: true, status: "push-sent" });
  } catch {
    jsonError(response, 502, "Push delivery failed.");
  }
}
