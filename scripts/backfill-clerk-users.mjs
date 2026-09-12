// One-time migration backfill: map existing Postgres users to their Clerk
// identities by matching verified primary email via Clerk's Backend API.
// Usage: node scripts/backfill-clerk-users.mjs
// Idempotent — rows already carrying a clerk_id are skipped. Users with no
// Clerk account stay unmapped; lib/auth.ts self-heals them at first
// Clerk sign-in, and the user.created webhook covers new signups.
import { config } from "dotenv";

config({ path: ".env.local" });

const SK = process.env.CLERK_SECRET_KEY;
if (!SK) {
  console.error("CLERK_SECRET_KEY missing — nothing to do.");
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

async function clerkUserByEmail(email) {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=5`,
    { headers: { Authorization: `Bearer ${SK}` } }
  );
  if (!res.ok) throw new Error(`Clerk API ${res.status} for ${email}`);
  const matches = await res.json();
  if (matches.length === 0) return null;
  // Exact, case-insensitive match on a verified primary email only.
  return (
    matches.find(
      (u) =>
        u.email_addresses?.some(
          (e) =>
            e.verification?.status === "verified" &&
            e.email_address.toLowerCase() === email.toLowerCase()
        ) ?? false
    ) ?? null
  );
}

const users = await sql`select id, email, clerk_id from users order by created_at asc`;
console.log(`users in DB: ${users.length}`);

let mapped = 0,
  skipped = 0,
  missing = 0;
const unmapped = [];

for (const u of users) {
  if (u.clerk_id) {
    skipped++;
    continue;
  }
  try {
    const cu = await clerkUserByEmail(u.email);
    if (!cu) {
      missing++;
      unmapped.push(u.email);
      continue;
    }
    const updated = await sql`
      update users set clerk_id = ${cu.id}
      where id = ${u.id} and clerk_id is null
      returning id`;
    if (updated.length > 0) {
      mapped++;
      console.log(`  ✓ ${u.email} → ${cu.id}`);
    } else {
      skipped++;
    }
  } catch (e) {
    console.error(`  ✗ ${u.email}: ${e.message}`);
    missing++;
    unmapped.push(u.email);
  }
}

console.log(
  `\nDone. mapped: ${mapped}, already-mapped/skipped: ${skipped}, no Clerk account: ${missing}`
);
if (unmapped.length > 0) {
  console.log("Unmapped (self-heal at first Clerk sign-in):");
  for (const e of unmapped) console.log(`  - ${e}`);
}
