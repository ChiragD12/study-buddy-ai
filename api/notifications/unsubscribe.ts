import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { jsonError, requirePost } from "../_lib/http.js";
import { subscriptionStore } from "../_lib/subscriptionStore.js";

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (!requirePost(request, response)) return;
  const body =
    request.body && typeof request.body === "object"
      ? (request.body as { endpoint?: string })
      : undefined;
  if (!body?.endpoint) {
    jsonError(response, 400, "A subscription endpoint is required.");
    return;
  }
  try {
    await subscriptionStore.remove(body.endpoint);
    response.status(200).json({ ok: true });
  } catch {
    jsonError(response, 503, "Subscription storage is not configured for this deployment.");
  }
}
