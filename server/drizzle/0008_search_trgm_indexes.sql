-- تسريع البحث الشامل (ilike '%...%') عبر فهارس trigram من امتداد pg_trgm.
-- آمن: إن لم تتوفّر صلاحية إنشاء الامتداد أو الفهارس، يُتجاوز دون كسر الهجرة.
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
