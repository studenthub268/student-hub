CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"day" text NOT NULL,
	"referrer" text,
	"views" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_path_day_referrer_unique" ON "page_views" USING btree ("path","day","referrer");