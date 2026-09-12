// RLS-scoped database helper.
//
// The app connects as a role with BYPASSRLS (Neon default), so table
// policies would be silently skipped for it. User-scoped mutations
// therefore run through this helper: one neon HTTP batch transaction that
// (1) switches to the NOBYPASSRLS role `app_rls`, (2) injects the verified
// server-side user id, (3) performs the writes. Inside the batch, Postgres
// RLS policies (see scripts/setup-rls.mjs) make it impossible to touch
// another user's rows or forge an identity — even if action-level checks
// regress. Proven by scripts/rls-enforcement-check.mjs (ALL PASS).
//
// NOTE: drizzle's neon-http driver throws on .transaction(), so batches
// use the raw neon() client. Statements are built with the template tag
// (parameterized); only values from `auth()`/validated input go in.
import {
  neon,
  type NeonQueryFunction,
  type NeonQueryPromise,
} from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;
function neonSql(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

/** One statement inside a scoped batch — a neon template-tag fragment. */
export type ScopedStatement = NeonQueryPromise<false, false>;

/**
 * Run statements as the RLS-restricted role with the given verified user id
 * injected for this transaction only. The id MUST come from the server-side
 * session (auth()), never from request input.
 *
 * @param build receives the neon tag; return the statements to run inside
 *   the batch, after the role switch and identity injection.
 * @returns the batch results, one rows-array per statement.
 */
export async function runAsUser(
  userId: string,
  build: (sql: NeonQueryFunction<false, false>) => readonly ScopedStatement[]
) {
  const s = neonSql();
  const batch: ScopedStatement[] = [
    s`select set_config('role', 'app_rls', true)`,
    s`select set_config('app.user_id', ${userId}, true)`,
    ...build(s),
  ];
  return await s.transaction(batch);
}
