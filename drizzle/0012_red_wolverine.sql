-- Add resource_type_configs table for admin-managed resource type definitions.
CREATE TABLE "resource_type_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"fieldLabel" text DEFAULT 'Professor' NOT NULL,
	"color" text DEFAULT 'bg-gray-100 text-gray-800' NOT NULL,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resource_type_configs_value_unique" UNIQUE("value")
);
--> statement-breakpoint

-- Add author column to resources (for book-type resources).
ALTER TABLE "resources" ADD COLUMN "author" text;
