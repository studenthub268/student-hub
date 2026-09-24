import { db } from "@/lib/db";
import { blockedIps } from "@/lib/db/schema";

// Injection shapes, matched against the request URL.
//
// These REJECT the single request (403) but must never create a persistent
// block: a crafted link makes any visitor's browser request them, so one
// shared URL containing `<script` permanently banned the victim's IP — a
// denial-of-service primitive handed to any attacker. URL hits are
// deliberately non-blockable; see detectAttack and proxy.ts.
const INJECTION_PATTERNS = [
  // SQL injection — structural shapes, not loose character classes
  /'\s*(or|and)\s+['\d][^&]*=/i, // quote-break tautology: ' OR 1=1, ' OR 'x'='x'
  /\bunion\s+select\b/i,
  /\binsert\s+into\b/i,
  /\bdelete\s+from\b/i,
  /\bdrop\s+table\b/i,
  /\bupdate\s+\w+\s+set\b/i,
  /\bor\s+1\s*=\s*1\b/i,

  // XSS
  /<script/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /onclick\s*=/i,
  /eval\s*\(/i,

  // Path traversal
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e/i,

  // Command injection — keep these shapes UNAMBIGUOUS: every pattern here
  // permanently auto-blocks the visitor's IP, and "normal" text like a
  // backtick or "| cat" in a search/paper title must never match.
  // (Removed as false-positive traps: /`.*`/, /;\s*ls/, /|\s*cat/.)
  /;\s*cat\s/i,
  /;\s*wget/i,
  /;\s*curl/i,

];

// Scanner/bot signatures. Matched against the USER-AGENT only, which is
// exactly what makes them safe to auto-block: no browser ever sends these
// strings, so an attacker cannot make a victim's browser send one. Matching
// them against the URL (as this used to) meant a student searching "nmap" for
// a networking assignment permanently banned their own IP.
const SCANNER_PATTERNS = [
  /sqlmap/i, /nikto/i, /nessus/i, /dirbuster/i, /gobuster/i, /masscan/i,
  /nmap/i, /havij/i, /w3af/i, /acunetix/i, /netsparker/i, /openvas/i,
];

// Rate limiting: max requests per time window.
// 300/min (5/sec sustained) is far above any human browsing pattern — this
// only trips for scripts/DoS. Sized so a classroom behind one NAT IP and
// CI runs don't get false-positive 429s.
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 600; // 600 requests per minute — headroom for a
// classroom behind one NAT IP; still far above any human browsing rate.
const RATE_LIMIT_MAP = new Map<string, { count: number; resetAt: number }>();

// Lazy cleanup: prune expired entries every 2 minutes to prevent
// unbounded memory growth on long-running servers.
const RATE_LIMIT_CLEANUP_INTERVAL = 2 * 60 * 1000;
let lastRateLimitCleanup = 0;

export function cleanupRateLimitMap(): void {
  const now = Date.now();
  if (now - lastRateLimitCleanup < RATE_LIMIT_CLEANUP_INTERVAL) return;
  lastRateLimitCleanup = now;

  for (const [key, entry] of RATE_LIMIT_MAP) {
    if (now > entry.resetAt) {
      RATE_LIMIT_MAP.delete(key);
    }
  }
}

export function getIpAddress(request: Request): string {
  // Security best practice: the LEFTMOST x-forwarded-for entry is chosen by
  // the CLIENT and trivially spoofable ("X-Forwarded-For: 1.2.3.4" in any
  // request). Trusting it let attackers rotate fake IPs to evade the rate
  // limiter/blocklist — or worse, FRAME a victim IP into a permanent ban.
  // The RIGHTMOST entry is the one appended by our own trusted edge (Vercel),
  // so that is the client's real address.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",").pop()!.trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

// Blocked-IP cache: the proxy checks EVERY request against this table, and
// a Neon HTTP roundtrip per request is the single largest source of
// navigation latency on the site. The list is tiny and changes rarely, so it
// is cached in memory for 60s — a fresh block propagates to other instances
// within 60s and is instant on the instance that made the change (see
// invalidateBlockedIpsCache).
const BLOCKED_IPS_TTL_MS = 60 * 1000;
let blockedIpsCache: { ips: Set<string>; loadedAt: number } | null = null;

/** Drop the in-memory blocked-IP cache so the next check re-reads the DB. */
export function invalidateBlockedIpsCache(): void {
  blockedIpsCache = null;
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  const now = Date.now();
  if (!blockedIpsCache || now - blockedIpsCache.loadedAt > BLOCKED_IPS_TTL_MS) {
    try {
      const rows = await db.select({ ip: blockedIps.ip }).from(blockedIps);
      blockedIpsCache = { ips: new Set(rows.map((r) => r.ip)), loadedAt: now };
    } catch {
      // Fail open, and keep serving the stale cache if we have one.
      if (!blockedIpsCache) return false;
    }
  }
  return blockedIpsCache.ips.has(ip);
}

export interface AttackVerdict {
  reason: string;
  /** True only for signals a victim's browser cannot be made to send. */
  blockable: boolean;
}

export function detectAttack(url: string, userAgent: string): AttackVerdict | null {
  // 1. Scanner signatures — user-agent only. A link cannot set the victim's
  //    user-agent, so these are the one signal safe to persist as a block.
  for (const pattern of SCANNER_PATTERNS) {
    if (pattern.test(userAgent)) {
      return { reason: `Scanner user-agent: ${pattern.source}`, blockable: true };
    }
  }

  // 2. Injection shapes — URL only, never persisted. Decode once so encoded
  //    attacks (union%20select, %3Cscript%3E) are still caught.
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // malformed encoding — scan the raw string
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(decoded)) {
      return { reason: `Attack pattern detected: ${pattern.source}`, blockable: false };
    }
  }
  return null;
}

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(ip);

  if (!entry || now > entry.resetAt) {
    RATE_LIMIT_MAP.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false; // not blocked
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return true; // blocked
  }
  return false;
}
