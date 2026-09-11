import { auth } from "./lib/auth";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { getIpAddress, isIpBlocked, detectAttack, checkRateLimit, cleanupRateLimitMap, invalidateBlockedIpsCache } from "./lib/ip-block";
import { cleanupOldEmailEvents } from "./lib/cleanup";
import { checkBounceRateAlert } from "./lib/alerts";
import { notifyAutoBlock } from "./lib/alerts";
// NOTE: VPN/proxy use alone is never a blockable offense. Visitors are only
// auto-blocked for concrete attack behavior (see detectAttack) or manually by
// an admin. Policy: privacy tools are not suspicious behavior.

/** Escape HTML special characters to prevent XSS in error response bodies */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Clerk migration phase 1: NextAuth remains the session of record. When
// Clerk keys are configured, clerkMiddleware wraps the existing pipeline so
// Clerk's handshake routes (__clerk) and components are live; without keys
// the middleware is byte-identical to the pre-Clerk behavior.
const clerkEnabled = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

async function handle(request: NextRequest) {
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

  // 4. Auth and routing
  const session = await auth();
  const user = session?.user;

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/browse") ||
    pathname.startsWith("/resource/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") || // e.g. /login/forgot-password
    pathname === "/signup" ||
    // Clerk-hosted auth pages (phase 1: live only when keys are configured)
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    // Clerk Frontend API handshake — intercepted by clerkMiddleware when
    // enabled; listed here so a no-key deploy never login-gates the path.
    pathname.startsWith("/__clerk") ||
    pathname === "/contact" ||
    pathname === "/terms" ||
    pathname === "/find" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks/") ||
    // UI-hint status endpoints: they answer guests themselves (200 JSON),
    // so the login redirect here would only waste a round trip.
    pathname.startsWith("/api/check-") ||
    // Connectivity probe for the offline banner — must always answer,
    // never redirect (a 307 would look like a "server error" to fetch).
    pathname === "/api/ping" ||
    // Upload endpoint: the handler itself enforces same-origin (403 on
    // mismatch), so guests get a clean JSON error instead of a login
    // redirect that would confuse a CSRF probe.
    pathname === "/api/upload" ||
    // Deploy-version beacon for the auto-refresh watcher — guests included,
    // and it must never waste a login round trip (it fires every minute).
    pathname === "/api/version";

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Protect admin panel
  if (pathname.startsWith("/admin")) {
    if (!user?.email) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    try {
      const { db } = await import("./lib/db");
      const { adminEmails } = await import("./lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const admin = await db.query.adminEmails.findFirst({
        where: eq(adminEmails.email, user.email),
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

  if (user) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate"
    );
  }

  return response;
}

// Dual-run: with Clerk keys, clerkMiddleware runs first (its __clerk
// handshake routes + component context), then delegates to the pipeline
// above — which still owns route gating via NextAuth until phase 3 cutover.
// Without keys, the pipeline runs alone and behavior is unchanged.
export default clerkEnabled
  ? clerkMiddleware(async (auth, req) => handle(req))
  : async function proxy(request: NextRequest) {
      return handle(request);
    };

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.json$|robots\\.txt$|sitemap\\.xml$|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // Clerk Frontend API handshake routes (no-op unless keys configured)
    "/__clerk/(.*)",
  ],
};
