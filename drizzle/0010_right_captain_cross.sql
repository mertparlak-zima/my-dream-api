ALTER TABLE "dictionary_entries" ADD COLUMN "color" varchar(9);--> statement-breakpoint
-- Backfill display accent colors (#68) for the category + theme reference rows
-- seeded in 0004. Symbols inherit their category color client-side (stay null).
UPDATE "dictionary_entries" AS d SET "color" = v.color
FROM (VALUES
  ('su', '#386A65'),
  ('hayvan', '#C99A5E'),
  ('insan', '#234E83'),
  ('yer', '#A94E2D'),
  ('gok', '#C2902F'),
  ('esya', '#2D5450'),
  ('kabuslar', '#A94E2D'),
  ('kayip-dis', '#234E83'),
  ('ucmak', '#386A65'),
  ('dusmek', '#C99A5E'),
  ('kovalanmak', '#356A9E'),
  ('sinav', '#2D5450')
) AS v(slug, color)
WHERE d.slug = v.slug;
