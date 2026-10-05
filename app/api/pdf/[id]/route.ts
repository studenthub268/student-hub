import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/actions/rate-limit";
import { getRequestIpFromHeaders } from "@/lib/ip-block";
import {
  isDriveHosted,
  driveUserContentDownloadUrl,
} from "@/lib/drive";

// Drive file id shape — guards the interpolation into the download URL.
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{20,64}$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resource metadata is IMMUTABLE per id (a re-upload always creates a new row
 * and therefore a new id), so the id → storage-URL mapping is cached in memory.
 *
 * Why this matters for first paint: pdf.js issues SEVERAL range requests to
 * render page 1 (document header, the xref tail, then the page's objects), and
 * each one is a separate invocation of this handler. The Neon round trip on
 * every request used to sit at the front of each of those, multiplying into
 * hundreds of milliseconds of pure latency before any bytes moved.
 */
const RESOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const RESOURCE_CACHE_MAX = 500;
type CachedResource = { fileUrl: string; fileType: string | null; fileKey: string };
const resourceCache = new Map<string, { value: CachedResource; at: number }>();

/** Resolve + cache a resource's storage location. Misses (deleted rows) are
 *  NOT cached so a resource that reappears isn't shadowed for the TTL. */
async function resolveResource(id: string): Promise<CachedResource | null> {
  const hit = resourceCache.get(id);
  if (hit && Date.now() - hit.at < RESOURCE_CACHE_TTL_MS) return hit.value;

  const [row] = await db
    .select({
      fileUrl: resources.fileUrl,
      fileType: resources.fileType,
      fileKey: resources.fileKey,
    })
    .from(resources)
    .where(eq(resources.id, id))
    .limit(1);
  if (!row) return null;

  if (resourceCache.size >= RESOURCE_CACHE_MAX) {
    const oldest = resourceCache.keys().next().value;
    if (oldest !== undefined) resourceCache.delete(oldest);
  }
  resourceCache.set(id, { value: row, at: Date.now() });
  return row;
}

/**
 * Same-origin PDF byte proxy for the custom viewer — tuned for speed.
 *
 * The custom PDF viewer (PdfViewer.tsx) renders pages onto <canvas> with
 * pdf.js. pdf.js fetches the file itself, but the R2 public bucket sends no
 * CORS headers, so a cross-origin fetch fails — same reason downloads go
 * through /api/download. Resource id in the URL (not the raw storage link)
 * keeps storage URLs out of the client bundle entirely and lets the DB own
 * the mapping.
 *
 * Three speed mechanisms (the old version had none, so every open was a
 * full cold download even when a thousand classmates had already opened
 * the same past paper):
 *
 *  1. CDN caching — the response is public with an immutable tone: PDF
 *     bytes for a resource are fixed forever (the file never changes; a
 *     re-upload creates a new resource row/id). `public, max-age=86400,
 *     immutable` lets Vercel's edge cache serve every open after the first
 *     per region from the POP nearest the student, and the browser serves
 *     repeats without touching the network at all.
 *  2. Range pass-through — pdf.js issues Range requests for big documents;
 *     the previous version buffered the WHOLE file before replying and
 *     dropped the header, so a 100 MB scan took its full download time
 *     before page 1 appeared. Now the Range header flows upstream (R2 and
 *     Drive both honor it) and 206 partial responses pass straight back —
 *     page 1 paints after the first ~100 KB.
 *  3. Drive interstitial bypass — Drive's uc?export=download endpoint
 *     serves an HTML "virus scan warning" page instead of bytes for larger
 *     files. The proxy uses the drive.usercontent endpoint with confirm=t,
 *     which streams the raw file and skips the wall entirely.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const resource = await resolveResource(id);

  // PDFs only — this endpoint exists for the viewer; other types have no
  // reason to be fetched through it.
  if (!resource || !resource.fileType?.includes("pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Resolve where the bytes live: R2 resources fetch their stored public
  // URL directly; Drive-hosted PDFs use the usercontent endpoint (built
  // from the Drive file id in file_key) which streams bytes with Range
  // support and no interstitial.
  const isDrive = isDriveHosted(resource.fileType, resource.fileUrl);
  const upstreamUrl = isDrive
    ? DRIVE_ID_RE.test(resource.fileKey)
      ? driveUserContentDownloadUrl(resource.fileKey)
      : null
    : resource.fileUrl;
  if (!upstreamUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  const requestHeaders = await headers();
  const ip = getRequestIpFromHeaders(requestHeaders);
  // 240/min per IP: a single viewer open fetches the document once (bytes are
  // cached by the browser afterwards), but a classroom behind one NAT IP —
  // the norm for this site's audience on campus wifi — shares the bucket
  // across every student. 60/min was hit in the wild and 429'd real readers
  // into the viewer's error state ("Couldn't load the PDF"), which reads as
  // "preview blocked". 240 still caps scripted scraping.
  // Forward the viewer's Range header upstream so partial requests stay
  // partial — the difference between "first page in 100 KB" and "first
  // page after the whole file downloads".
  const range = request.headers.get("range");

  // Start the rate-limit round trip NOW and let it overlap the upstream fetch
  // rather than blocking it. pdf.js issues SEVERAL range requests to paint
  // page 1, and paying this Neon round trip serially before every storage
  // fetch stacked up across them. Both settle concurrently, so per-request
  // latency is max(rate-limit, upstream TTFB) instead of their sum. The limit
  // is still enforced — a denied request discards its (already-started) body.
  const allowedPromise = checkRateLimit(`pdf-view:${ip}`, 240, 60);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      redirect: "follow",
      headers: range ? { Range: range } : {},
      // Node fetch buffers by default; streaming passes bytes through as
      // they arrive (first paint ≈ upstream TTFB, not full download).
      // @ts-expect-error — undici option, valid in the Node runtime.
      duplex: "half",
    });
  } catch {
    return new NextResponse("File storage unavailable", { status: 502 });
  }

  if (!(await allowedPromise)) {
    // Stop pulling storage bytes for a request we're about to refuse.
    upstream.body?.cancel().catch(() => {});
    return new NextResponse("Too many requests — slow down.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("File not found in storage", { status: 502 });
  }
  // A Drive interstitial or private-link page arrives as HTML — passing it
  // to pdf.js would render a confusing parse error. (The usercontent
  // endpoint skips the large-file wall; this still catches non-public
  // links, whose HTML sign-in page survives confirm=t.)
  if (upstream.headers.get("content-type")?.includes("text/html")) {
    return new NextResponse("File is not publicly shared", { status: 403 });
  }

  // Partial content passes through with its upstream headers (206 +
  // Content-Range) — required for pdf.js range fetching to work at all.
  const isPartial = upstream.status === 206;
  const outHeaders: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline",
    /**
     * REQUIRED for pdf.js to use range requests at all.
     *
     * pdf.js's `validateRangeRequestCapabilities()` enables range mode ONLY if
     * the very first response advertises `Accept-Ranges: bytes` (plus a
     * Content-Length larger than 2× rangeChunkSize). Without it, `allowRangeRequests`
     * stays false — and since PdfViewer sets `disableStream: true`, pdf.js can
     * then neither stream nor range, so it falls back to buffering the ENTIRE
     * file before it can parse the xref. Measured on this route: full file =
     * 2251ms before page 1 could even start parsing; a 64KB range = 75ms.
     * Adding this one header is what actually makes the viewer fast.
     */
    "Accept-Ranges": "bytes",
    // Immutable per resource id: the file behind an id never changes (a
    // re-upload is a new id), so edge + browser can cache for a full day
    // without staleness risk. `public` moves the caching from per-browser
    // to the CDN edge — the second student to open a past paper in a
    // region gets bytes from the POP, not a cold origin fetch.
    "Cache-Control": "public, max-age=86400, immutable",
    // Only successful bodies carry the cache headers above — error branches
    // below return without them, so a 429/404/502 is never cached (the old
    // config-level rule stamped public max-age=86400 onto EVERY response
    // from this path, including rate-limit errors: one 429 and the browser
    // served "Couldn't load the PDF" for the next day).
    // A stable validator independent of upstream quirks: the resource id
    // IS the content version. Lets conditional revalidates work at the edge.
    ETag: `"pdf-${id}"`,
    // Range-cached chunks are per-range: without this, a cached full-body
    // response could be (incorrectly) reused to answer a Range request.
    Vary: "Range",
  };
  if (isPartial) {
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) outHeaders["Content-Range"] = contentRange;
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) outHeaders["Content-Length"] = contentLength;
    return new NextResponse(upstream.body, {
      status: 206,
      headers: outHeaders,
    });
  }

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) outHeaders["Content-Length"] = contentLength;

  return new NextResponse(upstream.body, {
    status: 200,
    headers: outHeaders,
  });
}
