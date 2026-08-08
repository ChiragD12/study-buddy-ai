import { isStandalone } from "@/pwa/register";

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
  | "default"
  | "granted"
  | "denied"
  | "subscribed"
  | "needs-renewal";

const ENDPOINT_KEY = "exam-assistant.push.endpointUrl";
const VAPID_KEY = "exam-assistant.push.vapidPublicKey";

export function getPushEndpoint(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(ENDPOINT_KEY) ?? "";
}

export function setPushEndpoint(url: string): void {
  localStorage.setItem(ENDPOINT_KEY, url.trim());
}

export function getVapidPublicKey(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(VAPID_KEY) ?? "";
}

export function setVapidPublicKey(key: string): void {
  localStorage.setItem(VAPID_KEY, key.trim());
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
  if (permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const expired =
      subscription.expirationTime !== null && subscription.expirationTime < Date.now();
    return expired ? "needs-renewal" : "subscribed";
  }
  return permission === "granted" ? "granted" : "default";
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
  if (!vapid) throw new Error("Add your VAPID public key before subscribing.");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
  });
  await registerSubscription(subscription);
  return subscription;
}

/** Sends only the push subscription to the user-configured endpoint. */
export async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const endpoint = getPushEndpoint();
  if (!endpoint) return;
  await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}
