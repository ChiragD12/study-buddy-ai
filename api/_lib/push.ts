import webpush from "web-push";

export interface PushPayload {
  type: "current-affairs" | "test";
  itemId?: string;
  title: string;
  /** The actual article title, for current-affairs notifications. */
  body?: string;
  /** CurrentAffairsTopic value (see currentAffairsTaxonomy.ts). */
  category?: string;
  /** Publisher name, e.g. "The Hindu". */
  source?: string;
  /** Original publisher article URL — what notificationclick opens. */
  url?: string;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export async function sendPushNotification(
  subscription: PushSubscriptionJSON,
  payload: PushPayload,
): Promise<void> {
  const publicKey = process.env["VITE_VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Web Push server environment is not configured.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
