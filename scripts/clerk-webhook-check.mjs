// Runnable check for the Clerk webhook lifecycle (CI/local): signs genuine
// svix requests like Clerk's dashboard would and asserts the Postgres rows
// appear, attach, update, and disappear. Run against a booted server:
//   node scripts/clerk-webhook-check.mjs http://localhost:3000
// The server must run with the same CLERK_WEBHOOK_SECRET this script signs
// with (that is how CI wires it). Skips gracefully when unset.
import { config } from "dotenv";
import { Webhook } from "svix";

config({ path: ".env.local" });
const BASE = process.argv[2] || "http://localhost:3000";
const WHSEC = process.env.CLERK_WEBHOOK_SECRET || process.env.TEST_WEBHOOK_SECRET;
if (!WHSEC) {
  console.log("ℹ  skipping clerk-webhook-check — CLERK_WEBHOOK_SECRET not set");
  process.exit(0);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const wh = new Webhook(WHSEC);

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures++;
}

async function send(type, data) {
  const msgId = "test-msg-" + Math.random().toString(36).slice(2);
  const ts = new Date();
  const payload = JSON.stringify({ type, data, timestamp: Math.floor(ts.getTime() / 1000) });
  const res = await fetch(`${BASE}/api/webhooks/clerk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": msgId,
      "svix-timestamp": String(Math.floor(ts.getTime() / 1000)),
      "svix-signature": wh.sign(msgId, ts, payload) ?? "",
    },
    body: payload,
  });
  return res.status;
}

const NEW_USER = {
  id: "user_testNew" + Date.now(),
  email_addresses: [{ id: "idn_1", email_address: "clerk-webhook-check@example.com" }],
  primary_email_address_id: "idn_1",
  first_name: "Check",
  last_name: "User",
  image_url: null,
  has_image: false,
};
const EXISTING_EMAIL = "clerk-attach-test@example.com";
const ATTACH_USER = {
  ...NEW_USER,
  id: "user_testAttach" + Date.now(),
  email_addresses: [{ id: "idn_2", email_address: EXISTING_EMAIL }],
  primary_email_address_id: "idn_2",
  first_name: "Attach",
  last_name: null,
};

try {
  // 0. Untampered request must be rejected.
  const tampered = await fetch(`${BASE}/api/webhooks/clerk`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  check("unsigned request rejected", tampered.status === 401, `got ${tampered.status}`);

  // 1. user.created → row exists with clerk_id + verified flag
  let s = await send("user.created", NEW_USER);
  let rows = await sql`select id, clerk_id, email, name, email_verified from users where clerk_id = ${NEW_USER.id}`;
  check("created: 200 + row inserted", s === 200 && rows.length === 1, `status=${s} rows=${rows.length}`);
  check("created: name + email_verified set",
    rows[0]?.name === "Check User" && rows[0]?.email_verified !== null,
    `name=${rows[0]?.name} verified=${rows[0]?.email_verified !== null}`);

  // 2. user.created with an EXISTING email → attaches clerk_id, no duplicate
  await sql`insert into users (email, name) values (${EXISTING_EMAIL}, 'Pre-existing') on conflict do nothing`;
  s = await send("user.created", ATTACH_USER);
  rows = await sql`select id, clerk_id from users where email = ${EXISTING_EMAIL}`;
  check("created(existing email): 200 + clerkId attached, no dup",
    s === 200 && rows.length === 1 && rows[0].clerk_id === ATTACH_USER.id,
    `status=${s} rows=${rows.length} clerkId=${rows[0]?.clerk_id}`);

  // 3. user.updated → fields sync
  s = await send("user.updated", { ...NEW_USER, first_name: "Renamed" });
  rows = await sql`select name from users where clerk_id = ${NEW_USER.id}`;
  check("updated: name synced", s === 200 && rows[0]?.name === "Renamed User", `status=${s} name=${rows[0]?.name}`);

  // 4. user.deleted → row gone
  s = await send("user.deleted", { id: NEW_USER.id });
  rows = await sql`select id from users where clerk_id = ${NEW_USER.id}`;
  check("deleted: row removed", s === 200 && rows.length === 0, `status=${s} rows=${rows.length}`);
} finally {
  await sql`delete from users where email in ('clerk-webhook-check@example.com', ${EXISTING_EMAIL})`;
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
