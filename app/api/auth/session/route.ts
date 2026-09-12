import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Session is per-request (reads the Clerk cookie) — must never be cached.
export const dynamic = "force-dynamic";

// App-owned session endpoint (formerly NextAuth's). Returns the same
// shape clients already consume: { user: {...} } when signed in,
// {} when not. Powers NavbarAuth's useSessionUser and the profile page.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({});
  return NextResponse.json({ user: session.user });
}
