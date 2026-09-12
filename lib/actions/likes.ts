"use server";

import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { checkRateLimit } from "./rate-limit";
import { runAsUser } from "@/lib/db/scoped";
import { z } from "zod";

// Trust-boundary validation: the id crosses from the browser on every call.
const resourceIdSchema = z.string().uuid();

export async function toggleLike(resourceId: string, isLiked: boolean) {
  const parsed = resourceIdSchema.safeParse(resourceId);
  if (!parsed.success) throw new Error("Invalid resource id");

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Authentication required");

  // Rate limit like toggles per user (30/min) — a script hammering the
  // button would otherwise spam counter updates.
  if (!(await checkRateLimit(`like:${userId}`, 30, 60))) {
    throw new Error("Too many actions. Slow down a little.");
  }

  // The scoped (RLS) batch owns the user-owned like row: policies guarantee
  // it can only ever touch THIS user's row, and RETURNING tells us whether
  // the toggle actually flipped. The `likes` counter is aggregate state on
  // someone's resource — deliberately NOT writable through the scoped role
  // (a writable policy there would let users set their own like counts), so
  // it is adjusted owner-side, exactly once, iff the row changed.
  let flipped = false;
  if (isLiked) {
    const results = await runAsUser(userId, (sql) => [
      sql`delete from likes where user_id = ${userId} and resource_id = ${parsed.data} returning id`,
    ]);
    flipped = ((results[2] as { id: string }[] | undefined)?.length ?? 0) > 0;
    if (flipped) {
      await db
        .update(resources)
        .set({ likes: sql`greatest(${resources.likes} - 1, 0)` })
        .where(eq(resources.id, parsed.data));
    }
  } else {
    const results = await runAsUser(userId, (sql) => [
      sql`insert into likes (user_id, resource_id) values (${userId}, ${parsed.data}) on conflict do nothing returning id`,
    ]);
    flipped = ((results[2] as { id: string }[] | undefined)?.length ?? 0) > 0;
    if (flipped) {
      await db
        .update(resources)
        .set({ likes: sql`${resources.likes} + 1` })
        .where(eq(resources.id, parsed.data));
    }
  }

  revalidatePath(`/resource/${parsed.data}`);
  return { success: true, changed: flipped };
}

export async function recordDownload(resourceId: string) {
  const parsed = resourceIdSchema.safeParse(resourceId);
  if (!parsed.success) return;

  try {
    // Throttle counter writes per IP (20/min) so a script can't inflate the
    // number. Silently skip over the limit — the real download must never
    // break because the counter is busy.
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await checkRateLimit(`download-counter:${ip}`, 20, 60))) return;

    await db
      .update(resources)
      .set({ downloads: sql`${resources.downloads} + 1` })
      .where(eq(resources.id, parsed.data));
  } catch (error) {
    console.error("Failed to record download:", error);
  }
}
