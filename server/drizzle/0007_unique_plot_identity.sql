-- منع تكرار القطعة على مستوى قاعدة البيانات (طبقة أمان خلف فحص التطبيق).
-- الهوية = (المحافظة، المنطقة، الحي، رقم القطعة، حرف القطعة) بعد التطبيع:
--   btrim + توحيد المسافات الداخلية + توحيد NULL/'' (عبر coalesce) لحرف القطعة.
-- يُطبَّق فقط على العروض التي تملك رقم قطعة فعلياً.
-- آمن: لا يكسر الهجرة إن وُجدت تكرارات قديمة (يتجاوز الإنشاء مع تسجيل ملاحظة).
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
