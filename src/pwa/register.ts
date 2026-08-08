/**
 * Service-worker registration wrapper.
 *
 * The worker is only registered for the real installed/deployed app. It is
 * refused inside dev, iframes and hosted preview environments so stale HTML is
 * never served during development. `?sw=off` unregisters it.
 */
const SW_URL = "/sw.js";

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

function shouldRegister(): boolean {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  if (window.top !== window.self) return false;
  if (isPreviewHost(window.location.hostname)) return false;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
}

async function unregisterExisting(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => registration.active?.scriptURL.endsWith(SW_URL))
      .map((registration) => registration.unregister()),
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!shouldRegister()) {
    await unregisterExisting();
    return null;
  }
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (error) {
    console.error("Service worker registration failed", error);
    return null;
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}
