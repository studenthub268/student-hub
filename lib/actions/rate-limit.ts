"use server";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/**
 * Atomic rate-limit check using a CTE to eliminate the read-then-write race.
 *
 * How it works:
 * 1. `old_state` (MATERIALIZED) snapshots the current count before any mutation.
 * 2. `upsert` atomically inserts a new row or updates the existing one.
 *    PostgreSQL acquires a row-level lock on conflict, serialising concurrent
 *    requests for the same key so only one can succeed at a time.
 *    - If the window expired → count resets to 1.
 *    - If count < limit → count increments by 1.
 *    - Otherwise → WHERE clause prevents the UPDATE entirely.
 * 3. Comparing old_count to new_count tells us whether the increment actually
 *    happened. A mismatch (or a first-request NULL → -1) means "allowed";
 *    equality means the row was already at the limit and the UPDATE was skipped.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

  const result = await db.execute(sql`
    WITH old_state AS MATERIALIZED (
      SELECT count AS old_count
      FROM rate_limits
      WHERE key = ${key}
    ),
    upsert AS (
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
      RETURNING count AS new_count
    )
    SELECT
      new_count,
      COALESCE(old_count, -1) AS old_count
    FROM upsert
    LEFT JOIN old_state ON true
  `);

  const row = result.rows[0] as { new_count: number; old_count: number };

  // Allowed when:
  //   • first request   → old_count is -1 (no prior row)
  //   • count changed   → the UPDATE fired (new_count ≠ old_count)
  // Denied when:
  //   • count unchanged → the WHERE clause blocked the UPDATE (at limit)
  return row.old_count === -1 || row.new_count !== row.old_count;
}
