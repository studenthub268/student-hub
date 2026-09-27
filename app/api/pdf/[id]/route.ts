import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Same-origin PDF byte proxy for the custom viewer.
 *
 * The custom PDF viewer (PdfViewer.tsx) renders pages onto <canvas> with
 * pdf.js. pdf.js fetches the file itself, but the R2 public bucket sends no
 * CORS headers, so a cross-origin fetch fails — same reason downloads go
 * through /api/download. This route streams the bytes same-origin with an
 * inline disposition (render, not save) and a per-IP throttle identical to
 * the download route's.
 *
 * Resource id in the URL (not the raw R2 link) keeps storage URLs out of the
 * client bundle entirely and lets the DB own the mapping.
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
      fileUrl: resources.fileUrl,
      fileType: resources.fileType,
    })
    .from(resources)
    .where(eq(resources.id, id))
    .limit(1);

  // PDFs only — this endpoint exists for the viewer; other types have no
  // reason to be fetched through it.
  if (!resource || !resource.fileType?.includes("pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`pdf-view:${ip}`, 60, 60))) {
    return new NextResponse("Too many requests — slow down.", {
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

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": upstream.headers.get("content-length") ?? "",
      // inline (not attachment): pdf.js consumes the bytes in-page.
      "Content-Disposition": "inline",
      // Bytes are immutable per resource version and re-fetched per viewer
      // open — cache hard to make reopenings instant.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
