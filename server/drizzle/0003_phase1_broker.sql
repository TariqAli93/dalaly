CREATE TABLE IF NOT EXISTS "governorates" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "governorates_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "districts" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "governorate_id" bigint NOT NULL REFERENCES "governorates"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "districts_governorate_name_unique" UNIQUE("governorate_id","name")
);

CREATE INDEX IF NOT EXISTS "idx_districts_governorate" ON "districts" ("governorate_id");

CREATE TABLE IF NOT EXISTS "property_images" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "property_id" bigint NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "file_path" text NOT NULL,
  "original_name" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_property_images_property" ON "property_images" ("property_id");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" bigint NOT NULL,
  "action" text NOT NULL,
  "old_value" jsonb,
  "new_value" jsonb,
  "user_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_logs" ("entity_type","entity_id");

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "governorate_id" bigint;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "district_id" bigint;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "governorate_text" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "district_text" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "plot_number" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "subdistrict_number" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "subdistrict_name" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "mahalla" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "alley" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "house_number" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "nearest_landmark" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "street_width" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "frontage" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "rooms_count" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "bathrooms_count" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "is_negotiable" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_properties_governorate_id" ON "properties" ("governorate_id");
CREATE INDEX IF NOT EXISTS "idx_properties_district_id" ON "properties" ("district_id");

DO $$ BEGIN
  ALTER TABLE "properties" ADD CONSTRAINT "properties_governorate_id_fk" FOREIGN KEY ("governorate_id") REFERENCES "governorates"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "properties" ADD CONSTRAINT "properties_district_id_fk" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
