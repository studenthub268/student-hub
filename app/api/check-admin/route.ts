import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminEmails } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ admin: false }, { status: 401 });
    }

    const admin = await db.query.adminEmails.findFirst({
      where: eq(adminEmails.email, session.user.email),
    });

    if (!admin) {
      return NextResponse.json({ admin: false }, { status: 403 });
    }

    return NextResponse.json({ admin: true });
  } catch {
    // DB connection failed — definitely not admin
    return NextResponse.json({ admin: false }, { status: 500 });
  }
}
