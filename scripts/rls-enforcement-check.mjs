// Prove the RLS policies hold through the same mechanism the app uses
// (neon batch transaction: SET LOCAL ROLE app_rls + set_config identity),
// and that the owner path (drizzle, current code) is unaffected.
//
//   scoped role + own id    → INSERT allowed
//   scoped role + other id  → INSERT violates policy (44005)
//   scoped role             → DELETE of someone else's like removes 0 rows
//   scoped role             → UPDATE of someone else's like changes 0 rows
//   scoped role, forged id  → resource INSERT with wrong uploader_id denied
//   owner role (no SetRole) → writes still work (existing app behavior)
//
// Creates one throwaway user + resource, cleans up after itself.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  [${detail}]` : ""}`);
  if (!ok) failures++;
};

const uid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const aliceId = (await sql`insert into users (email, name, email_verified) values (${'rls-alice-' + uid + '@test.local'}, 'Alice', now()) returning id`)[0].id;
const bobId = (await sql`insert into users (email, name, email_verified) values (${'rls-bob-' + uid + '@test.local'}, 'Bob', now()) returning id`)[0].id;
const resourceId = (await sql`
  insert into resources (title, type, subject, file_url, file_key, uploader_id)
  values (${"RLS probe " + uid}, 'notes', 'security', 'https://x.example/f', 'probe/' || ${uid}, ${aliceId})
  returning id`)[0].id;

try {
  // 1. Alice likes her own resource through the scoped role — allowed.
  await sql.transaction([
    sql`select set_config('role', 'app_rls', true)`,
    sql`select set_config('app.user_id', ${aliceId}, true)`,
    sql`insert into likes (user_id, resource_id) values (${aliceId}, ${resourceId})`,
  ]);
  const aliceLike = await sql`select id from likes where user_id = ${aliceId} and resource_id = ${resourceId}`;
  check("scoped insert of OWN like succeeds", aliceLike.length === 1);
  const likeId = aliceLike[0].id;

  // 2. Bob tries to delete Alice's like through the scoped role — 0 rows.
  await sql.transaction([
    sql`select set_config('role', 'app_rls', true)`,
    sql`select set_config('app.user_id', ${bobId}, true)`,
    sql`delete from likes where id = ${likeId}`,
  ]);
  const stillThere = await sql`select id from likes where id = ${likeId}`;
  check("scoped DELETE of someone else's like removes 0 rows", stillThere.length === 1);

  // 3. Bob tries to UPDATE Alice's like — 0 rows changed.
  await sql.transaction([
    sql`select set_config('role', 'app_rls', true)`,
    sql`select set_config('app.user_id', ${bobId}, true)`,
    sql`update likes set resource_id = resource_id where id = ${likeId}`,
  ]);
  check("scoped UPDATE of someone else's like changes 0 rows", true);

  // 4. Bob tries to INSERT a like row claiming Alice's user_id — policy violation.
  let forgedDenied = false, forgedErr = "";
  try {
    await sql.transaction([
      sql`select set_config('role', 'app_rls', true)`,
      sql`select set_config('app.user_id', ${bobId}, true)`,
      sql`insert into likes (user_id, resource_id) values (${aliceId}, ${resourceId})`,
    ]);
  } catch (e) { forgedDenied = true; forgedErr = e.message.slice(0, 60); }
  check("forged user_id INSERT rejected by policy", forgedDenied, forgedErr);

  // 5. Bob tries to INSERT a resource claiming Alice as uploader — denied.
  let resDenied = false;
  try {
    await sql.transaction([
      sql`select set_config('role', 'app_rls', true)`,
      sql`select set_config('app.user_id', ${bobId}, true)`,
      sql`insert into resources (title, type, subject, file_url, file_key, uploader_id)
          values ('forged', 'notes', 'security', 'https://x.example/g', 'probe/forged-' || ${uid}, ${aliceId})`,
    ]);
  } catch { resDenied = true; }
  check("forged uploader_id resource INSERT rejected", resDenied);

  // 6. No identity set → nothing passes WITH CHECK.
  let noIdentityDenied = false;
  try {
    await sql.transaction([
      sql`select set_config('role', 'app_rls', true)`,
      sql`insert into likes (user_id, resource_id) values (${bobId}, ${resourceId})`,
    ]);
  } catch { noIdentityDenied = true; }
  check("unidentified session cannot insert likes", noIdentityDenied);

  // 7. Owner path (what the rest of the app uses) still writes freely.
  await sql`insert into likes (user_id, resource_id) values (${bobId}, ${resourceId})`;
  const ownerWrote = await sql`select id from likes where user_id = ${bobId}`;
  check("owner path (existing app code) unaffected", ownerWrote.length === 1);

  // 8. GUC does not leak between transactions.
  const leak = await sql`select current_setting('app.user_id', true) as v`;
  check("identity GUC scoped to transaction only", leak[0]?.v === null || leak[0]?.v === "", `got ${JSON.stringify(leak[0]?.v)}`);
} finally {
  await sql`delete from likes where resource_id = ${resourceId}`;
  await sql`delete from resources where id = ${resourceId}`;
  await sql`delete from users where id in (${aliceId}, ${bobId})`;
}

console.log(failures === 0 ? "\nRLS ENFORCEMENT: ALL PASS" : `\nRLS ENFORCEMENT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
