/**
 * Local disk cache for linearized PDF byte ranges.
 *
 * Solves the "hit Google Drive on every page-1 fetch" problem. The first
 * user to open a Drive-hosted PDF triggers a full fetch + linearization;
 * subsequent users (and the same user's page-2+ range requests) get bytes
 * from disk — fast and Drive-rate-limit-free.
 *
 * Design:
 *  - Cache keyed by Drive file id (the resource is immutable — re-uploads
 *    create new Drive files, so the id IS the version).
 *  - Stores the FULL linearized PDF on disk (not just a prefix), so ANY
 *    range request can be served from cache — the proxy's Range handler
 *    slices into the cached buffer.
 *  - LRU eviction by access time, capped at a configurable size on disk.
 *  - TTL: linearized PDFs are content-fixed per file id, so they're cached
 *    "forever" (bounded only by LRU cap + a generous 7-day TTL to catch
 *    a file that was re-shared under the same id, which is rare).
 *  - Graceful: if disk is unavailable (Vercel ephemeral FS, permission
 *    error) the cache silently no-ops — the proxy still streams from Drive
 *    with Range support, just without the warm-cache speedup.
 *
 * Why local disk and not Redis:
 *  - The repo has 9 resources total; a Redis instance for a few KB of
 *    cached PDF heads is overkill and adds a dependency + latency.
 *  - Local disk is free, fast (no network hop), and survives within a
 *    single serverless instance's lifetime — which is where repeat reads
 *    actually happen (same classroom, same NAT IP, same deployment instance
 *    handling multiple requests per minute).
 *  - In production on Vercel, the filesystem is ephemeral per invocation,
 *    so the cache warms on cold start and helps for the lifetime of that
 *    invocation — and the CDN + browser Cache-Control headers (set by the
 *    route) cover cross-instance repeats anyway. Redis would add latency
 *    without helping across instances more than the CDN already does.
 */

