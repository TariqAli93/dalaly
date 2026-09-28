BEGIN;

INSERT INTO "document_types" ("key", "name", "transaction_scope", "is_required") VALUES
  ('residence_card', 'بطاقة السكن', 'general', true)
ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "is_required" = true, "is_active" = true;

UPDATE "contract_templates"
SET "body" = $$بسم الله الرحمن الرحيم

عقد بيع عقار

البائع: {{seller.full_name}}
رقم الهوية: {{seller.identity_number}}
الهاتف: {{seller.phone}}

المشتري: {{buyer.full_name}}
رقم الهوية: {{buyer.identity_number}}
الهاتف: {{buyer.phone}}

العقار: {{property.name}}
العنوان: {{property.address}}
المساحة: {{property.area}}
المبلغ: {{contract.amount}}
تاريخ العقد: {{contract.date}}

معلومات المكتب: {{office.name}}
العنوان: {{office.address}}
الهاتف: {{office.phone}}
رقم الإجازة: {{office.license_number}}

{{contract.notes}}$$
WHERE "contract_type" = 'sale';

UPDATE "contract_templates"
SET "body" = $$بسم الله الرحمن الرحيم

عقد إيجار عقار

المؤجر: {{lessor.full_name}}
رقم الهوية: {{lessor.identity_number}}
الهاتف: {{lessor.phone}}

المستأجر: {{lessee.full_name}}
رقم الهوية: {{lessee.identity_number}}
الهاتف: {{lessee.phone}}

العقار: {{property.name}}
العنوان: {{property.address}}
الأجرة: {{contract.amount}}
من: {{contract.start_date}}
إلى: {{contract.end_date}}

معلومات المكتب: {{office.name}}
العنوان: {{office.address}}
الهاتف: {{office.phone}}
رقم الإجازة: {{office.license_number}}

{{contract.notes}}$$
WHERE "contract_type" = 'rental';

COMMIT;
