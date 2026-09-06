import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminEmails } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * UI hint for showing the Admin nav link. Always answers 200 — a "no" is a
 * normal, expected answer (signed-out visitors and regular users are the
 * majority), so it must not surface as a console error. This endpoint never
 * authorizes anything: every admin action and the /admin route re-check
 * admin status server-side.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ admin: false });
    }

    const admin = await db.query.adminEmails.findFirst({
      where: eq(adminEmails.email, session.user.email),
    });

    return NextResponse.json({ admin: !!admin });
  } catch {
    // Fail closed: DB unavailable means the link stays hidden.
    return NextResponse.json({ admin: false });
  }
}
