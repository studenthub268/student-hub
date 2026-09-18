import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pageViews } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";

const MAX_PATH_LENGTH = 200;
const MAX_REF_LENGTH = 100;

/**
 * First-party pageview collector. Privacy posture (keeps /terms#cookies true):
 * - path only, never the query string (search terms etc. are personal data)
 * - referrer trimmed to host, cross-site only
 * - no cookies, no IP stored, no fingerprinting
 *
 * Writes aggregate into a daily row per path (onConflictDoUpdate), so the
 * table stays tiny. Fire-and-forget friendly: always 204, never errors out.
 */
export async function POST(request: NextRequest) {
  try {
    // Per-IP throttle in front of the DB write.
    const requestHeaders = await headers();
    const ip =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await checkRateLimit(`analytics:${ip}`, 60, 60))) {
      return new NextResponse(null, { status: 204 });
    }

    const body = (await request.json().catch(() => null)) as {
      path?: unknown;
      referrer?: unknown;
    } | null;

    const path = typeof body?.path === "string" ? body.path.slice(0, MAX_PATH_LENGTH) : "";
    const referrer =
      typeof body?.referrer === "string" ? body.referrer.slice(0, MAX_REF_LENGTH) : "";

    // Internal paths only; drop anything that smells like a traversal.
    if (!path.startsWith("/") || path.includes("..")) {
      return new NextResponse(null, { status: 204 });
    }

    const day = new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd

    await db
      .insert(pageViews)
      .values({ path, day, views: 1, referrer: referrer || null })
      .onConflictDoUpdate({
        target: [pageViews.path, pageViews.day],
        where: sql`${pageViews.referrer} IS NOT DISTINCT FROM ${referrer || null}`,
        set: { views: sql`${pageViews.views} + 1` },
      });
  } catch {
    // Analytics must never produce a user-visible failure.
  }
  return new NextResponse(null, { status: 204 });
}
