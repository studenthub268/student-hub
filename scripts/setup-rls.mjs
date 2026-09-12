// One-time (idempotent) RLS setup for the live database.
//
// Why a dedicated role: the app connects as `neondb_owner`, which has
// BYPASSRLS — policies would be silently skipped for it (verified via
// pg_roles). So user-scoped mutations run through lib/db's scoped helper,
// which does SET LOCAL ROLE app_rls inside the same HTTP batch transaction
// that injects the user id; app_rls has NO bypass attribute, so these
// policies actually apply to it.
//
// Policy model:
//   likes    — write only your own rows (user_id = current app.user_id);
//              SELECT own rows too — INSERT ... RETURNING needs the new row
//              to pass a SELECT policy
//   reports  — write only your own rows (reporter_id = current app.user_id)
//   resources— INSERT only with uploader_id = current app.user_id; SELECT
//              all (public read site, and RETURNING id needs visibility); no
//              UPDATE/DELETE at the DB layer (ownership deletes are checked
//              in the action, which runs as the bypassing owner role).
//
// Reads stay open (the site is public); this hardens the write paths, which
// is where a compromised client could do damage.
//
// Usage: node scripts/setup-rls.mjs
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);

// Identifiers can't be parameterized — the role name is a fixed literal.
const statements = [
  // 1. Role without BYPASSRLS (idempotent: DO block instead of CREATE ROLE).
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
       CREATE ROLE app_rls NOLOGIN NOBYPASSRLS;
     END IF;
   END $$;`,

  // 2. Grants: use the tables through the restricted role.
  `GRANT USAGE ON SCHEMA public TO app_rls`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls`,
  // Future tables (migrations) get the same grants automatically.
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls`,
  // SET LOCAL ROLE requires membership: grant the restricted role to whoever
  // connects with DATABASE_URL (session_user), whatever its name is.
  `DO $$ BEGIN
     EXECUTE format('GRANT app_rls TO %I', session_user);
   END $$;`,

  // 3. Drop + recreate policies (keeps this script re-runnable when the
  //    policy bodies change; idempotent on every run).
  `DROP POLICY IF EXISTS likes_select_own ON likes`,
  `DROP POLICY IF EXISTS likes_insert_own ON likes`,
  `DROP POLICY IF EXISTS likes_update_own ON likes`,
  `DROP POLICY IF EXISTS likes_delete_own ON likes`,
  `DROP POLICY IF EXISTS reports_insert_own ON reports`,
  `DROP POLICY IF EXISTS resources_select_all ON resources`,
  `DROP POLICY IF EXISTS resources_insert_own ON resources`,
  `CREATE POLICY likes_select_own ON likes FOR SELECT TO app_rls
     USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)`,
  `CREATE POLICY likes_insert_own ON likes FOR INSERT TO app_rls
     WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)`,
  `CREATE POLICY likes_update_own ON likes FOR UPDATE TO app_rls
     USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
     WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)`,
  `CREATE POLICY likes_delete_own ON likes FOR DELETE TO app_rls
     USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)`,
  `CREATE POLICY reports_insert_own ON reports FOR INSERT TO app_rls
     WITH CHECK (reporter_id = NULLIF(current_setting('app.user_id', true), '')::uuid)`,
  `CREATE POLICY resources_select_all ON resources FOR SELECT TO app_rls
     USING (true)`,
  `CREATE POLICY resources_insert_own ON resources FOR INSERT TO app_rls
     WITH CHECK (uploader_id = NULLIF(current_setting('app.user_id', true), '')::uuid)`,

  // 4. Turn RLS on (ENABLE) and keep it on even for the table owner
  //    (FORCE — defense-in-depth if the app role ever loses BYPASSRLS).
  `ALTER TABLE likes ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE reports ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE resources ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE likes FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE reports FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE resources FORCE ROW LEVEL SECURITY`,
];

let failures = 0;
for (const stmt of statements) {
  try {
    // NOTE: this driver version's sql.unsafe() returns a fragment instead of
    // executing — sql.query() is the raw executor.
    await sql.query(stmt);
    console.log(`✓ ${stmt.replace(/\s+/g, " ").slice(0, 72)}…`);
  } catch (e) {
    failures++;
    console.error(`✗ ${e.message}\n  in: ${stmt.replace(/\s+/g, " ").slice(0, 90)}`);
  }
}

// Verify the critical property: the role must NOT bypass RLS.
const role = await sql`select rolbypassrls, rolcanlogin from pg_roles where rolname = 'app_rls'`;
if (!role[0]) {
  failures++;
  console.error("✗ app_rls role missing after setup");
} else if (role[0].rolbypassrls) {
  failures++;
  console.error("✗ app_rls unexpectedly has BYPASSRLS — policies would be skipped");
} else {
  console.log(`✓ app_rls exists, NOBYPASSRLS (login=${role[0].rolcanlogin})`);
}

console.log(failures === 0 ? "\nRLS SETUP: ALL PASS" : `\nRLS SETUP: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
