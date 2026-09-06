"use server";

import { db } from "@/lib/db";
import { resources, likes } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";

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
    await db.update(resources)
      .set({ downloads: sql`${resources.downloads} + 1` })
      .where(eq(resources.id, resourceId));
  } catch (error) {
    console.error("Failed to record download:", error);
  }
}
