const STATIC_CACHE = "student-hub-static-v5";
const DYNAMIC_CACHE = "student-hub-dynamic-v5";

// Status endpoints (verification banner, admin flag) — cached so signed-in
// pages render correctly offline and instantly, refreshed in background.
const STATUS_CACHE = "student-hub-status-v5";
const STATUS_PATHS = ["/api/check-verified", "/api/check-admin"];

// Dev servers reuse deterministic chunk URLs with changing contents; the
// service worker must never serve them cache-first or code changes will
// appear to never apply. Production builds content-hash their chunks, so
// cache-first stays safe there.
const IS_DEV =
  self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

const PRECACHE_URLS = [
  "/",
  "/browse",
  "/find",
  "/contact",
  "/login",
  "/signup",
  "/terms",
  "/offline", // must be precached: it is the offline fallback for any uncached page
  "/logo.png",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json",
];

// Cap on dynamically cached pages/subresources so one long session (or many
// cached R2 PDFs) can't grow the cache without bound and hit quota errors.
const MAX_DYNAMIC_ENTRIES = 60;

// Install — precache critical assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => trimDynamicCache())
      .then(() => self.clients.claim())
  );
});

// Oldest-first trim: cache.keys() returns entries in insertion order, so
// dropping from the front approximates LRU for a browsing session.
async function trimDynamicCache() {
  const cache = await caches.open(DYNAMIC_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_DYNAMIC_ENTRIES) return;
  const excess = keys.slice(0, keys.length - MAX_DYNAMIC_ENTRIES);
  await Promise.all(excess.map((request) => cache.delete(request)));
}

// Fetch — network first for pages, cache first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls and server actions
  if (url.pathname.startsWith("/auth/")) return;

  // Status endpoints — stale-while-revalidate so the verification/admin
  // banner works offline and never delays a page render.
  if (STATUS_PATHS.includes(url.pathname)) {
    event.respondWith(
      caches.open(STATUS_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Never intercept file downloads (R2) or auth callbacks
  if (
    url.hostname.includes("r2.") ||
    url.hostname.includes("vercel-storage") ||
    url.pathname.startsWith("/api/download")
  ) {
    return;
  }

  // Static assets — cache first, then network
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Next.js static assets (_next/static) — cache first (production only)
  if (IS_DEV && url.pathname.startsWith("/_next/static/")) {
    return; // dev: let the network serve fresh chunks
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Pages — STALE-WHILE-REVALIDATE: serve the cached page instantly (works
  // offline), then refresh the cache in the background. First-ever visits
  // still come from the network. Cached pages expire after 24h offline.
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const isStale = !cached ||
          (cached.headers.get("sw-cached-at") &&
            Date.now() - new Date(cached.headers.get("sw-cached-at")).getTime() > 86_400_000);

        const fetchAndCache = fetch(request)
          .then((response) => {
            if (response.ok && response.type === "basic") {
              const clone = response.clone();
              const headers = new Headers(response.headers);
              headers.set("sw-cached-at", new Date().toISOString());
              cache.put(
                request,
                new Response(clone.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers,
                })
              );
              trimDynamicCache();
            }
            return response;
          })
          .catch(() => undefined);

        // Stale (or offline): answer from cache immediately while the
        // network refresh happens in the background.
        if (cached && !isStale) {
          void fetchAndCache; // background refresh; result ignored
          return cached;
        }
        return fetchAndCache.then((response) => {
          if (response) return response;
          // Offline fallback for navigations
          if (request.mode === "navigate") return caches.match("/offline");
          return cached || new Response("Offline", { status: 503 });
        });
      })
    )
  );
});
