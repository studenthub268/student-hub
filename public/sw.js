// Cache names embed the app version so every release invalidates every
// visitor's caches without a hand edit — one `npm version` bump rewrites the
// number here and on the terms page at build time
// (scripts/write-deploy-version.mjs).
const STATIC_CACHE = "student-hub-static-v0.2.28";
const DYNAMIC_CACHE = "student-hub-dynamic-v0.2.28";

// Status endpoints (admin flag) — cached so signed-in pages render
// correctly offline and instantly, refreshed in background.
const STATUS_CACHE = "student-hub-status-v5";
const STATUS_PATHS = ["/api/check-admin"];

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
  "/favicon.png?v=3",
  "/icon-192.png?v=3",
  "/icon-512.png?v=3",
  "/manifest.json",
];

// Cap on dynamically cached pages/subresources so one long session (or many
// cached R2 PDFs) can't grow the cache without bound and hit quota errors.
const MAX_DYNAMIC_ENTRIES = 60;

// Network race timeout for page navigations. On 3G a cold navigation can
// hang 10-30s before the server responds; racing the network against the
// cache with a short deadline means a cached page paints in <300ms and the
// fresh response replaces it in the background when it eventually lands.
// 2.5s: comfortably above a fast 4G RTT, well below where a user gives up.
const NETWORK_TIMEOUT_MS = 2500;

// fetchWithTimeout: resolves with the network response, or null if the
// network hasn't answered within `ms` (the request keeps running in the
// background — the caller just stops waiting for it).
function fetchWithTimeout(request, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

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

// ---- Notifications ------------------------------------------------------
// Tapping the notification should land the user in the app: focus the
// existing tab if there is one, otherwise open a fresh one. Without this,
// clicks on desktop Chrome do nothing (notification just dismisses).

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.url || "/browse";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Prefer a tab that is already on the target path, else any app tab.
      for (const client of clientList) {
        if (new URL(client.url).pathname === target) return client.focus();
      }
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

// When any app tab becomes visible again, clear leftover error bubbles —
// the user is back in the app, so "upload failed" would be stale.
self.addEventListener("message", (event) => {
  if (event.data === "sh-clear-notifications") {
    event.waitUntil(
      self.registration.getNotifications({ tag: "student-hub-error" }).then((list) => {
        for (const n of list) n.close();
      })
    );
  }
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
  // /api/ generally stays network-only (webhooks, session checks, analytics
  // beacons); nothing under it is a cacheable GET resource.
  if (
    url.hostname.includes("r2.") ||
    url.hostname.includes("vercel-storage") ||
    url.pathname.startsWith("/api/") ||
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

  // Next.js static assets (_next/static) — dev: network only; prod:
  // NETWORK-FIRST with cache fallback. Chunks change on every deploy, so
  // cache-first feeds pre-deploy JS to new HTML — hydration crashes and the
  // tab sits on loading skeletons forever. Network always wins online (Vercel
  // serves these immutable, so they're CDN/disk-cached anyway); the SW cache
  // only answers when offline.
  if (IS_DEV && url.pathname.startsWith("/_next/static/")) {
    return; // dev: let the network serve fresh chunks
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || new Response("Offline", { status: 503 }))
        )
    );
    return;
  }

  // NEVER serve cached copies of private/auth pages. A /profile or /upload
  // page cached while signed in keeps working after sign-out (showing the
  // previous user's data), and /login cached while signed out keeps showing
  // the login form after sign-in. The server redirects these per-request —
  // a cached copy bypasses that, so they stay network-only.
  const PRIVATE_PATHS = [
    "/profile",
    "/upload",
    "/admin",
    "/login",
    "/signup",
  ];
  if (
    request.mode === "navigate" &&
    (PRIVATE_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(p + "/")))
  ) {
    return;
  }

  // Pages containing SERVER ACTIONS (contact form) are network-first: the
  // action ID is baked into the page HTML, and a cached page from build N
  // submitted against build N+1 dies with "Server Action was not found" —
  // a real user lost a typed message exactly this way. The stale copy is
  // still refreshed in the background via the normal SWR path when offline
  // (see the network.catch fallback below → /offline).
  const ACTION_PAGES = ["/contact"];
  if (
    request.mode === "navigate" &&
    ACTION_PAGES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline"))
        )
    );
    return;
  }

  // Pages — STALE-WHILE-REVALIDATE with a NETWORK RACE for PUBLIC pages:
  // a cached page answers IMMEDIATELY (instant cold start from the
  // home-screen icon; no multi-second wait), and the in-flight network
  // refresh updates the cache so the next open is current. When nothing is
  // cached, we race the network against a 2.5s deadline: if the network
  // is slow (3G cold start), a CACHED page from a previous visit paints
  // instead of a blank wait, and the fresh response still updates the
  // cache in the background when it lands. First-ever visits (nothing
  // cached at all) just wait out the network, falling back to /offline.
  // Signed-in navigations skip the stale copy: the cookie travels with
  // the fetch, so the network response reflects the CURRENT session, while a
  // cache entry may have been stored while signed out (guest shell + CTA
  // painted over a valid session — the "am I logged in or not" bug).
  if (request.mode === "navigate" && request.headers.get("cookie")) {
    return;
  }
  event.respondWith(
    caches.open(DYNAMIC_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        // Network promise resolves with the response OR null-on-timeout;
        // the fetch itself is never aborted, so the cache still gets
        // refreshed by the slow response whenever it arrives.
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

        if (cached) {
          // Cached copy answers immediately; network refresh runs in background.
          event.waitUntil(network);
          return cached;
        }

        // Nothing cached: give the network a fair shot, then fall back to
        // the last-known-good copy of ANY nearby page? No — that would show
        // the wrong content. Fall back to /offline only on genuine failure;
        // a merely-slow network waits (correctly) for its content.
        return Promise.race([
          network,
          fetchWithTimeout(request, NETWORK_TIMEOUT_MS).then(() => null),
        ]).then((raced) => {
          if (raced) return raced;
          // Deadline hit with nothing cached — try the offline page only
          // if the network is TRULY dead (a second probe), otherwise keep
          // waiting for the real content.
          return fetch("/api/ping", { cache: "no-store" })
            .then((ping) =>
              ping.ok
                ? network // alive but slow — keep waiting for content
                : request.mode === "navigate"
                  ? caches.match("/offline")
                  : new Response("Offline", { status: 503 })
            )
            .catch(() =>
              request.mode === "navigate"
                ? caches.match("/offline")
                : new Response("Offline", { status: 503 })
            );
        });
      })
    )
  );
});
