import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Clerk → Postgres user sync (migration phase 3). Clerk stays the identity
// provider; this table keeps app data (uploads, likes, roles) joined to it.
// Events handled:
//   user.created  → insert (or backfill clerkId onto an existing email row)
//   user.updated  → sync email/name/image from the primary email
//   user.deleted  → delete the Postgres row (cascades uploads/likes via FK)
interface ClerkEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    has_image?: boolean;
    username?: string | null;
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Svix signature check — drop anything not signed by Clerk. verify()
  // THROWS on any invalid/forged signature (empirically asserted) and its
  // parsed return is unreliable across versions, so it is used purely as
  // the authenticity gate and the payload is parsed separately after.
  const payload = await req.text();
  try {
    const wh = new Webhook(secret);
    wh.verify(payload, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  let event: ClerkEvent;
  try {
    event = JSON.parse(payload) as ClerkEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const d = event.data;
  if (!d?.id) return NextResponse.json({ ok: true });

  try {
    switch (event.type) {
      case "user.created": {
        const email = d.email_addresses?.find(
          (e) => e.id === d.primary_email_address_id
        )?.email_address ?? d.email_addresses?.[0]?.email_address;
        const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || null;
        if (!email) {
          // Clerk user without an email yet — store the identity only; the
          // user.updated event lands once they add one.
          await db.insert(users).values({ clerkId: d.id, email: `clerk-${d.id}@invalid` }).onConflictDoNothing();
          break;
        }
        // Two paths: brand-new Clerk signup → insert; or the email already
        // exists (NextAuth-era user / backfill race) → attach the clerkId.
        const inserted = await db
          .insert(users)
          .values({ clerkId: d.id, email, name, image: d.image_url ?? null, emailVerified: new Date() })
          .onConflictDoNothing({ target: users.email })
          .returning({ id: users.id });
        if (inserted.length === 0) {
          await db.update(users).set({ clerkId: d.id }).where(eq(users.email, email));
        }
        break;
      }
      case "user.updated": {
        const email = d.email_addresses?.find(
          (e) => e.id === d.primary_email_address_id
        )?.email_address ?? d.email_addresses?.[0]?.email_address;
        const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || null;
        await db
          .update(users)
          .set({
            ...(email ? { email } : {}),
            ...(name ? { name } : {}),
            ...(d.image_url && d.has_image ? { image: d.image_url } : {}),
          })
          .where(eq(users.clerkId, d.id));
        break;
      }
      case "user.deleted": {
        await db.delete(users).where(eq(users.clerkId, d.id));
        break;
      }
    }
  } catch (error) {
    console.error(`[clerk-webhook] ${event.type} failed:`, error);
    // Non-2xx makes Clerk retry with backoff — correct for transient DB errs.
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
