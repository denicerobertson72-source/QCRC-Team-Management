const CACHE_VERSION = "qcrc-pwa-v7";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/QCRC.png",
];
const SAFE_PAGE_CACHE_PATHS = new Set(["/boats", "/lineups", "/programs"]);
const NEVER_CACHE_PREFIXES = ["/admin", "/reserve", "/reservations", "/safety", "/notifications", "/account", "/damage", "/api"];
const NEVER_CACHE_PATHS = new Set(["/", "/login"]);

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

function isSafePageRoute(url) {
  return SAFE_PAGE_CACHE_PATHS.has(url.pathname);
}

function isNeverCacheRoute(url) {
  if (NEVER_CACHE_PATHS.has(url.pathname)) {
    return true;
  }

  return NEVER_CACHE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      void cache.put(request, response.clone());
    }

    return response;
  } catch {
    return (await cache.match(request)) ?? (await caches.match(OFFLINE_URL));
  }
}

async function staleWhileRevalidatePage(request) {
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => cached ?? caches.match(OFFLINE_URL));

  return cached ?? networkFetch;
}

async function staleWhileRevalidateAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => cached);

  return cached ?? networkFetch;
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
          keys.filter((key) => ![STATIC_CACHE, ASSET_CACHE, PAGE_CACHE].includes(key)).map((key) => caches.delete(key)),
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

  if (request.mode === "navigate") {
    if (isSafePageRoute(url) && !url.search) {
      event.respondWith(staleWhileRevalidatePage(request));
      return;
    }

    if (isNeverCacheRoute(url) || url.search) {
      event.respondWith(networkFirstNavigation(request));
      return;
    }

    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidateAsset(request));
  }
});
