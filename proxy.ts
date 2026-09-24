import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { getIpAddress, isIpBlocked, detectAttack, checkRateLimit, cleanupRateLimitMap, invalidateBlockedIpsCache } from "./lib/ip-block";
import { escapeHtml } from "./lib/utils";
import { cleanupOldEmailEvents } from "./lib/cleanup";
import { notifyAutoBlock, checkBounceRateAlert } from "./lib/alerts";
// NOTE: lib/auth is deliberately NOT statically imported here — NextAuth pulls
// its adapter, bcrypt and the whole provider stack into the middleware bundle,
// whose parse/compile cost lands on every request's TTFB. Only the admin gate
// needs the real session, and it imports lazily below.
// NOTE: VPN/proxy use alone is never a blockable offense. Visitors are only
// auto-blocked for concrete attack behavior (see detectAttack) or manually by
// an admin. Policy: privacy tools are not suspicious behavior.

export async function proxy(request: NextRequest) {
  // Run periodic cleanup of in-memory maps
  cleanupRateLimitMap();

  // Maintenance work must never risk delaying or dying with the response:
  // these lazy jobs do a Neon round trip on the one request per day/hour that
  // triggers them. `after()` (Next 15+) runs them post-response on Vercel —
  // guaranteed completion, zero TTFB cost.
  after(cleanupOldEmailEvents());
  after(checkBounceRateAlert());

  const ip = getIpAddress(request);
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get("user-agent") || "";

  // Force HTTPS: behind Vercel TLS terminates early, so a plain-HTTP hit
  // arrives with x-forwarded-proto=http. Redirect to the same URL over
  // https (HSTS in next.config covers repeat visits; this catches the first).
  // Localhost and 127.0.0.1 are exempt so `next dev` keeps working.
  const host = request.headers.get("host") || "";
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!isLocal && proto === "http") {
    const httpsUrl = new URL(request.nextUrl);
    httpsUrl.protocol = "https:";
    return NextResponse.redirect(httpsUrl, 308);
  }

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

  // 2. Detect attack patterns in URL and user agent.
  // Only `blockable` verdicts (scanner user-agents — something a victim's
  // browser cannot be made to send) write a PERSISTENT block. URL-based hits
  // are rejected for this one request and nothing more, because a crafted link
  // would otherwise let anyone permanently ban an arbitrary visitor's IP, and
  // an ordinary search for "nmap" would ban the student typing it.
  const attack = detectAttack(pathname + request.nextUrl.search, userAgent);
  if (attack) {
    if (attack.blockable) {
      try {
        const { db } = await import("./lib/db");
        const { blockedIps } = await import("./lib/db/schema");
        await db.insert(blockedIps).values({
          ip,
          reason: `Auto-blocked: ${attack.reason}`,
          blockedBy: "system",
        });
        // Make the block effective immediately on this instance.
        invalidateBlockedIpsCache();
        // Make the lockout visible: log + notify admins (rate-limited).
        notifyAutoBlock(ip, attack.reason);
      } catch {}
    }

    return new NextResponse(
      attack.blockable
        ? `Access Denied — Suspicious activity detected. Your IP (${escapedIp}) has been blocked. Contact us via the contact page to request unblocking.`
        // Not a block: say so, rather than telling a normal visitor their IP
        // has been banned when a stray character in their URL tripped a filter.
        : `Access Denied — That request was rejected. If this was a mistake, go back and try again.`,
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

  // 4. Auth and routing.
  // For public routes the session is decoded WITHOUT the NextAuth machinery:
  // auth() pulls the whole NextAuth/bcrypt/adapter stack into the middleware
  // bundle (its parse+init cost lands on every request's TTFB); a bare cookie
  // check is all "signed-in or not" needs here. It is a HINT ONLY — no route
  // below gains access from it; anything privileged re-verifies server-side.
  // authjs cookie (NextAuth v5 default): __Secure- prefixed on HTTPS prod,
  // bare in dev. Checking both avoids any env mismatch silently treating a
  // signed-in user as a guest (which would redirect them to /login).
  const hasSessionCookie =
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("authjs.session-token");

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/browse") ||
    pathname.startsWith("/resource/") ||
    // File download proxy — guests can download; the route itself rate
    // limits per IP and must answer directly (fetching it through a login
    // redirect would corrupt the binary stream for <a download> clicks).
    pathname.startsWith("/api/download/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") || // e.g. /login/forgot-password
    pathname === "/signup" ||
    pathname === "/contact" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
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
    pathname === "/api/version" ||
    // Analytics collector: guests included; rate-limited and validated in
    // the handler, and it must never trigger a login redirect mid-navigation.
    pathname === "/api/analytics";

  if (!hasSessionCookie && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Send already-signed-in users away from /login and /signup. This one
  // checks the VERIFIED session, not the cookie hint: a stale/invalid cookie
  // (e.g. after a secret rotation) must never bounce a guest between /login
  // and / forever. These two paths are low-traffic, so the full auth() here
  // costs nothing in aggregate.
  if (hasSessionCookie && (pathname === "/login" || pathname === "/signup")) {
    const { auth } = await import("./lib/auth");
    const session = await auth();
    if (session?.user) return NextResponse.redirect(new URL("/", request.url));
  }

  // Protect admin panel — the one place the middleware needs the real
  // verified session (full auth() here, admin-only so guests never pay it).
  if (pathname.startsWith("/admin")) {
    const { auth } = await import("./lib/auth");
    const session = await auth();
    const user = session?.user;
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

  // Same hint as above: signed-in responses must not be shared/cached by
  // intermediaries. A guest with a leftover cookie getting one extra private
  // header is harmless; the reverse (missing it) is not, and the real
  // rendering layer re-verifies the session itself.
  if (hasSessionCookie) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate"
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.json$|robots\\.txt$|sitemap\\.xml$|llms\\.txt$|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
