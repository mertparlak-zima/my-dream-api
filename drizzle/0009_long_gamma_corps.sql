ALTER TABLE "interpreters" ADD COLUMN "tag" varchar(80);--> statement-breakpoint
ALTER TABLE "interpreters" ADD COLUMN "accent_color" varchar(9);--> statement-breakpoint
-- Backfill per-interpreter presentation data (#67) for the reference rows seeded
-- in 0004_reference_data.sql, then enforce NOT NULL.
UPDATE "interpreters" SET "tag" = 'Psikolojik bakış', "accent_color" = '#234E83' WHERE "id" = '20000000-0000-4000-8000-000000000001';--> statement-breakpoint
UPDATE "interpreters" SET "tag" = 'Geleneksel & manevi', "accent_color" = '#386A65' WHERE "id" = '20000000-0000-4000-8000-000000000002';--> statement-breakpoint
UPDATE "interpreters" SET "tag" = 'Astrolojik', "accent_color" = '#356A9E' WHERE "id" = '20000000-0000-4000-8000-000000000003';--> statement-breakpoint
ALTER TABLE "interpreters" ALTER COLUMN "tag" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "interpreters" ALTER COLUMN "accent_color" SET NOT NULL;
