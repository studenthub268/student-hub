import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/actions/rate-limit";

// Session is per-request (reads the NextAuth cookie) — must never be cached.
export const dynamic = "force-dynamic";

// App-owned session endpoint. Returns the same shape clients already
// consume: { user: {...} } when signed in, {} when not. Powers NavbarAuth's
// useSessionUser, the verify-email page and ResourceActions. Rate limited
// per IP (30/min — well above the app's polling pattern) so a scripted
// hammer can't turn this into a session-decoding oracle.
export async function GET() {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`session:${ip}`, 30, 60))) {
    return NextResponse.json({}, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user) return NextResponse.json({});
  return NextResponse.json({ user: session.user });
}
