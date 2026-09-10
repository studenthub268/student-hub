// Cache names embed the app version so every release invalidates every
// visitor's caches without a hand edit — one `npm version` bump rewrites the
// number here and on the terms page at build time
// (scripts/write-deploy-version.mjs).
const STATIC_CACHE = "student-hub-static-v0.2.13";
const DYNAMIC_CACHE = "student-hub-dynamic-v0.2.13";

// Status endpoints (verification banner, admin flag) — cached so signed-in
// pages render correctly offline and instantly, refreshed in background.
const STATUS_CACHE = "student-hub-status-v5";
const STATUS_PATHS = ["/api/check-verified", "/api/check-admin"];

// Deploy-version beacon must ALWAYS hit the real network — the whole point
// is to notice when the deployed build changes.
const NEVER_CACHE_PATHS = ["/api/ping", "/api/version"];

// Dev servers reuse deterministic chunk URLs with changing contents; the
// service worker must never serve them cache-first or code changes will
// appear to never apply. Production builds content-hash their chunks, so
// cache-first stays safe there.
const IS_DEV =
  self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

// Precache ONLY tiny immutable assets plus the offline fallback.
// Real pages (/, /browse, …) are NOT precached: a precached page is a frozen
// snapshot that no longer updates when a new deploy ships (offline caching
// below keeps visited pages available without that trap).
const PRECACHE_URLS = [
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

// Message hook: the app can ask the old worker to skip waiting so the new
// one takes over immediately after a deploy.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Activate — clean up old caches. The dynamic (page) cache is dropped on
// every SW update so a deploy is picked up on the FIRST visit instead of
// serving a stale page once — the "why do I still see the old site" trap.
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

  // Status endpoints — NETWORK-FIRST, same policy as pages: when online the
  // live server always answers (never a cached banner), and the cache only
  // steps in when the network is unreachable (offline).
  if (STATUS_PATHS.includes(url.pathname)) {
    event.respondWith(
      caches.open(STATUS_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() =>
            cache
              .match(request)
              .then(
                (cached) =>
                  cached ||
                  new Response(JSON.stringify({ offline: true }), {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                  })
              )
          )
      )
    );
    return;
  }

  // Never intercept file downloads (R2), auth callbacks, the connectivity
  // probe, or the deploy-version beacon — these must always hit the network.
  if (
    url.hostname.includes("r2.") ||
    url.hostname.includes("vercel-storage") ||
    url.pathname.startsWith("/api/download") ||
    NEVER_CACHE_PATHS.includes(url.pathname)
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

  // Pages — NETWORK-FIRST with cache fallback: the latest deploy always wins
  // when online (no "why am I still seeing the old site" after deploys),
  // while the cached copy keeps previously visited pages available offline.
  // Navigations get a short network budget; past it the cached page answers
  // instantly and the in-flight refresh updates the cache for next time.
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
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

        // Fresh wins if the network answers (6s budget on slow links);
        // otherwise serve the cached page at once — offline or not.
        return Promise.race([
          network,
          new Promise((resolve) => setTimeout(() => resolve(undefined), 6000)),
        ]).then((fresh) => {
          if (fresh) return fresh;
          if (cached) return cached;
          return network.then((response) => {
            if (response) return response;
            // Offline fallback for navigations
            if (request.mode === "navigate") return caches.match("/offline");
            return new Response("Offline", { status: 503 });
          });
        });
      })
    )
  );
});
