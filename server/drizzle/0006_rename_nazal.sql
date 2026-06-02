-- النزال = عمق الأرض (يقترن بالواجهة)، وليس رقم العقار.
-- إعادة تسمية آمنة للعمود property_number إلى nazal على القواعد التي طبّقت 0005،
-- وضمان وجود العمود على القواعد الجديدة. لا فقدان بيانات.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'property_number'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'nazal'
  ) THEN
    ALTER TABLE "properties" RENAME COLUMN "property_number" TO "nazal";
  END IF;
END $$;

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "nazal" text;
