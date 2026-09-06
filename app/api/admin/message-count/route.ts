import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminEmails, messages } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
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
