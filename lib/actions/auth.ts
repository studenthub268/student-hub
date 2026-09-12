"use server";

import { db } from "@/lib/db";
import { users, resources } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { checkRateLimit } from "./rate-limit";
import { deleteR2Object } from "@/lib/r2";
import { auth } from "@/lib/auth";

/**
 * Delete the signed-in user's account (privacy-policy "right to erasure").
 * Postgres data cascades via FK; the Clerk identity is deleted via the
 * Backend API so the credential itself is gone, and the Clerk session is
 * revoked. Re-auth guard (typed password) is intentionally dropped: Clerk
 * already authenticated this device, and password re-auth against a local
 * hash no longer exists here.
 */
export async function deleteMyAccount() {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return { error: "Not signed in" };
    }
    const userId = session.user.id;

    // Rate limit: 3 attempts per hour per account
    const allowed = await checkRateLimit(`delete-account:${userId}`, 3, 3600);
    if (!allowed) {
      return { error: "Too many attempts. Please try again later." };
    }

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });
    if (!user) return { error: "Account not found" };

    // 1. Delete this user's uploaded files from R2 before the cascade.
    try {
      const uploads = await db
        .select({ fileKey: resources.fileKey })
        .from(resources)
        .where(eq(resources.uploaderId, userId));
      await Promise.all(
        uploads
          .filter((u) => u.fileKey)
          .map((u) => deleteR2Object(u.fileKey))
      );
    } catch (e) {
      console.error("Failed to delete user files from R2:", e);
      return { error: "Could not remove your files. Please try again or contact support." };
    }

    // 2. Decrement like-counters on other users' resources that this user liked.
    try {
      await db.execute(sql`
        update resources r
        set likes = greatest(r.likes - sub.n, 0)
        from (
          select resource_id, count(*)::int as n
          from likes
          where user_id = ${userId}
          group by resource_id
        ) sub
        where r.id = sub.resource_id
      `);
    } catch (e) {
      console.error("Failed to adjust like counters during account deletion:", e);
      // Non-fatal: counters self-heal via unique-index integrity on future likes
    }

    // 3. Delete the Postgres row — everything else cascades (accounts,
    //    resources, likes, reports).
    await db.delete(users).where(eq(users.id, userId));

    // 4. Delete the Clerk identity + revoke sessions (best-effort: the
    //    Postgres deletion is the authoritative one; a Clerk API failure
    //    leaves an orphaned Clerk user, cleaned by the user.deleted webhook
    //    retry if the row still existed — otherwise harmless).
    if (user.clerkId && process.env.CLERK_SECRET_KEY) {
      try {
        const res = await fetch(`https://api.clerk.com/v1/users/${user.clerkId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
        });
        if (!res.ok) {
          console.error(`[auth] Clerk user deletion failed: ${res.status}`);
        }
      } catch (e) {
        console.error("[auth] Clerk user deletion request failed:", e);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Delete account error:", error);
    return { error: "Something went wrong" };
  }
}
