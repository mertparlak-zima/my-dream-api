CREATE TYPE "public"."dictionary_entry_type" AS ENUM('category', 'symbol', 'theme');--> statement-breakpoint
CREATE TABLE "dictionary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "dictionary_entry_type" NOT NULL,
	"slug" varchar(80) NOT NULL,
	"icon" varchar(60) NOT NULL,
	"cat" varchar(80),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name_tr" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"tagline_tr" text,
	"tagline_en" text,
	"brief_tr" text,
	"brief_en" text,
	"kw_tr" text,
	"kw_en" text,
	"spiritual_tr" text,
	"spiritual_en" text,
	"psych_tr" text,
	"psych_en" text,
	"intuitive_tr" text,
	"intuitive_en" text,
	"related" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_entries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "interpreters" ADD COLUMN "rating" numeric(2, 1);--> statement-breakpoint
ALTER TABLE "interpreters" ADD COLUMN "reviews" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "interpreters" ADD COLUMN "styles" text[];--> statement-breakpoint
ALTER TABLE "interpreters" ADD COLUMN "story" text;--> statement-breakpoint
ALTER TABLE "interpreters" ADD COLUMN "samples" jsonb;--> statement-breakpoint
CREATE INDEX "dictionary_entries_type_sort_idx" ON "dictionary_entries" USING btree ("type","sort_order");--> statement-breakpoint
CREATE INDEX "dictionary_entries_cat_idx" ON "dictionary_entries" USING btree ("cat");