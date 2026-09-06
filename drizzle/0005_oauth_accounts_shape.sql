-- 0005: Align "accounts" with @auth/drizzle-adapter expectations (OAuth sign-in fix)
--
-- Root cause of "Server error" on Google/GitHub sign-in:
--   1. DrizzleAdapter was called without table mappings (fixed in lib/auth.ts).
--   2. The adapter's linkAccount() inserts the provider payload WITHOUT an "id"
--      value, and looks accounts up by (provider, providerAccountId) — the
--      canonical Auth.js composite primary key. Our old shape had a
--      non-defaulted "id" primary key, so inserts could never succeed.
--
-- The table is empty (every OAuth callback failed before any INSERT), so this
-- is a pure structure change — no data migration needed.
DROP INDEX IF EXISTS "accounts_provider_providerAccountId_idx";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_pkey";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_provider_providerAccountId_pk";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "id";
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY ("provider", "providerAccountId");
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "id_token" text;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "session_state" text;
