-- Default document types. The pre-baseline migrations inserted these rows; the
-- consolidated schema-only baseline dropped them, leaving fresh installs with an
-- empty type list. Rows that already exist (including renamed or deactivated
-- ones) are left untouched.
INSERT INTO "document_types" ("key", "name", "transaction_scope", "is_required") VALUES
  ('national_id', 'البطاقة الوطنية', 'general', true),
  ('residence_card', 'بطاقة السكن', 'general', true),
  ('passport', 'جواز السفر', 'general', false),
  ('ownership_document', 'سند ملكية العقار', 'sale', true),
  ('authorization', 'مستند التفويض', 'general', false),
  ('other', 'مستند آخر', 'general', false)
ON CONFLICT ("key") DO NOTHING;
