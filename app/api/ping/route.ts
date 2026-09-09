// Minimal connectivity probe — no DB, no auth. The OfflineBanner pings
// this with cache: 'no-store' to detect "connected but no internet"
// states that navigator.onLine cannot see. Never cached by the service
// worker (excluded in sw.js) so a probe always hits the real network.
export async function GET() {
  return new Response("ok", {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Type": "text/plain",
    },
  });
}
