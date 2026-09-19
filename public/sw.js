const CACHE_VERSION = "qcrc-pwa-v8";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/QCRC.png",
];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "QCRC notification";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "You have a new club notification.",
      icon: payload.icon || "/icon-192.png",
      badge: payload.badge || "/icon-192.png",
      data: { url: payload.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  const url = requestedUrl.origin === self.location.origin ? requestedUrl.href : new URL("/notifications", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      return existing ? existing.focus().then(() => existing.navigate(url)) : self.clients.openWindow(url);
    }),
  );
});

async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => ![STATIC_CACHE, ASSET_CACHE].includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Navigations, RSC payloads, APIs, and Server Actions must always reach the
  // network. Caching them can reconnect an open operational page to old data.
  if (request.mode === "navigate" || url.pathname.startsWith("/api/") || url.searchParams.has("_rsc") || request.headers.get("RSC")) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirstStaticAsset(request));
  }
});
