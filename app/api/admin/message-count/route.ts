import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminEmails, messages } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import { headers } from "next/headers";

export async function GET() {
  try {
    // Poll endpoint (admin badge in the navbar) — throttle per IP like the
    // other status endpoints so a scripted hammer can't free-ride on it.
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await checkRateLimit(`admin-count:${ip}`, 30, 60))) {
      return NextResponse.json({ count: 0 }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ count: 0 }, { status: 401 });
    }

    const admin = await db.query.adminEmails.findFirst({
      where: eq(adminEmails.email, session.user.email),
    });

    if (!admin) {
      return NextResponse.json({ count: 0 }, { status: 403 });
    }

    const result = await db.select({ count: sql<number>`count(*)` }).from(messages);
    return NextResponse.json({ count: result[0]?.count || 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
