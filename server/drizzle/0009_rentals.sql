CREATE TABLE IF NOT EXISTS "rentals" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "property_type" text NOT NULL,
  "rent_price" numeric(18, 2) NOT NULL,
  "rent_period" text NOT NULL,
  "area_value" numeric(14, 2) NOT NULL,
  "area_unit" text NOT NULL,
  "floors_count" integer,
  "rooms_count" integer,
  "bathrooms_count" integer,
  "amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "other_details" text,
  "governorate_id" bigint REFERENCES "governorates"("id") ON DELETE SET NULL,
  "district_id" bigint REFERENCES "districts"("id") ON DELETE SET NULL,
  "neighborhood_id" bigint REFERENCES "neighborhoods"("id") ON DELETE SET NULL,
  "governorate" text,
  "district" text,
  "neighborhood" text,
  "address_details" text,
  "owner_name" text NOT NULL,
  "owner_phone" text NOT NULL,
  "owner_notes" text,
  "status" text DEFAULT 'available' NOT NULL,
  "is_negotiable" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "idx_rentals_status" ON "rentals" ("status");
CREATE INDEX IF NOT EXISTS "idx_rentals_property_type" ON "rentals" ("property_type");
CREATE INDEX IF NOT EXISTS "idx_rentals_rent_period" ON "rentals" ("rent_period");
CREATE INDEX IF NOT EXISTS "idx_rentals_rent_price" ON "rentals" ("rent_price");
CREATE INDEX IF NOT EXISTS "idx_rentals_area" ON "rentals" ("area_value");
CREATE INDEX IF NOT EXISTS "idx_rentals_governorate" ON "rentals" ("governorate");
CREATE INDEX IF NOT EXISTS "idx_rentals_district" ON "rentals" ("district");
CREATE INDEX IF NOT EXISTS "idx_rentals_neighborhood" ON "rentals" ("neighborhood");
CREATE INDEX IF NOT EXISTS "idx_rentals_governorate_id" ON "rentals" ("governorate_id");
CREATE INDEX IF NOT EXISTS "idx_rentals_district_id" ON "rentals" ("district_id");
CREATE INDEX IF NOT EXISTS "idx_rentals_neighborhood_id" ON "rentals" ("neighborhood_id");
CREATE TABLE IF NOT EXISTS "rental_images" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "rental_id" bigint NOT NULL REFERENCES "rentals"("id") ON DELETE CASCADE,
  "file_path" text NOT NULL,
  "original_name" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_rental_images_rental" ON "rental_images" ("rental_id");
CREATE TABLE IF NOT EXISTS "rental_followups" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "rental_id" bigint NOT NULL REFERENCES "rentals"("id") ON DELETE CASCADE,
  "user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "type" text NOT NULL,
  "notes" text,
  "scheduled_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_rental_followups_rental" ON "rental_followups" ("rental_id");
CREATE INDEX IF NOT EXISTS "idx_rental_followups_scheduled" ON "rental_followups" ("scheduled_at");
CREATE TABLE IF NOT EXISTS "favorite_rentals" (
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rental_id" bigint NOT NULL REFERENCES "rentals"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "rental_id")
);