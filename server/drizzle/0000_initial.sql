CREATE TABLE IF NOT EXISTS "users" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "username" text NOT NULL,
  "pin_hash" text NOT NULL,
  "role" text DEFAULT 'administrator' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_username_unique" UNIQUE("username")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" bigint NOT NULL,
  "token_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);

CREATE TABLE IF NOT EXISTS "properties" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "property_type" text NOT NULL,
  "legal_type" text NOT NULL,
  "area_value" numeric(14, 2) NOT NULL,
  "area_unit" text NOT NULL,
  "pricing_method" text NOT NULL,
  "unit_price" numeric(18, 2),
  "total_price" numeric(18, 2) NOT NULL,
  "governorate" text,
  "city" text,
  "district" text,
  "address_details" text,
  "owner_name" text NOT NULL,
  "owner_phone" text NOT NULL,
  "owner_notes" text,
  "status" text DEFAULT 'available' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "properties_code_unique" UNIQUE("code")
);

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "idx_sessions_token_hash" ON "sessions" USING btree ("token_hash");
CREATE INDEX IF NOT EXISTS "idx_properties_status" ON "properties" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_properties_type" ON "properties" USING btree ("property_type");
CREATE INDEX IF NOT EXISTS "idx_properties_legal_type" ON "properties" USING btree ("legal_type");
CREATE INDEX IF NOT EXISTS "idx_properties_area_unit" ON "properties" USING btree ("area_unit");
CREATE INDEX IF NOT EXISTS "idx_properties_pricing_method" ON "properties" USING btree ("pricing_method");
CREATE INDEX IF NOT EXISTS "idx_properties_district" ON "properties" USING btree ("district");
