-- Performance indexes. The site had NO secondary indexes on resources: every
-- browse load (ORDER BY created_at LIMIT 200), every sort variant, and every
-- keyword search scanned the whole table. Fine at hundreds of rows; a full
-- scan + in-memory sort at thousands. These indexes move the work into B-trees
-- so the pages stay fast as the library grows.

-- Home page + Browse "newest" (the default sort): ORDER BY created_at DESC
-- LIMIT 3/200 becomes a backward index scan that stops after N rows.
CREATE INDEX IF NOT EXISTS "resources_created_at_idx" ON "resources" ("created_at");

-- "Most liked" / "Most downloaded" sort variants.
CREATE INDEX IF NOT EXISTS "resources_likes_idx" ON "resources" ("likes");
CREATE INDEX IF NOT EXISTS "resources_downloads_idx" ON "resources" ("downloads");

-- Subject filtering (browse pills + the resource page's "More like this")
-- and department duplicate-checks. Composite (subject, created_at) lets the
-- most common shape — filter by subject, sort newest — be answered entirely
-- from the index.
CREATE INDEX IF NOT EXISTS "resources_subject_created_at_idx" ON "resources" ("subject", "created_at");
CREATE INDEX IF NOT EXISTS "resources_department_idx" ON "resources" ("department");

-- Resource detail page's like check (per-visitor, uncacheable): the unique
-- (user_id, resource_id) index serves lookups by user; this one serves the
-- per-resource count that the admin/resource pages read.
CREATE INDEX IF NOT EXISTS "likes_resource_id_idx" ON "likes" ("resource_id");
