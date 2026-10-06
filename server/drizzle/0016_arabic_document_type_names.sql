BEGIN;

UPDATE "document_types"
SET "name" = CASE "key"
  WHEN 'national_id' THEN 'البطاقة الوطنية'
  WHEN 'passport' THEN 'جواز السفر'
  WHEN 'ownership_document' THEN 'سند ملكية العقار'
  WHEN 'authorization' THEN 'مستند التفويض'
  WHEN 'other' THEN 'مستند آخر'
  WHEN 'residence_card' THEN 'بطاقة السكن'
  ELSE "name"
END
WHERE "key" IN (
  'national_id',
  'passport',
  'ownership_document',
  'authorization',
  'other',
  'residence_card'
);

COMMIT;
