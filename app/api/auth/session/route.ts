import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/actions/rate-limit";

// Session is per-request (reads the NextAuth cookie) — must never be cached.
export const dynamic = "force-dynamic";

// App-owned session endpoint. Returns the same shape clients already
// consume: { user: {...} } when signed in, {} when not. Powers NavbarAuth's
// useSessionUser, the verify-email page and ResourceActions. Rate limited
// per IP (300/min — the client treats a 429 as a transient failure rather
// than a sign-out, and campus/classroom NAT shares one IP across many
// visitors, so the old 30/min locked whole buildings out of a correct UI
// long before any abuse threshold) so a scripted hammer still can't turn
// this into a session-decoding oracle.
export async function GET() {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`session:${ip}`, 300, 60))) {
    return NextResponse.json({}, { status: 429, headers: { "Retry-After": "60" } });
  }

  const session = await auth();
  if (!session?.user) return NextResponse.json({});
  return NextResponse.json({ user: session.user });
}
