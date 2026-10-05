/**
 * Backend Optimization Proxy for Google Drive PDFs.
 *
 * Endpoint: GET /api/stream-pdf?driveId=<file-id>
 *
 * Workflow:
 *  1. User requests a PDF (viewer or direct link).
 *  2. Backend fetches the file from Google Drive's usercontent endpoint
 *     (streams raw bytes, no interstitial HTML for large files).
 *  3. Backend linearizes the PDF on-the-fly (page-1 objects + xref moved
 *     to the front) so the viewer paints page 1 from the first chunk.
 *  4. The linearized file is cached on disk keyed by Drive file id.
 *  5. Subsequent requests (and Range slices into the cached file) serve
 *     from disk — instant, Drive-rate-limit-free.
 *
 * This is the proxy the interrupted request asked for. It complements (does
 * NOT replace) the existing /api/pdf/[id] route, which proxies by resource
 * id from whichever storage the resource uses (R2 or Drive). This new route
 * is the Drive-specific, linearized, cached path — useful when you have the
 * Drive file id directly (e.g., a "stream this Drive PDF" link) and want
 * the optimization layer.
 *
 * Why a separate route instead of folding into /api/pdf/[id]:
 *  - /api/pdf/[id] is resource-driven (id → DB → storage URL). It already
 *    streams from Drive with Range support (the Drive interstitial bypass
 *    fix), but it does NOT linearize or cache the linearized stream.
 *  - This route is Drive-id-driven and adds the two missing layers:
 *    linearization (pdf-lib / qpdf) + a disk cache for the linearized
 *    bytes. Both are independent of any resource row.
 *  - The viewer currently hits /api/pdf/[id]; if you want it to benefit
 *    from linearization + cache for Drive-hosted PDFs, point Drive-hosted
 *    resources at this route instead (or warm the cache here and keep using
 *    /api/pdf/[id] which already passes Range through). Either path works.
 */

import { NextRequest, NextResponse } from "next/server";
import { driveUserContentDownloadUrl } from "@/lib/drive";
import { linearizePdf, fetchDrivePdfBytes } from "@/lib/pdf-linearizer";
import { getCachedPdf, setCachedPdf, serveCachedRange, cachedBytes } from "@/lib/pdf-cache";

// ---- validation ----

/** Drive file ids are 20–64 chars of [A-Za-z0-9_-]. */
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,64}$/;

function parseDriveId(req: NextRequest): string | null {
  const q = req.nextUrl.searchParams.get("driveId");
  if (!q || !DRIVE_ID_RE.test(q)) return null;
  return q;
}

// ---- the handler ----

export async function GET(request: NextRequest) {
  const driveFileId = parseDriveId(request);
  if (!driveFileId) {
    return new NextResponse("Missing or invalid driveId query parameter", { status: 400 });
  }

  const rangeHeader = request.headers.get("range");
  const acceptRanges = request.headers.get("accept-ranges");

  // ---- 1. Check cache first (fast path for repeats). ----

  // Even on a Range request, if we have the full cached file we can slice
  // into it — faster than fetching from Drive again.
  if (rangeHeader) {
    const cached = await serveCachedRange(driveFileId, rangeHeader);
    if (cached) {
      return buildResponse(cached.data, cached.status, {
        "Accept-Ranges": "bytes",
        "Content-Range": cached.contentRange,
        "Content-Length": String(cached.contentLength),
        "Cache-Control": "public, max-age=3600, immutable",
        ETag: `"pdf-${driveFileId}"`,
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        Vary: "Range",
      });
    }
  }

  // Full-file cache hit (no Range requested).
  const cachedFull = await getCachedPdf(driveFileId);
  if (cachedFull) {
    const total = cachedFull.byteLength;
    if (!rangeHeader) {
      return buildResponse(cachedFull, 200, {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes 0-${total - 1}/${total}`,
        "Content-Length": String(total),
        "Cache-Control": "public, max-age=3600, immutable",
        ETag: `"pdf-${driveFileId}"`,
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        Vary: "Range",
      });
    }
    // Range was sent but serveCachedRange missed (shouldn't happen; defensive).
  }

  // ---- 2. Cold path: fetch from Drive, linearize, cache, serve. ----

  const fetchResult = await fetchDrivePdfBytes(driveFileId);
  if (fetchResult.error) {
    let status: number;
    if (fetchResult.error.includes("private") || fetchResult.error.includes("interstitial")) {
      status = 403;
    } else if (fetchResult.error.includes("unreachable")) {
      status = 502;
    } else if (fetchResult.error.includes("404")) {
      status = 404;
    } else {
      status = 502; // Drive returned something unexpected — treat as upstream error
    }
    return new NextResponse(fetchResult.error, { status });
  }

  const originalBytes = fetchResult.bytes;
  const contentType = fetchResult.contentType ?? "application/pdf";

  if (originalBytes.length < 1024) {
    // Too small to be a real PDF — probably an error page or empty file.
    return new NextResponse("File is empty or not a PDF", { status: 400 });
  }

  // ---- 3. Linearize (best backend available). ----

  const linResult = await linearizePdf(originalBytes, true); // prefer qpdf

  // ---- 4. Cache the linearized bytes. ----

  try {
    await setCachedPdf(driveFileId, linResult.buffer);
  } catch {
    // Cache is a luxury — continue without it.
  }

  // ---- 5. Serve (with Range support if requested). ----

  const finalBytes = linResult.buffer;
  const total = finalBytes.byteLength;

  if (rangeHeader) {
    const m = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
    if (m) {
      const start = parseInt(m[1], 10);
      const endRaw = m[2];
      if (!isNaN(start) && start >= 0 && start < total) {
        const end = endRaw === "" ? total - 1 : Math.min(parseInt(endRaw, 10), total - 1);
        if (end >= start) {
          const slice = finalBytes.slice(start, end + 1);
          return buildResponse(slice, 206, {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(slice.byteLength),
            "Cache-Control": "public, max-age=3600, immutable",
            ETag: `"pdf-${driveFileId}"`,
            "Content-Type": "application/pdf",
            "Content-Disposition": "inline",
            Vary: "Range",
          });
        }
      }
    }
    // Malformed range — serve the whole thing with 416-ish signal.
    return new NextResponse("Invalid range", { status: 400 });
  }

  // Full file (first request or no Range asked).
  return buildResponse(finalBytes, 200, {
    "Accept-Ranges": "bytes",
    "Content-Range": `bytes 0-${total - 1}/${total}`,
    "Content-Length": String(total),
    "Cache-Control": "public, max-age=3600, immutable",
    ETag: `"pdf-${driveFileId}"`,
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline",
    Vary: "Range",
  });
}

function buildResponse(body: Uint8Array, status: number, headers: Record<string, string>): NextResponse {
  return new NextResponse(new ReadableStream({
    start(controller) {
      const buf = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
      controller.enqueue(buf);
      controller.close();
    },
  }), { status, headers });
}
