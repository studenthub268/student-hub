import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import { isDriveHosted, DRIVE_FOLDER_TYPE } from "@/lib/drive";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Drive file ids: 28–33 chars of [A-Za-z0-9_-]. Guard on shape so a legacy
// R2-shaped key can never be interpolated into the Drive URL below.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,64}$/;

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
      fileType: resources.fileType,
    })
    .from(resources)
    .where(eq(resources.id, id))
    .limit(1);

  if (!resource) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Drive-hosted resource: redirect to Drive's direct-download endpoint
  // instead of proxying bytes. Proxying a multi-GB file through a 4.5 MB-
  // capped serverless function is impossible — and pointless, since the
  // link is public by construction (verified at upload time). The browser
  // follows the redirect and streams straight from Google. fileKey holds
  // the Drive file id; fileUrl is kept as the same uc?export=download URL.
  if (
    resource.fileType === DRIVE_FOLDER_TYPE &&
    DRIVE_ID_RE.test(resource.fileKey)
  ) {
    // Folder resources: no bytes to stream — redirect to the folder itself.
    // The share URL (file_url) is the human landing page; the browser
    // follows the redirect and Drive renders its folder view.
    try {
      await db
        .update(resources)
        .set({ downloads: sql`${resources.downloads} + 1` })
        .where(eq(resources.id, id));
    } catch (error) {
      console.error("Failed to record download:", error);
    }
    return NextResponse.redirect(resource.fileUrl, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (isDriveHosted(resource.fileType, resource.fileUrl) && DRIVE_ID_RE.test(resource.fileKey)) {
    // Best-effort counter — same policy as the proxied path below.
    try {
      await db
        .update(resources)
        .set({ downloads: sql`${resources.downloads} + 1` })
        .where(eq(resources.id, id));
    } catch (error) {
      console.error("Failed to record download:", error);
    }
    return NextResponse.redirect(
      `https://drive.google.com/uc?export=download&id=${resource.fileKey}`,
      { status: 302, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  // Per-IP throttle — same budget philosophy as the download counter.
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // 120/min per IP: sized for the real audience shape — exam week puts a
  // whole classroom (30-50 students) behind one NAT IP downloading past
  // papers in the same minutes. 30/min meant each student got 1-2 downloads
  // before the shared bucket 429'd ("Too many downloads"). 120/min is
  // still 2/sec sustained — far above human pacing, tight enough to blunt
  // scripted scraping, and the actual byte cost is bounded by R2's own
  // egress, not this limiter.
  if (!(await checkRateLimit(`download-file:${ip}`, 120, 60))) {
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
