CREATE TABLE IF NOT EXISTS "neighborhoods" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "district_id" bigint NOT NULL REFERENCES "districts"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "neighborhoods_district_name_unique" UNIQUE("district_id","name")
);

CREATE INDEX IF NOT EXISTS "idx_neighborhoods_district" ON "neighborhoods" ("district_id");

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "property_number" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "plot_letter" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "neighborhood_id" bigint;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "neighborhood" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "neighborhood_text" text;

CREATE INDEX IF NOT EXISTS "idx_properties_neighborhood_id" ON "properties" ("neighborhood_id");

-- نقل آمن لبيانات حقل المدينة القديم إلى الحي (دون فقدان بيانات).
UPDATE "properties"
SET "neighborhood_text" = "city"
WHERE "city" IS NOT NULL
  AND "city" <> ''
  AND "neighborhood_text" IS NULL
  AND "neighborhood_id" IS NULL;
