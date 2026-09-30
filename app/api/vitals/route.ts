import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { webVitals } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import { getRequestIpFromHeaders } from "@/lib/ip-block";

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
    const ip = getRequestIpFromHeaders(requestHeaders);
    // 30/min per IP: one page view reports up to 5 metrics (often spread
    // across two posts), so 30 is generous for humans and still caps abuse.
    if (!(await checkRateLimit(`vitals:${ip}`, 30, 60))) {
      return new NextResponse(null, { status: 204 });
    }

    const body = (await request.json().catch(() => null)) as
      | { path?: unknown; metric?: unknown; value?: unknown }
      | { path?: unknown; samples?: unknown }
      | null;

    // Accept BOTH shapes: a single sample (legacy) or a batched array of
    // samples for one page ("samples"). Batching is what the Vitals client
    // sends — one POST per page view instead of five, which matters at
    // thousands of concurrent visitors (5 requests → 1 per page load).
    const path = typeof body?.path === "string" ? body.path : "";

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

    type Sample = { metric: string; value: number; poor: boolean };
    const samples: Sample[] = [];

    const push = (metric: unknown, value: unknown) => {
      if (typeof metric !== "string" || typeof value !== "number") return;
      const spec = METRICS[metric];
      if (!spec || !Number.isFinite(value) || value < 0 || value > spec.max) return;
      samples.push({ metric, value, poor: value > spec.poor });
    };

    if (Array.isArray((body as { samples?: unknown }).samples)) {
      const list = (body as { samples: unknown[] }).samples;
      // Bound the batch: 5 metrics × 1 page is the legit max.
      for (const s of list.slice(0, 10)) {
        const item = s as { metric?: unknown; value?: unknown };
        push(item?.metric, item?.value);
      }
    } else {
      push((body as { metric?: unknown }).metric, (body as { value?: unknown }).value);
    }

    if (samples.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    const day = new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd

    // One multi-row insert + one aggregate upsert per metric in the batch.
    // Values are already clamped above, so interpolation is safe.
    await Promise.all(
      samples.map((s) => {
        const poorInc = s.poor ? 1 : 0;
        return db.execute(sql`
          INSERT INTO web_vitals (path, day, metric, count, sum, poor_count)
          VALUES (${path}, ${day}, ${s.metric}, 1, ${s.value}, ${poorInc})
          ON CONFLICT (path, day, metric) DO UPDATE SET
            count = web_vitals.count + 1,
            sum = web_vitals.sum + ${s.value},
            poor_count = web_vitals.poor_count + ${poorInc}
        `);
      })
    );
  } catch {
    // Vitals reporting must never produce a user-visible failure.
  }
  return new NextResponse(null, { status: 204 });
}
