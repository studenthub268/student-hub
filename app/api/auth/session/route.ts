import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Session is per-request (reads the NextAuth cookie) — must never be cached.
export const dynamic = "force-dynamic";

// App-owned session endpoint. Returns the same shape clients already
// consume: { user: {...} } when signed in, {} when not. Powers NavbarAuth's
// useSessionUser, the verify-email page and ResourceActions.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({});
  return NextResponse.json({ user: session.user });
}
