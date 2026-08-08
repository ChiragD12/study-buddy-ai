import { isStandalone, registerServiceWorker } from "@/pwa/register";

/**
 * Web Push architecture.
 *
 * Real push only — no fake local notifications pretending to be server push.
 * The eventual delivery chain is:
 *   cron-job.org -> HTTPS endpoint (any host) -> Web Push -> iOS PWA -> SW.
 * The endpoint is configured by the user and stored locally, so the app is not
 * coupled to any particular hosting provider.
 */

export type PushState =
  | "unsupported"
  | "requires-install"
  | "permission-not-requested"
  | "permission-denied"
  | "permission-granted-but-not-subscribed"
  | "subscribed"
  | "needs-renewal";

const SUBSCRIPTION_ENDPOINT = "/api/notifications/subscribe";
const UNSUBSCRIPTION_ENDPOINT = "/api/notifications/unsubscribe";

export function getVapidPublicKey(): string {
  return import.meta.env["VITE_VAPID_PUBLIC_KEY"] ?? "";
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iOS only exposes Web Push to Home Screen installed web apps. */
export function requiresHomeScreenInstall(): boolean {
  if (typeof navigator === "undefined") return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return isIOS && !isStandalone();
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return requiresHomeScreenInstall() ? "requires-install" : "unsupported";
  if (requiresHomeScreenInstall()) return "requires-install";
  const permission = Notification.permission;
  if (permission === "denied") return "permission-denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const expired =
      subscription.expirationTime !== null && subscription.expirationTime < Date.now();
    return expired ? "needs-renewal" : "subscribed";
  }
  return permission === "granted"
    ? "permission-granted-but-not-subscribed"
    : "permission-not-requested";
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  return Notification.requestPermission();
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function subscribeToPush(): Promise<PushSubscription> {
  const vapid = getVapidPublicKey();
  if (!vapid) throw new Error("VITE_VAPID_PUBLIC_KEY is not configured.");
  const registration = await registerServiceWorker();
  if (!registration) throw new Error("A production service worker is required for push.");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
  });
  await registerSubscription(subscription);
  return subscription;
}

/** Sends only the push subscription to the user-configured endpoint. */
export async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch(SUBSCRIPTION_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error("The notification server could not register this device.");
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const response = await fetch(UNSUBSCRIPTION_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw new Error("The notification server could not remove this device.");
  await subscription.unsubscribe();
}
