-- One search column per table, so the per-token search is a single LIKE that
-- a trigram index can serve instead of an OR of ILIKEs over every searchable
-- column (properties.repository.ts, rentals.repository.ts).
--
-- The per-column trigram indexes from 0002 served only that old search, and
-- every insert and update kept them current. The plot-number one stays: the
-- plot_number filter is an ILIKE on that column alone. Dropped first, so the
-- table rewrite below does not rebuild them.
DROP INDEX IF EXISTS "idx_properties_owner_name_trgm";
DROP INDEX IF EXISTS "idx_properties_owner_phone_trgm";
DROP INDEX IF EXISTS "idx_properties_address_trgm";
DROP INDEX IF EXISTS "idx_properties_notes_trgm";
--> statement-breakpoint
-- search_text holds every value the search used to match, each lower-cased
-- with lower(), as ILIKE compares, and separated by a space: for properties
-- first the owner phone's digits (the search also matches a token's digits
-- against them alone, anchored at the start of the column), then the 28 text
-- columns and the three numbers as text. A search token never contains
-- whitespace (the search splits on it), so a token found in search_text was
-- found inside a single one of those values. Location names are the row's own
-- columns, so a stored generated column keeps search_text current on every
-- insert and update; it is not declared in schema.ts, so selects, backups and
-- restores leave it alone. Adding it rewrites both tables once.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "search_text" text GENERATED ALWAYS AS (
  regexp_replace(coalesce("owner_phone", ''), '[^0-9]', '', 'g')
  || ' ' || lower(coalesce("code", ''))
  || ' ' || lower(coalesce("name", ''))
  || ' ' || lower(coalesce("property_type", ''))
  || ' ' || lower(coalesce("legal_type", ''))
  || ' ' || lower(coalesce("pricing_method", ''))
  || ' ' || lower(coalesce("governorate", ''))
  || ' ' || lower(coalesce("governorate_text", ''))
  || ' ' || lower(coalesce("city", ''))
  || ' ' || lower(coalesce("district", ''))
  || ' ' || lower(coalesce("district_text", ''))
  || ' ' || lower(coalesce("neighborhood", ''))
  || ' ' || lower(coalesce("neighborhood_text", ''))
  || ' ' || lower(coalesce("address_details", ''))
  || ' ' || lower(coalesce("owner_name", ''))
  || ' ' || lower(coalesce("owner_phone", ''))
  || ' ' || lower(coalesce("owner_notes", ''))
  || ' ' || lower(coalesce("notes", ''))
  || ' ' || lower(coalesce("nazal", ''))
  || ' ' || lower(coalesce("plot_number", ''))
  || ' ' || lower(coalesce("plot_letter", ''))
  || ' ' || lower(coalesce("subdistrict_number", ''))
  || ' ' || lower(coalesce("subdistrict_name", ''))
  || ' ' || lower(coalesce("mahalla", ''))
  || ' ' || lower(coalesce("alley", ''))
  || ' ' || lower(coalesce("house_number", ''))
  || ' ' || lower(coalesce("nearest_landmark", ''))
  || ' ' || lower(coalesce("frontage", ''))
  || ' ' || lower(coalesce("street_width", ''))
  || ' ' || lower(coalesce("area_value"::text, ''))
  || ' ' || lower(coalesce("unit_price"::text, ''))
  || ' ' || lower(coalesce("total_price"::text, ''))
) STORED;
--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "search_text" text GENERATED ALWAYS AS (
  lower(coalesce("code", ''))
  || ' ' || lower(coalesce("name", ''))
  || ' ' || lower(coalesce("property_type", ''))
  || ' ' || lower(coalesce("rent_period", ''))
  || ' ' || lower(coalesce("area_unit", ''))
  || ' ' || lower(coalesce("governorate", ''))
  || ' ' || lower(coalesce("district", ''))
  || ' ' || lower(coalesce("neighborhood", ''))
  || ' ' || lower(coalesce("address_details", ''))
  || ' ' || lower(coalesce("owner_name", ''))
  || ' ' || lower(coalesce("owner_phone", ''))
  || ' ' || lower(coalesce("owner_notes", ''))
  || ' ' || lower(coalesce("other_details", ''))
  || ' ' || lower(coalesce("notes", ''))
  || ' ' || lower(coalesce("rent_price"::text, ''))
  || ' ' || lower(coalesce("area_value"::text, ''))
) STORED;
--> statement-breakpoint
-- Trigram indexes on search_text. Without pg_trgm (or the right to create it)
-- the search still works, scanning the table, and the skipped step is
-- reported as a notice, as in 0002.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS "idx_properties_search_text_trgm"
      ON "properties" USING gin ("search_text" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_rentals_search_text_trgm"
      ON "rentals" USING gin ("search_text" gin_trgm_ops);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'تعذّر تفعيل pg_trgm/فهارس عمود البحث (قد تكون الصلاحيات غير كافية): %', SQLERRM;
  END;
END $$;
