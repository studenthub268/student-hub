import { auth } from "./lib/auth";
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

export async function proxy(request: NextRequest) {
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
    pathname === "/api/ping";

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
  response.headers.set("X-XSS-Protection", "1; mode=block");
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.json$|robots\\.txt$|sitemap\\.xml$|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
