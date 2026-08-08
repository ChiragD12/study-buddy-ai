import type { ApiRequest, ApiResponse } from "../_lib/http";
import { jsonError, requireCronSecret, requirePost } from "../_lib/http";
import { configuredSubscription, sendPushNotification } from "../_lib/push";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!requirePost(request, response) || !requireCronSecret(request, response)) return;
  const subscription = configuredSubscription();
  if (!subscription) {
    jsonError(response, 503, "PUSH_SUBSCRIPTION_JSON is not configured.");
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
