import { db } from "@/lib/db";
import { blockedIps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Attack patterns to detect.
// IMPORTANT: these run on EVERY request URL, and a match auto-blocks the
// visitor's IP permanently — so they must be high-confidence shapes only.
// A previous version matched bare characters (' -- # %27 %23), which exist in
// every OAuth state/code (base64url) and in everyday searches like "don't",
// silently locking real users (sometimes a whole campus NAT) out.
const ATTACK_PATTERNS = [
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

  // Command injection
  /;\s*cat\s/i,
  /;\s*ls/i,
  /;\s*wget/i,
  /;\s*curl/i,
  /\|\s*cat/i,
  /`.*`/,

  // Common scanners/bots
  /sqlmap/i,
  /nikto/i,
  /nessus/i,
  /dirbuster/i,
  /gobuster/i,
  /masscan/i,
  /nmap/i,
  /havij/i,
  /w3af/i,
  /acunetix/i,
  /netsparker/i,
  /openvas/i,
];

// Rate limiting: max requests per time window.
// 300/min (5/sec sustained) is far above any human browsing pattern — this
// only trips for scripts/DoS. Sized so a classroom behind one NAT IP and
// CI smoke runs don't get false-positive 429s.
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 300; // 300 requests per minute
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
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "127.0.0.1";
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  try {
    const blocked = await db.query.blockedIps.findFirst({
      where: eq(blockedIps.ip, ip),
    });
    return !!blocked;
  } catch {
    return false;
  }
}

export function detectAttack(url: string, userAgent: string): string | null {
  // Decode once so encoded attacks (union%20select, %3Cscript%3E) are caught.
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // malformed encoding — scan the raw string
  }
  const combined = `${decoded} ${userAgent}`;

  for (const pattern of ATTACK_PATTERNS) {
    if (pattern.test(combined)) {
      return `Attack pattern detected: ${pattern.source}`;
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