import { readFileSync, writeFileSync, statSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

// ---- config ----

/** Where cache files live. Under the project dir so it's easy to find and
 *  prune; on Vercel this is a temp dir that's wiped per-invocation. */
function cacheDir(): string {
  const projectRoot = process.env.CACHE_DIR ?? process.cwd();
  const dir = join(projectDir(projectRoot), "pdf-cache");
  return dir;
}

function projectDir(cwd: string): string {
  // Walk up to find a package.json boundary so the cache lives next to the
  // project even if cwd is a subdirectory.
  let dir = cwd;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}

/** Max total cache size on disk (default 256 MB — enough for ~15–60 linearized
 *  PDFs of 15 MB each). Configurable via CACHE_MAX_MB. */
const DEFAULT_CACHE_MAX_BYTES = 256 * 1024 * 1024;
function maxBytes(): number {
  const env = Number(process.env.CACHE_MAX_MB);
  return Number.isFinite(env) && env > 0 ? env * 1024 * 1024 : DEFAULT_CACHE_MAX_BYTES;
}

/** How long a cached file stays valid (configurable via CACHE_TTL_HOURS).
 *  7 days default — PDFs behind a file id are immutable in practice. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function ttlMs(): number {
  const env = Number(process.env.CACHE_TTL_HOURS);
  return Number.isFinite(env) && env > 0 ? env * 60 * 60 * 1000 : DEFAULT_TTL_MS;
}

// ---- in-memory index + access tracking ----

/** Map from driveFileId → on-disk filename. Rebuilt from disk on first use
 *  (so a restart doesn't lose the warm cache) and kept fresh as entries
 *  are added/removed. */
const index = new Map<string, string>();

/** Last access time (ms epoch) per on-disk path. Used for LRU eviction.
 *  We don't trust FS atime (many FSes mount noatime), so we track it here. */
const accessTimes = new Map<string, number>();

ensureDirStamp();

/** Ensure the cache directory exists once. */
function ensureDirStamp() {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const _ = (async () => {
    const d = cacheDir();
    try {
      const fs = require("fs");
      fs.promises.mkdir(d, { recursive: true }).catch(() => {});
    } catch {
      // Disk might be unavailable — cache becomes a no-op. That's fine.
    }
  })();
}

// ---- public API ----

/** Get a cached linearized PDF for a Drive file id, or null.
 *
 * Returns the full cached byte buffer — the caller slices into it for
 * Range responses. Cache hit = instant (memory + disk read).
 */
export async function getCachedPdf(driveFileId: string): Promise<Uint8Array | null> {
  await ensureDirStamp();
  let filename = index.get(driveFileId);
  if (!filename) {
    // Not in memory — maybe a restart. Rebuild from disk lazily.
    const found = resolveFromDisk(driveFileId);
    if (found) filename = found;
    else return null;
  }
  const path = join(cacheDir(), filename);
  try {
    if (!existsSync(path)) {
      index.delete(driveFileId);
      accessTimes.delete(filename);
      return null;
    }
    const stat = statSync(path);
    if (Date.now() - stat.mtimeMs > ttlMs()) {
      try { unlinkSync(path); } catch {}
      index.delete(driveFileId);
      accessTimes.delete(filename);
      return null;
    }
    accessTimes.set(filename, Date.now());
    const raw = readFileSync(path);
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  } catch {
    index.delete(driveFileId);
    accessTimes.delete(filename);
    return null;
  }
}

/** Store a linearized PDF in the cache.
 *
 * Evicts LRU entries if we'd exceed the size cap. Sync writes so the caller
 * knows the cache is warm before it responds.
 */
export async function setCachedPdf(driveFileId: string, data: Uint8Array): Promise<void> {
  await ensureDirStamp();
  const d = cacheDir();
  // Evict before writing to stay under cap.
  evictToFit(data.byteLength);
  const filename = `${driveFileId}.pdf`;
  const path = join(d, filename);
  try {
    writeFileSync(path, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    index.set(driveFileId, filename);
    accessTimes.set(filename, Date.now());
  } catch {
    // Disk full / unavailable — cache is a luxury, not a requirement.
  }
}

/** Try to serve a Range slice from cache.
 *
 * Returns { data, status } where status is 200 (full file, no Range),
 * 206 (partial), or null (cache miss / can't serve this range).
 */
export async function serveCachedRange(
  driveFileId: string,
  rangeHeader: string | null
): Promise<{ data: Uint8Array; status: 200 | 206; contentRange: string; contentLength: number } | null> {
  const data = await getCachedPdf(driveFileId);
  if (!data) return null;

  const total = data.byteLength;

  if (!rangeHeader) {
    return { data, status: 200, contentRange: `bytes 0-${total - 1}/${total}`, contentLength: total };
  }

  // Parse "bytes=start-end" or "bytes=start-".
  const m = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const endRaw = m[2];
  if (isNaN(start) || start < 0 || start >= total) return null;
  const end = endRaw === "" ? total - 1 : Math.min(parseInt(endRaw, 10), total - 1);
  if (end < start) return null;

  const slice = data.slice(start, end + 1);
  return {
    data: slice,
    status: 206,
    contentRange: `bytes ${start}-${end}/${total}`,
    contentLength: slice.byteLength,
  };
}

/** Bytes currently cached on disk (rough, for logging/monitoring). */
export async function cachedBytes(): Promise<number> {
  await ensureDirStamp();
  let total = 0;
  for (const filename of index.values()) {
    try {
      const path = join(cacheDir(), filename);
      if (existsSync(path)) total += statSync(path).size;
    } catch {}
  }
  return total;
}

// ---- internals ----

/** Resolve a cache file on disk by scanning the cache dir for a matching
 *  driveFileId-named file (used after restarts to rebuild the index). */
function resolveFromDisk(driveFileId: string): string | null {
  const d = cacheDir();
  try {
    const entries = (require("fs") as typeof import("fs")).readdirSync(d).filter((n: string) => n.endsWith(".pdf"));
    for (const name of entries) {
      if (name === `${driveFileId}.pdf`) {
        const p = join(d, name);
        const stat = statSync(p);
        if (Date.now() - stat.mtimeMs <= ttlMs()) return name;
      }
    }
  } catch {}
  return null;
}

/** Evict the least-recently-used entries until `needed` bytes fit. */
function evictToFit(needed: number): void {
  const d = cacheDir();
  const max = maxBytes();
  const used = currentUsed();
  if (used + needed <= max) return;

  // Sort index entries by access time (oldest first).
  const sorted = [...index.entries()].sort((a, b) => {
    return (accessTimes.get(a[1]) ?? 0) - (accessTimes.get(b[1]) ?? 0);
  });

  for (const [id, filename] of sorted) {
    if (currentUsed() + needed <= max) break;
    const path = join(d, filename);
    try {
      const sz = statSync(path).size;
      unlinkSync(path);
      index.delete(id);
      accessTimes.delete(filename);
    } catch {}
  }
}

/** Best-effort current disk usage from the index. */
function currentUsed(): number {
  const d = cacheDir();
  let total = 0;
  for (const filename of index.values()) {
    try {
      const path = join(d, filename);
      if (existsSync(path)) total += statSync(path).size;
    } catch {}
  }
  return total;
}
