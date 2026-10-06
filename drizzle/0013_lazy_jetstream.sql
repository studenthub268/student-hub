-- Add thumbnail column to resources for caching first-page preview.
ALTER TABLE "resources" ADD COLUMN "thumbnail" text;
