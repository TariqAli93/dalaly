CREATE TABLE IF NOT EXISTS "property_followups" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "property_id" bigint NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "user_id" bigint,
  "type" text NOT NULL,
  "notes" text,
  "scheduled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_followups_property" ON "property_followups" ("property_id");
CREATE INDEX IF NOT EXISTS "idx_followups_scheduled" ON "property_followups" ("scheduled_at");

CREATE TABLE IF NOT EXISTS "favorite_properties" (
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "property_id" bigint NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "favorite_properties_pk" PRIMARY KEY("user_id","property_id")
);

CREATE TABLE IF NOT EXISTS "backup_jobs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL,
  "file_path" text,
  "file_size" bigint,
  "duration_ms" integer,
  "error" text,
  "user_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "backup_logs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "job_id" bigint,
  "level" text DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
