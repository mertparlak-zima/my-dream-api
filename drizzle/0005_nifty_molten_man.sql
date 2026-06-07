CREATE TYPE "public"."app_update_tag" AS ENUM('new_interpreter', 'new_feature', 'improvement');--> statement-breakpoint
CREATE TABLE "app_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"tag" "app_update_tag" NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"title_tr" varchar(200) NOT NULL,
	"title_en" varchar(200),
	"blurb_tr" text,
	"blurb_en" text,
	"media_tr" text,
	"media_en" text,
	"body_tr" text[],
	"body_en" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_updates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "app_updates_published_idx" ON "app_updates" USING btree ("is_active","published_at");