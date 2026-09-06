import { db } from "@/lib/db";
import { emailEvents } from "@/lib/db/schema";
import { lt } from "drizzle-orm";

const RETENTION_DAYS = 90;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

let lastCleanup = 0;

/**
 * Delete email_events rows older than RETENTION_DAYS.
 * Runs lazily — triggered on the first proxy request after the interval
 * has elapsed. No timers, no background threads, works in serverless.
 */
export async function cleanupOldEmailEvents(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  try {
    const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db
      .delete(emailEvents)
      .where(lt(emailEvents.createdAt, cutoff));
  } catch (e) {
    // Non-critical — log and move on
    console.error("[Cleanup] Failed to prune email_events:", e);
  }
}
