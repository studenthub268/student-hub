-- Aggregate Core Web Vitals storage (see /api/vitals): one row per
-- (path, day, metric). count/sum give the average; poor_count tracks how
-- many samples exceeded Google's "poor" threshold so the admin tab can show
-- a real-world pass rate, not just a mean.
CREATE TABLE "web_vitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"day" text NOT NULL,
	"metric" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"sum" double precision DEFAULT 0 NOT NULL,
	"poor_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "web_vitals_path_day_metric_unique" ON "web_vitals" USING btree ("path","day","metric");
