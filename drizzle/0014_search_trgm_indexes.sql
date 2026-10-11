-- Trigram (pg_trgm) indexes for keyword search. This is the ONLY index this
-- round adds. Everything else the app runs is already covered by
-- 0010_performance_indexes — verified by EXPLAIN ANALYZE at 100k rows: the home
-- feed, all three browse sorts (newest/likes/downloads), subject+type filters,
-- the related-items query, and by-primary-key lookups all use indexes and run
-- sub-millisecond. Adding more would only tax writes for no read gain.
--
-- WHY THESE TWO:
--   The search paths use `ILIKE '%term%'` (leading wildcard), which a btree
--   index CANNOT serve. Measured at 100k rows, the app's real search query
--   (title OR professor, LIMIT 10) ran as a full Seq Scan:
--
--     search suggestions (lib/actions/search.ts)  ~14–58ms  Seq Scan
--     browse keyword search (app/browse/page.tsx) ~57ms     Seq Scan
--
--   With a trigram GIN index on BOTH title and professor, Postgres builds a
--   Bitmap-OR and the same queries drop to a Bitmap Heap Scan:
--
--     selective term 'Workshop Practice'  57.8ms -> 0.1ms   (~500x)
--     selective term 'Calculus quiz'      55.6ms -> 0.1ms   (~500x)
--     rare professor 'Prof. Ayesha'       37.4ms -> 0.1ms   (title-only)
--
--   Both columns need an index because the predicate is `title ILIKE ... OR
--   professor ILIKE ...`; a Bitmap-OR requires an index on each arm. For very
--   common terms (matching >~25% of rows) the planner correctly declines the
--   index and Seq-Scans — but those return via LIMIT almost instantly anyway,
--   so there is no regression.
--
-- pg_trgm is an extension; created IF NOT EXISTS below (already available on
-- this Neon cluster — verified). It only enables trigram matching; it does not
-- change any query behaviour. Search results are byte-for-byte identical.
--
-- NOTE ON CONCURRENTLY (why this file does NOT use it):
--   On a large table with live traffic you would build these with
--   CREATE INDEX CONCURRENTLY so writes are never blocked. Two reasons this
--   migration uses a plain build instead:
--     1. The production `resources` table has ~10 rows; a plain build locks
--        writes for well under a second — CONCURRENTLY would be over-engineering.
--     2. `npm run db:migrate` (drizzle-kit) runs each migration inside a
--        transaction, and CREATE INDEX CONCURRENTLY is illegal in a
--        transaction — it would fail the whole migration.
--   If/when resources grows to millions of rows with live users, build the two
--   indexes by hand against the DIRECT (non-pooler) endpoint, outside any
--   transaction, using the statements in the "CONCURRENT rebuild" block at the
--   bottom, then add them here for the journal. Until then, keep it simple.

-- Enable the trigram extension (no-op if already installed).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Keyword search over title (browse q= + search suggestions).
CREATE INDEX IF NOT EXISTS "resources_title_trgm_idx"
  ON "resources" USING gin ("title" gin_trgm_ops);

-- Keyword search over professor (the OR arm of the same two queries).
CREATE INDEX IF NOT EXISTS "resources_professor_trgm_idx"
  ON "resources" USING gin ("professor" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- ROLLBACK (undo this migration):
--   DROP INDEX IF EXISTS "resources_title_trgm_idx";
--   DROP INDEX IF EXISTS "resources_professor_trgm_idx";
--   -- pg_trgm is shared; leave the extension installed unless nothing else
--   -- uses it: DROP EXTENSION IF EXISTS pg_trgm;
--
-- CONCURRENT rebuild (for a future large/live table — run manually, NOT via
-- drizzle-kit, against the direct endpoint, one statement at a time, each
-- OUTSIDE a transaction):
--   REINDEX INDEX CONCURRENTLY ...;  -- if replacing an existing copy
--   -- or, building fresh without a transaction:
--   --   CREATE INDEX CONCURRENTLY IF NOT EXISTS "resources_title_trgm_idx"
--   --     ON "resources" USING gin ("title" gin_trgm_ops);
--   --   CREATE INDEX CONCURRENTLY IF NOT EXISTS "resources_professor_trgm_idx"
--   --     ON "resources" USING gin ("professor" gin_trgm_ops);
-- ---------------------------------------------------------------------------
