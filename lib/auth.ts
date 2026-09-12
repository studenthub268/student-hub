import "server-only";

// ── Session source: Clerk ────────────────────────────────────────────
// Identity lives in Clerk; the Postgres `users` row stays the source of
// truth for app data (uploads, likes, roles). auth() maps the Clerk
// identity onto that row and returns the NextAuth-shaped session so all
// server call sites ({ session.user.id / email / name / image }) keep
// working unchanged.
//
// Mapping order:
//   1. users.clerk_id (durable — set by the user.created webhook, the
//      backfill, or self-heal below)
//   2. users.email (phase-2 bridge) — self-heals by writing the clerkId
//      onto the matched row so the next lookup hits the durable path.

const clerkEnabled = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

type AppUser = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires: string;
};

async function clerkAuth(): Promise<AppUser | null> {
  const { auth: clerkAuthFn, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await clerkAuthFn();
  if (!userId) return null;
  try {
    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    // Steady state: the row is clerkId-mapped (webhook / backfill / self-heal)
    // — one indexed lookup, no Clerk API call, no email dependency.
    const mapped = await db.query.users.findFirst({ where: eq(users.clerkId, userId) });
    if (mapped) {
      return {
        user: {
          id: mapped.id,
          name: mapped.name ?? null,
          email: mapped.email,
          image: mapped.image ?? null,
        },
        expires: new Date(Date.now() + 7 * 86400_000).toISOString(),
      };
    }
    // Unmapped: bridge by email. The session JWT carries no email claim by
    // default, so fetch the verified address from Clerk's Backend API — once,
    // because the self-heal below maps the row for every future request.
    const cu = await currentUser();
    const email = cu?.primaryEmailAddress?.emailAddress;
    if (!email) return null;
    const row = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!row) return null; // Clerk-signed-in but not yet mapped → no session
    // Self-heal: adopt the Clerk identity so future lookups hit the clerkId
    // path. Clerk only signs in verified emails, so stamp verification too.
    await db
      .update(users)
      .set({ clerkId: userId, emailVerified: row.emailVerified ?? new Date() })
      .where(eq(users.id, row.id));
    return {
      user: {
        id: row.id,
        name: row.name ?? null,
        email: row.email,
        image: row.image ?? null,
      },
      expires: new Date(Date.now() + 7 * 86400_000).toISOString(),
    };
  } catch (error) {
    console.error("[auth] Clerk→DB user lookup failed:", error);
    return null;
  }
}

// Without Clerk keys (CI / fresh checkouts) there is no session source —
// every request reads as signed-out.
export const auth = clerkEnabled ? clerkAuth : async (): Promise<AppUser | null> => null;
