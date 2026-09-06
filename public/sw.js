const STATIC_CACHE = "student-hub-static-v2";
const DYNAMIC_CACHE = "student-hub-dynamic-v2";

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
  "/logo.png",
  "/favicon.png",
  "/manifest.json",
];

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
      .then(() => self.clients.claim())
  );
});

// Fetch — network first for pages, cache first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API calls and server actions
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Static assets — cache first, then network
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
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

  // Pages — network first, fallback to cache, fallback to offline page
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Offline fallback for navigation
          if (request.mode === "navigate") {
            return caches.match("/offline");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});
