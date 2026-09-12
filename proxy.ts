import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getIpAddress, isIpBlocked, detectAttack, checkRateLimit, cleanupRateLimitMap, invalidateBlockedIpsCache } from "./lib/ip-block";
import { cleanupOldEmailEvents } from "./lib/cleanup";
import { checkBounceRateAlert, notifyAutoBlock } from "./lib/alerts";

// ── Clerk session gating (cutover) ───────────────────────────────────
// Identity lives in Clerk; this middleware owns protection (IP block,
// attack detection, rate limit) AND route gating via the Clerk session.
// With Clerk keys absent (CI / fresh checkouts) auth() reads as
// signed-out and protected routes redirect to /sign-in.

const isPublicRoute = createRouteMatcher([
  "/",
  "/browse(.*)",
  "/resource/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Legacy NextAuth paths — pure redirects to the Clerk pages (bookmarks)
  "/login",
  "/signup",
  // Clerk email-link / E2E token consumer (verifies itself via Clerk)
  "/accept-token",
  "/contact",
  "/terms",
  "/find",
  "/api/webhooks/(.*)",
  // UI-hint status endpoints: they answer guests themselves (200 JSON),
  // so the login redirect here would only waste a round trip.
  "/api/check-(.*)",
  // Connectivity probe for the offline banner — must always answer,
  // never redirect (a 307 would look like a "server error" to fetch).
  "/api/ping",
  // Upload endpoint: the handler itself enforces same-origin (403 on
  // mismatch), so guests get a clean JSON error instead of a login
  // redirect that would confuse a CSRF probe.
  "/api/upload",
  // Deploy-version beacon for the auto-refresh watcher — guests included,
  // and it must never waste a login round trip (it fires every minute).
  "/api/version",
]);

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default clerkMiddleware(async (auth, request) => {
  // Run periodic cleanup of in-memory maps
  cleanupRateLimitMap();

  // Lazy DB cleanup — runs at most once per day
  cleanupOldEmailEvents();

  // Bounce rate alert — runs at most once per hour
  checkBounceRateAlert();

  const ip = getIpAddress(request);
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get("user-agent") || "";

  // Escape IP for safe display in HTML error responses
  const escapedIp = escapeHtml(ip);

  // 1. Check if IP is blocked
  const blocked = await isIpBlocked(ip);
  if (blocked) {
    return new NextResponse(
      `Access Denied — Your IP (${escapedIp}) has been blocked. Contact us via the contact page to request unblocking.`,
      { status: 403, headers: { "Content-Type": "text/html" } }
    );
  }

  // 2. Detect attack patterns in URL and user agent
  const attack = detectAttack(pathname + request.nextUrl.search, userAgent);
  if (attack) {
    try {
      const { db } = await import("./lib/db");
      const { blockedIps } = await import("./lib/db/schema");
      await db.insert(blockedIps).values({
        ip,
        reason: `Auto-blocked: ${attack}`,
        blockedBy: "system",
      });
      // Make the block effective immediately on this instance.
      invalidateBlockedIpsCache();
      // Make the lockout visible: log + notify admins (rate-limited).
      notifyAutoBlock(ip, attack);
    } catch {}

    return new NextResponse(
      `Access Denied — Suspicious activity detected. Your IP (${escapedIp}) has been blocked. Contact us via the contact page to request unblocking.`,
      { status: 403, headers: { "Content-Type": "text/html" } }
    );
  }

  // 3. Rate limiting
  const rateLimited = checkRateLimit(ip);
  if (rateLimited) {
    return new NextResponse("Too many requests — slow down.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  // 4. Route gating via the Clerk session
  if (isPublicRoute(request)) {
    const response = NextResponse.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), interest-cohort=()"
    );
    return response;
  }

  const { userId } = await auth();
  if (!userId) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Protect admin panel (DB role check, same as before)
  if (pathname.startsWith("/admin")) {
    try {
      const { db } = await import("./lib/db");
      const { users, adminEmails } = await import("./lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const row = await db.query.users.findFirst({
        where: eq(users.clerkId, userId),
        columns: { email: true },
      });
      const email = row?.email;
      if (!email) {
        return new NextResponse("Forbidden — Admin access only", { status: 403 });
      }
      const admin = await db.query.adminEmails.findFirst({
        where: eq(adminEmails.email, email),
      });
      if (!admin) {
        return new NextResponse("Forbidden — Admin access only", { status: 403 });
      }
    } catch {
      return new NextResponse("Server error", { status: 500 });
    }
  }

  // 5. Security headers
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.json$|robots\\.txt$|sitemap\\.xml$|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // Clerk Frontend API handshake routes
    "/__clerk/(.*)",
  ],
};
