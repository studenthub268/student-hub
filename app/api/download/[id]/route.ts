import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Same-origin file download proxy.
 *
 * Resource files live in an R2 public bucket that sends no CORS headers, so
 * the browser cannot fetch() the file cross-origin (client downloads used to
 * die with "Failed to download file"). Streaming through this route keeps the
 * request same-origin and lets us force a friendly filename via
 * Content-Disposition — the browser shows its own progress UI for free.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [resource] = await db
    .select({
      title: resources.title,
      fileUrl: resources.fileUrl,
      fileKey: resources.fileKey,
    })
    .from(resources)
    .where(eq(resources.id, id))
    .limit(1);

  if (!resource) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Per-IP throttle — same budget philosophy as the download counter.
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`download-file:${ip}`, 30, 60))) {
    return new NextResponse("Too many downloads — slow down.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(resource.fileUrl);
  } catch {
    return new NextResponse("File storage unavailable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("File not found in storage", { status: 502 });
  }

  // Best-effort counter — a failed write must never break the download.
  try {
    await db
      .update(resources)
      .set({ downloads: sql`${resources.downloads} + 1` })
      .where(eq(resources.id, id));
  } catch (error) {
    console.error("Failed to record download:", error);
  }

  // Friendly filename: sanitized title + extension from the stored key.
  const ext = resource.fileKey.split(".").pop()?.toLowerCase() ?? "";
  const base =
    resource.title
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80) || "download";
  const filename = ext ? `${base}.${ext}` : base;

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") || "application/octet-stream",
      "Content-Length": upstream.headers.get("content-length") ?? "",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
