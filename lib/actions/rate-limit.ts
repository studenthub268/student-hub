"use server";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Atomic rate-limit check using a CTE to eliminate the read-then-write race.
 *
 * How it works:
 * `upsert` inserts a new row or updates the existing one. PostgreSQL
 * acquires a row-level lock on conflict, serialising concurrent requests
 * for the same key so only one can succeed at a time.
 *   - If the window expired → count resets to 1.
 *   - If count < limit → count increments by 1.
 *   - Otherwise → the WHERE clause prevents the UPDATE entirely, so
 *     RETURNING yields NO row.
 *
 * Allowed ⟺ the mutation fired ⟺ the query returned a row. The WHERE
 * clause is the single authoritative arbiter — a row comes back exactly
 * when a fresh insert, an increment or a window reset happened, and is
 * absent exactly when the bucket was already at the limit inside a live
 * window.
 *
 * (An earlier version also snapshotted the pre-update count and compared
 * it against the new one, treating "unchanged" as denied. That misfired
 * for the most common state a per-user limiter sees: a window that
 * expired with count = 1. The reset writes 1, the stale snapshot also
 * reads 1 → "unchanged" → denied, so the FIRST request of every new
 * window after a single-use window got a 429 — for the PDF viewer this
 * meant every repeat open ate a 1.5 s retry delay.)
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

  const result = await db.execute(sql`
    WITH upsert AS (
      INSERT INTO rate_limits (key, count, last_request, expires_at)
      VALUES (${key}, 1, ${now}, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limits.expires_at <= ${now} THEN 1
          ELSE rate_limits.count + 1
        END,
        last_request = ${now},
        expires_at = CASE
          WHEN rate_limits.expires_at <= ${now} THEN ${expiresAt}
          ELSE rate_limits.expires_at
        END
      WHERE rate_limits.expires_at <= ${now} OR rate_limits.count < ${limit}
      RETURNING count
    )
    SELECT count FROM upsert
  `).catch((error) => {
    // Fail OPEN: this one limiter guards likes, uploads, downloads, search
    // suggestions and the contact form, so a transient error on the
    // rate_limits table must not take all of those down with it. A brief
    // window of unmetered writes beats "liking is broken".
    console.error("[rate-limit] check failed; allowing the request:", error);
    return null;
  });
  if (!result) return true;

  // Empty result = the WHERE clause blocked the UPDATE = bucket at limit.
  return result.rows.length > 0;
}
