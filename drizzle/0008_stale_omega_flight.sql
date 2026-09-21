ALTER TABLE "resources" ADD COLUMN "upload_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "resources_upload_key_unique" ON "resources" USING btree ("upload_key");