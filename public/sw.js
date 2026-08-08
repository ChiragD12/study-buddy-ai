/// <reference lib="webworker" />
/*
 * Project-owned service worker.
 *
 * Plain JS so it can be served directly during this phase. After export you
 * can move it to `src/pwa/service-worker/sw.ts` and build it with
 * vite-plugin-pwa `injectManifest` (see README) — the event handlers below are
 * written to survive that move unchanged.
 */

const CACHE_VERSION = "v1";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Placeholder for the injectManifest precache list:
// self.__WB_MANIFEST

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("app-shell-") && key !== APP_SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Navigations: network-first with an offline fallback. Never cache-first HTML.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!/\.(?:js|css|woff2?|png|svg|webp|ico)$/.test(url.pathname)) return;

  event.respondWith(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});

// ---- Web Push -------------------------------------------------------------

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Exam Assistant", body: event.data.text() };
  }
  const title = payload.title || "Exam Assistant";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || "exam-assistant",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The app re-registers on next launch; surfaced in the UI as
  // "subscription needs renewal".
  event.waitUntil(self.registration.unregister().then(() => undefined));
});
