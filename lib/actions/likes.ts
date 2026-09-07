"use server";

import { db } from "@/lib/db";
import { resources, likes } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { checkRateLimit } from "./rate-limit";

export async function toggleLike(resourceId: string, isLiked: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error("Authentication required");

  if (isLiked) {
    // Unlike
    await db.delete(likes).where(
      and(
        eq(likes.userId, session.user.id),
        eq(likes.resourceId, resourceId)
      )
    );

    await db.update(resources)
      .set({ likes: sql`${resources.likes} - 1` })
      .where(eq(resources.id, resourceId));
  } else {
    // Like
    await db.insert(likes).values({
      userId: session.user.id,
      resourceId: resourceId,
    });

    await db.update(resources)
      .set({ likes: sql`${resources.likes} + 1` })
      .where(eq(resources.id, resourceId));
  }

  revalidatePath(`/resource/${resourceId}`);
  return { success: true };
}

export async function recordDownload(resourceId: string) {
  try {
    // Throttle counter writes per IP (20/min) so a script can't inflate the
    // number. Silently skip over the limit — the real download must never
    // break because the counter is busy.
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await checkRateLimit(`download-counter:${ip}`, 20, 60))) return;

    await db.update(resources)
      .set({ downloads: sql`${resources.downloads} + 1` })
      .where(eq(resources.id, resourceId));
  } catch (error) {
    console.error("Failed to record download:", error);
  }
}
