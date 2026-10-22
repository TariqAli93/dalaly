-- Property indexes from the pre-baseline migrations 0007_unique_plot_identity
-- and 0008_search_trgm_indexes. The consolidated schema-only baseline dropped
-- them, so fresh installs lacked them while older databases kept them (IF NOT
-- EXISTS leaves those as they are). Each block catches its own failure: a
-- database that already holds duplicate plots, or may not create pg_trgm,
-- still starts, and the skipped step is reported as a notice.

-- Plot identity = (governorate, district, neighborhood, plot_number,
-- plot_letter) after trimming and collapsing inner whitespace, NULL equal to
-- ''. Only listings with a plot number take part. properties.repository.ts
-- checks the same expression first and maps a violation of this index (a race
-- past that check) to DuplicatePlotError.
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "uq_properties_plot_identity" ON "properties" (
      regexp_replace(btrim(coalesce("governorate", '')), '\s+', ' ', 'g'),
      regexp_replace(btrim(coalesce("district", '')), '\s+', ' ', 'g'),
      regexp_replace(btrim(coalesce("neighborhood", '')), '\s+', ' ', 'g'),
      regexp_replace(btrim(coalesce("plot_number", '')), '\s+', ' ', 'g'),
      regexp_replace(btrim(coalesce("plot_letter", '')), '\s+', ' ', 'g')
    )
    WHERE "plot_number" IS NOT NULL AND btrim("plot_number") <> '';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'تعذّر إنشاء uq_properties_plot_identity (قد توجد تكرارات حالية): %', SQLERRM;
  END;
END $$;
--> statement-breakpoint
-- Trigram indexes for the ILIKE '%…%' search on properties.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE INDEX IF NOT EXISTS "idx_properties_owner_name_trgm"
      ON "properties" USING gin ("owner_name" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_properties_owner_phone_trgm"
      ON "properties" USING gin ("owner_phone" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_properties_address_trgm"
      ON "properties" USING gin ("address_details" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_properties_notes_trgm"
      ON "properties" USING gin ("notes" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "idx_properties_plot_number_trgm"
      ON "properties" USING gin ("plot_number" gin_trgm_ops);
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'تعذّر تفعيل pg_trgm/فهارس البحث (قد تكون الصلاحيات غير كافية): %', SQLERRM;
  END;
END $$;
