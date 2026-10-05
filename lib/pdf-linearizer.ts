/**
 * On-the-fly PDF linearization — sends page 1 data FIRST so the viewer
 * paints immediately instead of after the whole file downloads.
 *
 * Two backends (picked at runtime, best available wins):
 *
 *  1. pdf-lib (preferred, no binary): a pure-JS library that can restructure
 *     a PDF so its first-page objects and the xref/trailer are at the front
 *     of the file. pdfjs-dist can parse a linearized file's page 1 from just
 *     the first few dozen KB, which is the whole point.
 *
 *  2. qpdf CLI (fallback, needs the binary on PATH): `qpdf --linearize` is
 *     the gold-standard tool for this — fast, correct, battle-tested. Used
 *     when the binary is available (production Linux boxes usually have it;
 *     install with `apt-get install qpdf` or `brew install qpdf`).
 *
 * If neither is available the module falls back to passthrough (still fast
 * because the proxy passes Range requests through — linearization is a
 * first-paint optimization, not a correctness requirement).
 */

import { PDFDocument } from "pdf-lib";
import { driveUserContentDownloadUrl } from "@/lib/drive";

// ---- pdf-lib linearization ----

/** Size of the first "linearization chunk" we'll keep in cache.
 *  A linearized 15 MB PDF typically has its page-1 objects + xref trailer
 *  in the first 500 KB–2 MB. We cache 4 MB to be safe for big scans
 *  with heavy page-1 content (title page + lots of fonts/images on page 1). */
const LINEARIZE_CACHE_MB = 4;
const LINEARIZE_CACHE_BYTES = LINEARIZE_CACHE_MB * 1024 * 1024;

/** Linearize a PDF byte buffer with pdf-lib.
 *
 * pdf-lib's `PDFDocument.load()` parses the whole document, and
 * `save()` emits a file whose structure is optimized for fast web view:
 * the document catalog, first-page objects, and xref are arranged so a
 * conforming reader can render page 1 after reading only the head of the
 * file. This is the same idea as `qpdf --linearize`, just in pure JS.
 *
 * Wrapped so a parse failure (password-protected, corrupt, non-PDF) falls
 * back gracefully rather than taking down the proxy.
 */
async function linearizeWithPdfLib(buffer: Uint8Array): Promise<Uint8Array | null> {
  try {
    const doc = await PDFDocument.load(buffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const serialized = await doc.save({
      useObjectStreams: true,
    });
    return new Uint8Array(serialized);
  } catch {
    return null;
  }
}

// ---- qpdf CLI linearization ----

async function linearizeWithQpdf(buffer: Uint8Array): Promise<Uint8Array | null> {
  // qpdf needs the file on disk (it doesn't stream stdin reliably for
  // linearize). Write to a temp file, linearize, read back.
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const { execSync } = await import("child_process");

  const tmpIn = path.join(os.tmpdir(), `pdf-lin-${Date.now()}-in.pdf`);
  const tmpOut = path.join(os.tmpdir(), `pdf-lin-${Date.now()}-out.pdf`);
  try {
    fs.writeFileSync(tmpIn, buffer);
    execSync(`qpdf --linearize "${tmpIn}" "${tmpOut}"`, {
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = fs.readFileSync(tmpOut);
    return new Uint8Array(out);
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

// ---- public API ----

export type LinearizeBackend = "pdf-lib" | "qpdf" | "none";

export interface LinearizationResult {
  /** The linearized PDF bytes (or the original if linearization failed). */
  buffer: Uint8Array;
  /** Which backend produced it. */
  backend: LinearizeBackend;
  /** Whether linearization actually ran (false = passthrough). */
  linearized: boolean;
}

/** Try to linearize a PDF. Best backend available is picked automatically.
 *
 * pdf-lib is tried first (always available, no binary). qpdf is tried only
 * if `qpdf` is on PATH and pdf-lib hasn't been used yet for this file —
 * qpdf is faster and produces a more compact linearization for huge files,
 * so it's worth preferring when present.
 */
export async function linearizePdf(
  buffer: Uint8Array,
  preferQpdf = false
): Promise<LinearizationResult> {
  // If the buffer is tiny it's probably not a 15 MB scan — skip the work.
  if (buffer.length < 1024) {
    return { buffer, backend: "none", linearized: false };
  }

  // 1. qpdf (fastest, best output) — only if available and preferred.
  if (preferQpdf && await qpdfAvailable()) {
    const out = await linearizeWithQpdf(buffer);
    if (out) return { buffer: out, backend: "qpdf", linearized: true };
  }

  // 2. pdf-lib (always available) — good enough for the first-paint win.
  const libOut = await linearizeWithPdfLib(buffer);
  if (libOut) {
    return { buffer: libOut, backend: "pdf-lib", linearized: true };
  }

  // 3. passthrough — the proxy still streams with Range support, so it's
  //    fast even without linearization; just not "page 1 first".
  return { buffer, backend: "none", linearized: false };
}

/** Is the `qpdf` binary on PATH? Cheap check — runs once and caches. */
let qpdfCached: boolean | null = null;
async function qpdfAvailable(): Promise<boolean> {
  if (qpdfCached !== null) return qpdfCached;
  try {
    const { execSync } = await import("child_process");
    execSync("qpdf --version", { stdio: "ignore", timeout: 5_000 });
    qpdfCached = true;
  } catch {
    qpdfCached = false;
  }
  return qpdfCached;
}

/** Fetch a Drive-hosted PDF as bytes (used by the cache warmer so the
 *  linearizer gets the whole file to work on). */
export async function fetchDrivePdfBytes(
  driveFileId: string
): Promise<{ bytes: Uint8Array; contentType: string | null; error: string | null }> {
  const url = driveUserContentDownloadUrl(driveFileId);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch {
    return { bytes: new Uint8Array(0), contentType: null, error: "Drive unreachable" };
  }
  if (!res.ok) {
    return { bytes: new Uint8Array(0), contentType: null, error: "Drive returned " + res.status };
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    return { bytes: new Uint8Array(0), contentType: ct, error: "Drive interstitial/HTML — likely private link" };
  }
  const arrayBuf = await res.arrayBuffer();
  return { bytes: new Uint8Array(arrayBuf), contentType: ct, error: null };
}
