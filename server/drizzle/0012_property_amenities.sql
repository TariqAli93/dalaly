ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "amenities" jsonb DEFAULT '{}'::jsonb NOT NULL;
