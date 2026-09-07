import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Verification status for the signed-in user — powers the top-of-page
 * "verify your email" banner. Always answers 200: a "no" is a valid
 * answer, not an error. No authorization decisions ride on this; it is
 * a UI hint only.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ authenticated: false });
    }
    const user = await db.query.users.findFirst({
      where: eq(users.email, session.user.email),
    });
    if (!user) {
      return NextResponse.json({ authenticated: false });
    }
    return NextResponse.json({
      authenticated: true,
      verified: !!user.emailVerified,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
