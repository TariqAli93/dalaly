CREATE TABLE IF NOT EXISTS "customers" (
  "id" bigserial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "full_name" text NOT NULL,
  "phone_primary" text NOT NULL,
  "phone_secondary" text,
  "email" text,
  "address" text,
  "national_id" text,
  "customer_type" text NOT NULL DEFAULT 'individual',
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_customers_full_name" ON "customers" ("full_name");
CREATE INDEX IF NOT EXISTS "idx_customers_phone_primary" ON "customers" ("phone_primary");
CREATE INDEX IF NOT EXISTS "idx_customers_customer_type" ON "customers" ("customer_type");
CREATE INDEX IF NOT EXISTS "idx_customers_status" ON "customers" ("status");

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "owner_customer_id" bigint REFERENCES "customers"("id") ON DELETE SET NULL;

ALTER TABLE "rentals"
  ADD COLUMN IF NOT EXISTS "owner_customer_id" bigint REFERENCES "customers"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "rental_requests" (
  "id" bigserial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "customer_id" bigint NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "property_type" text NOT NULL,
  "rent_period" text,
  "budget_min" numeric(18,2),
  "budget_max" numeric(18,2),
  "area_unit" text,
  "area_min" numeric(14,2),
  "area_max" numeric(14,2),
  "floors_count" integer,
  "rooms_count" integer,
  "bathrooms_count" integer,
  "governorate_id" bigint REFERENCES "governorates"("id") ON DELETE SET NULL,
  "district_id" bigint REFERENCES "districts"("id") ON DELETE SET NULL,
  "neighborhood_id" bigint REFERENCES "neighborhoods"("id") ON DELETE SET NULL,
  "governorate" text,
  "district" text,
  "neighborhood" text,
  "amenities" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "other_requirements" text,
  "status" text NOT NULL DEFAULT 'open',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_rental_requests_customer" ON "rental_requests" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_rental_requests_property_type" ON "rental_requests" ("property_type");
CREATE INDEX IF NOT EXISTS "idx_rental_requests_rent_period" ON "rental_requests" ("rent_period");
CREATE INDEX IF NOT EXISTS "idx_rental_requests_budget" ON "rental_requests" ("budget_max");
CREATE INDEX IF NOT EXISTS "idx_rental_requests_governorate" ON "rental_requests" ("governorate_id");
CREATE INDEX IF NOT EXISTS "idx_rental_requests_district" ON "rental_requests" ("district_id");
CREATE INDEX IF NOT EXISTS "idx_rental_requests_neighborhood" ON "rental_requests" ("neighborhood_id");
CREATE INDEX IF NOT EXISTS "idx_rental_requests_status" ON "rental_requests" ("status");

CREATE TABLE IF NOT EXISTS "purchase_requests" (
  "id" bigserial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "customer_id" bigint NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "property_type" text NOT NULL,
  "budget_min" numeric(18,2),
  "budget_max" numeric(18,2),
  "area_unit" text,
  "area_min" numeric(14,2),
  "area_max" numeric(14,2),
  "rooms_count" integer,
  "bathrooms_count" integer,
  "floors_count" integer,
  "governorate_id" bigint REFERENCES "governorates"("id") ON DELETE SET NULL,
  "district_id" bigint REFERENCES "districts"("id") ON DELETE SET NULL,
  "neighborhood_id" bigint REFERENCES "neighborhoods"("id") ON DELETE SET NULL,
  "governorate" text,
  "district" text,
  "neighborhood" text,
  "amenities" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "other_requirements" text,
  "status" text NOT NULL DEFAULT 'open',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_purchase_requests_customer" ON "purchase_requests" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_property_type" ON "purchase_requests" ("property_type");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_budget" ON "purchase_requests" ("budget_max");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_governorate" ON "purchase_requests" ("governorate_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_district" ON "purchase_requests" ("district_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_neighborhood" ON "purchase_requests" ("neighborhood_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_status" ON "purchase_requests" ("status");

CREATE TABLE IF NOT EXISTS "document_types" (
  "id" bigserial PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "transaction_scope" text NOT NULL DEFAULT 'general',
  "is_required" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_document_types_scope" ON "document_types" ("transaction_scope");
CREATE INDEX IF NOT EXISTS "idx_document_types_active" ON "document_types" ("is_active");

CREATE TABLE IF NOT EXISTS "documents" (
  "id" bigserial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "customer_id" bigint NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "document_type_id" bigint REFERENCES "document_types"("id") ON DELETE SET NULL,
  "document_name" text NOT NULL,
  "file_path" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size" bigint,
  "uploaded_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_documents_customer" ON "documents" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_documents_type" ON "documents" ("document_type_id");
CREATE INDEX IF NOT EXISTS "idx_documents_status" ON "documents" ("status");
CREATE INDEX IF NOT EXISTS "idx_documents_expires_at" ON "documents" ("expires_at");

CREATE TABLE IF NOT EXISTS "company_settings" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "company_name" text NOT NULL DEFAULT '',
  "phone_primary" text,
  "phone_secondary" text,
  "email" text,
  "address" text,
  "additional_contact" text,
  "logo_file_path" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contract_templates" (
  "id" bigserial PRIMARY KEY,
  "contract_type" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "body" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contracts" (
  "id" bigserial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "contract_type" text NOT NULL,
  "primary_customer_id" bigint REFERENCES "customers"("id") ON DELETE SET NULL,
  "property_id" bigint REFERENCES "properties"("id") ON DELETE SET NULL,
  "rental_id" bigint REFERENCES "rentals"("id") ON DELETE SET NULL,
  "template_id" bigint REFERENCES "contract_templates"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "contract_date" timestamptz NOT NULL DEFAULT now(),
  "start_date" timestamptz,
  "end_date" timestamptz,
  "amount" numeric(18,2),
  "payment_info" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  "generated_content" text,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_contracts_type" ON "contracts" ("contract_type");
CREATE INDEX IF NOT EXISTS "idx_contracts_primary_customer" ON "contracts" ("primary_customer_id");
CREATE INDEX IF NOT EXISTS "idx_contracts_property" ON "contracts" ("property_id");
CREATE INDEX IF NOT EXISTS "idx_contracts_rental" ON "contracts" ("rental_id");
CREATE INDEX IF NOT EXISTS "idx_contracts_status" ON "contracts" ("status");
CREATE INDEX IF NOT EXISTS "idx_contracts_dates" ON "contracts" ("contract_date", "end_date");

CREATE TABLE IF NOT EXISTS "contract_parties" (
  "contract_id" bigint NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "customer_id" bigint NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "role" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("contract_id", "customer_id", "role")
);

CREATE INDEX IF NOT EXISTS "idx_contract_parties_customer" ON "contract_parties" ("customer_id");

INSERT INTO "document_types" ("key", "name", "transaction_scope", "is_required") VALUES
  ('national_id', 'National ID', 'general', true),
  ('passport', 'Passport', 'general', false),
  ('ownership_document', 'Property ownership document', 'sale', true),
  ('authorization', 'Authorization document', 'general', false),
  ('other', 'Other document', 'general', false)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "contract_templates" ("contract_type", "name", "body") VALUES
  ('sale', 'Sale Contract', $$بسم الله الرحمن الرحيم

عقد بيع

البائع: {{seller_name}}
المشتري: {{buyer_name}}
العقار: {{property_address}}
المبلغ: {{contract_amount}}
تاريخ العقد: {{contract_date}}

{{notes}}$$),
  ('purchase', 'Purchase Contract', $$بسم الله الرحمن الرحيم

عقد شراء

البائع: {{seller_name}}
المشتري: {{buyer_name}}
العقار: {{property_address}}
المبلغ: {{contract_amount}}
تاريخ العقد: {{contract_date}}

{{notes}}$$),
  ('rental', 'Rental Contract', $$بسم الله الرحمن الرحيم

عقد إيجار

المؤجر: {{landlord_name}}
المستأجر: {{tenant_name}}
العقار: {{property_address}}
الأجرة: {{contract_amount}}
من: {{start_date}}
إلى: {{end_date}}

{{notes}}$$),
  ('lease', 'Lease Contract', $$بسم الله الرحمن الرحيم

عقد تأجير

المؤجر: {{landlord_name}}
المستأجر: {{tenant_name}}
العقار: {{property_address}}
الأجرة: {{contract_amount}}
من: {{start_date}}
إلى: {{end_date}}

{{notes}}$$)
ON CONFLICT ("contract_type") DO NOTHING;

INSERT INTO "company_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
