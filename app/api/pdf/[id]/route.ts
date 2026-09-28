import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import { isDriveHosted, driveDirectDownloadUrl } from "@/lib/drive";

// Drive file id shape — guards the interpolation into the download URL.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,64}$/;

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
      fileKey: resources.fileKey,
    })
    .from(resources)
    .where(eq(resources.id, id))
    .limit(1);

  // PDFs only — this endpoint exists for the viewer; other types have no
  // reason to be fetched through it.
  if (!resource || !resource.fileType?.includes("pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Resolve where the bytes live: R2 resources fetch their stored public
  // URL directly; Drive-hosted PDFs rebuild the direct-download endpoint
  // from the Drive file id in file_key (same redirect chain the browser
  // would follow, but server-side where CORS doesn't apply).
  const isDrive = isDriveHosted(resource.fileType, resource.fileUrl);
  const upstreamUrl = isDrive
    ? DRIVE_ID_RE.test(resource.fileKey)
      ? driveDirectDownloadUrl(resource.fileKey)
      : null
    : resource.fileUrl;
  if (!upstreamUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // 240/min per IP: a single viewer open fetches the document once (bytes are
  // cached by the browser afterwards), but a classroom behind one NAT IP —
  // the norm for this site's audience on campus wifi — shares the bucket
  // across every student. 60/min was hit in the wild and 429'd real readers
  // into the viewer's error state ("Couldn't load the PDF"), which reads as
  // "preview blocked". 240 still caps scripted scraping (a full 60-page doc
  // is ~1 MB and pdf.js requests the whole file once per open).
  if (!(await checkRateLimit(`pdf-view:${ip}`, 240, 60))) {
    return new NextResponse("Too many requests — slow down.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  let upstream: Response;
  try {
    // Drive's uc?export=download endpoint may answer with a redirect chain
    // (and for very large files, an HTML interstitial instead of bytes) —
    // follow redirects; the interstitial surfaces as an HTML content-type
    // and is rejected below rather than handed to pdf.js.
    upstream = await fetch(upstreamUrl, { redirect: "follow" });
  } catch {
    return new NextResponse("File storage unavailable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("File not found in storage", { status: 502 });
  }
  // A Drive interstitial (private link, virus-scan wall) arrives as HTML —
  // passing it to pdf.js would render a confusing parse error.
  if (upstream.headers.get("content-type")?.includes("text/html")) {
    return new NextResponse("File is not publicly shared", { status: 403 });
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
