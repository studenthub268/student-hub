-- 0006: Drop the unused legacy "users"."clerk_id" column
--
-- Leftover from the reverted Clerk migration (phase 3); the schema comment said
-- no row ever used it, and no application code reads or writes it. Pure
-- structure change — no data migration needed. The column's unique constraint
-- goes away with the column.
ALTER TABLE "users" DROP COLUMN IF EXISTS "clerk_id";
