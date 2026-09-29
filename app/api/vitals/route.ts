import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webVitals } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";

/**
 * First-party Core Web Vitals collector.
 *
 * Receives real-user measurements (LCP, INP, CLS, FCP, TTFB) reported by
 * the Vitals client component via next/web-vitals' useReportWebVitals, and
 * aggregates them into one row per (path, day, metric): count for sample
 * size, sum for the average, poor_count for the share of samples over
 * Google's "poor" threshold (so the admin view can show a pass rate, not
 * just a mean — an average CLS of 0.09 can hide that a third of visitors
 * experience layout shift).
 *
 * Privacy posture matches /api/analytics exactly: path only (no query
 * string), no cookies, no IP stored, no user identifiers — so /terms'
 * "no analytics cookies" stays true and no consent gate is needed.
 *
 * Values are clamped to plausible ranges before storage: a bogus or
 * tampered payload (or a stuck timer) must not poison the aggregates.
 */
export async function POST(request: NextRequest) {
  try {
    const requestHeaders = await headers();
    const ip =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    // 30/min per IP: one page view reports up to 5 metrics (often spread
    // across two posts), so 30 is generous for humans and still caps abuse.
    if (!(await checkRateLimit(`vitals:${ip}`, 30, 60))) {
      return new NextResponse(null, { status: 204 });
    }

    const body = (await request.json().catch(() => null)) as {
      path?: unknown;
      metric?: unknown;
      value?: unknown;
    } | null;

    const path = typeof body?.path === "string" ? body.path : "";
    const metric = typeof body?.metric === "string" ? body.metric : "";
    const value = typeof body?.value === "number" ? body.value : NaN;

    // Path: internal, no query string, no traversal (same rules as analytics).
    if (
      !path.startsWith("/") ||
      path.includes("..") ||
      path.includes("?") ||
      path.length > 200
    ) {
      return new NextResponse(null, { status: 204 });
    }

    const METRICS: Record<string, { max: number; poor: number }> = {
      // Google's thresholds: good ≤ {LCP 2.5s, INP 200ms, CLS 0.1,
      // FCP 1.8s, TTFB 800ms}; "poor" > {4s, 500ms, 0.25, 3s, 1.8s}.
      // The clamp is well above "poor" — it only rejects nonsense.
      LCP: { max: 60_000, poor: 4_000 },
      INP: { max: 60_000, poor: 500 },
      CLS: { max: 100, poor: 0.25 },
      FCP: { max: 60_000, poor: 3_000 },
      TTFB: { max: 60_000, poor: 1_800 },
    };
    const spec = METRICS[metric];
    if (!spec || !Number.isFinite(value) || value < 0 || value > spec.max) {
      return new NextResponse(null, { status: 204 });
    }

    const day = new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd

    await db
      .insert(webVitals)
      .values({
        path,
        day,
        metric,
        count: 1,
        sum: value,
        poorCount: value > spec.poor ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [webVitals.path, webVitals.day, webVitals.metric],
        set: {
          count: sql`${webVitals.count} + 1`,
          sum: sql`${webVitals.sum} + ${value}`,
          poorCount: sql`${webVitals.poorCount} + ${value > spec.poor ? 1 : 0}`,
        },
      });
  } catch {
    // Vitals reporting must never produce a user-visible failure.
  }
  return new NextResponse(null, { status: 204 });
}
