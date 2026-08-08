import webpush from "web-push";

export interface PushPayload {
  type: "current-affairs" | "test";
  itemId?: string;
  title: string;
  category?: string;
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

export function configuredSubscription(): PushSubscriptionJSON | null {
  const serialized = process.env["PUSH_SUBSCRIPTION_JSON"];
  if (!serialized) return null;
  try {
    const subscription = JSON.parse(serialized) as PushSubscriptionJSON;
    if (!subscription.endpoint || !subscription.keys?.auth || !subscription.keys.p256dh)
      return null;
    return { ...subscription, expirationTime: subscription.expirationTime ?? null };
  } catch {
    return null;
  }
}
