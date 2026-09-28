BEGIN;

-- Rename the shared CRM entity without changing its ids, so existing requests,
-- offers, documents, and contracts keep their references.
ALTER TABLE "customers" RENAME TO "people";
ALTER TABLE "people" RENAME COLUMN "customer_type" TO "person_type";
ALTER INDEX IF EXISTS "idx_customers_full_name" RENAME TO "idx_people_full_name";
ALTER INDEX IF EXISTS "idx_customers_phone_primary" RENAME TO "idx_people_phone_primary";
ALTER INDEX IF EXISTS "idx_customers_customer_type" RENAME TO "idx_people_person_type";
ALTER INDEX IF EXISTS "idx_customers_status" RENAME TO "idx_people_status";

ALTER TABLE "properties" RENAME COLUMN "owner_customer_id" TO "owner_person_id";
ALTER TABLE "rentals" RENAME COLUMN "owner_customer_id" TO "owner_person_id";
ALTER TABLE "rental_requests" RENAME COLUMN "customer_id" TO "person_id";
ALTER TABLE "purchase_requests" RENAME COLUMN "customer_id" TO "person_id";
ALTER INDEX IF EXISTS "idx_rental_requests_customer" RENAME TO "idx_rental_requests_person";
ALTER INDEX IF EXISTS "idx_purchase_requests_customer" RENAME TO "idx_purchase_requests_person";

ALTER TABLE "documents" RENAME TO "identity_documents";
ALTER TABLE "identity_documents" RENAME COLUMN "customer_id" TO "person_id";
ALTER INDEX IF EXISTS "idx_documents_customer" RENAME TO "idx_identity_documents_person";
ALTER INDEX IF EXISTS "idx_documents_type" RENAME TO "idx_identity_documents_type";
ALTER INDEX IF EXISTS "idx_documents_status" RENAME TO "idx_identity_documents_status";
ALTER INDEX IF EXISTS "idx_documents_expires_at" RENAME TO "idx_identity_documents_expires_at";
ALTER TABLE "identity_documents" ADD COLUMN IF NOT EXISTS "document_number" text;

ALTER TABLE "company_settings" RENAME TO "office_profiles";
ALTER TABLE "office_profiles" ADD COLUMN IF NOT EXISTS "license_number" text;

-- Normalize the old contract vocabulary before removing the old customer
-- shortcut. Existing rows remain valid historical records.
ALTER TABLE "contract_templates"
  DROP CONSTRAINT IF EXISTS "contract_templates_contract_type_key";
UPDATE "contract_templates" SET "contract_type" = 'sale' WHERE "contract_type" = 'purchase';
UPDATE "contract_templates" SET "contract_type" = 'rental' WHERE "contract_type" = 'lease';
UPDATE "contracts" SET "contract_type" = 'sale' WHERE "contract_type" = 'purchase';
UPDATE "contracts" SET "contract_type" = 'rental' WHERE "contract_type" IN ('lease', 'rental');

ALTER TABLE "contract_parties" RENAME COLUMN "customer_id" TO "person_id";
ALTER TABLE "contract_parties" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "contract_parties" DROP CONSTRAINT IF EXISTS "contract_parties_pkey";
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id");
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contract_role_key"
  UNIQUE ("contract_id", "role");
ALTER TABLE "contract_parties" DROP CONSTRAINT IF EXISTS "contract_parties_customer_id_customers_id_fk";
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_person_id_people_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT;
ALTER TABLE "contract_parties" DROP CONSTRAINT IF EXISTS "contract_parties_contract_id_contracts_id_fk";
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contract_id_contracts_id_fk"
  FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE;
UPDATE "contract_parties" SET "role" = 'lessor' WHERE "role" = 'landlord';
UPDATE "contract_parties" SET "role" = 'lessee' WHERE "role" = 'tenant';

ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_primary_customer_id_customers_id_fk";
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "primary_customer_id";

CREATE TABLE IF NOT EXISTS "party_snapshots" (
  "id" bigserial PRIMARY KEY,
  "contract_party_id" bigint NOT NULL UNIQUE REFERENCES "contract_parties"("id") ON DELETE CASCADE,
  "full_name" text NOT NULL,
  "identity_number" text,
  "phone_primary" text,
  "phone_secondary" text,
  "email" text,
  "address" text,
  "notes" text,
  "captured_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contract_office_snapshots" (
  "id" bigserial PRIMARY KEY,
  "contract_id" bigint NOT NULL UNIQUE REFERENCES "contracts"("id") ON DELETE CASCADE,
  "office_name" text NOT NULL,
  "logo_file_path" text,
  "address" text,
  "phone_primary" text,
  "phone_secondary" text,
  "email" text,
  "license_number" text,
  "additional_contact" text,
  "captured_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contract_asset_snapshots" (
  "id" bigserial PRIMARY KEY,
  "contract_id" bigint NOT NULL UNIQUE REFERENCES "contracts"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" bigint NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "captured_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contract_attachments" (
  "id" bigserial PRIMARY KEY,
  "contract_id" bigint NOT NULL REFERENCES "contracts"("id") ON DELETE CASCADE,
  "contract_party_id" bigint NOT NULL REFERENCES "contract_parties"("id") ON DELETE CASCADE,
  "identity_document_id" bigint NOT NULL REFERENCES "identity_documents"("id") ON DELETE RESTRICT,
  "document_type" text,
  "document_name" text NOT NULL,
  "document_number" text,
  "file_path" text NOT NULL,
  "file_type" text NOT NULL,
  "file_size" bigint,
  "captured_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("contract_party_id", "identity_document_id")
);

INSERT INTO "party_snapshots" (
  "contract_party_id", "full_name", "identity_number", "phone_primary",
  "phone_secondary", "email", "address", "notes"
)
SELECT cp."id", p."full_name", p."national_id", p."phone_primary",
       p."phone_secondary", p."email", p."address", p."notes"
FROM "contract_parties" cp
JOIN "people" p ON p."id" = cp."person_id"
ON CONFLICT ("contract_party_id") DO NOTHING;

INSERT INTO "contract_office_snapshots" (
  "contract_id", "office_name", "logo_file_path", "address", "phone_primary",
  "phone_secondary", "email", "additional_contact", "license_number"
)
SELECT c."id", o."company_name", o."logo_file_path", o."address", o."phone_primary",
       o."phone_secondary", o."email", o."additional_contact", o."license_number"
FROM "contracts" c
LEFT JOIN "office_profiles" o ON o."id" = 1
ON CONFLICT ("contract_id") DO NOTHING;

INSERT INTO "contract_asset_snapshots" ("contract_id", "source_type", "source_id", "data")
SELECT c."id", 'property', p."id", to_jsonb(p)
FROM "contracts" c
JOIN "properties" p ON p."id" = c."property_id"
WHERE c."property_id" IS NOT NULL
ON CONFLICT ("contract_id") DO NOTHING;

INSERT INTO "contract_asset_snapshots" ("contract_id", "source_type", "source_id", "data")
SELECT c."id", 'rental', r."id", to_jsonb(r)
FROM "contracts" c
JOIN "rentals" r ON r."id" = c."rental_id"
WHERE c."rental_id" IS NOT NULL
ON CONFLICT ("contract_id") DO NOTHING;

INSERT INTO "contract_attachments" (
  "contract_id", "contract_party_id", "identity_document_id", "document_type",
  "document_name", "document_number", "file_path", "file_type", "file_size"
)
SELECT cp."contract_id", cp."id", d."id", dt."name", d."document_name",
       d."document_number", d."file_path", d."file_type", d."file_size"
FROM "contract_parties" cp
JOIN "identity_documents" d ON d."person_id" = cp."person_id" AND d."status" = 'active'
LEFT JOIN "document_types" dt ON dt."id" = d."document_type_id"
ON CONFLICT ("contract_party_id", "identity_document_id") DO NOTHING;

-- The application may already have seeded the new permission names before
-- this migration runs. Merge role links first, then remove the duplicate old
-- permission rows without losing access.
UPDATE "role_permissions" rp
SET "permission_id" = newp."id"
FROM "permissions" oldp, "permissions" newp
WHERE rp."permission_id" = oldp."id"
  AND ((oldp."key" = 'customers.read' AND newp."key" = 'people.read')
    OR (oldp."key" = 'customers.create' AND newp."key" = 'people.create')
    OR (oldp."key" = 'customers.update' AND newp."key" = 'people.update'))
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" existing
    WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = newp."id"
  );
DELETE FROM "role_permissions" rp
USING "permissions" oldp, "permissions" newp
WHERE rp."permission_id" = oldp."id"
  AND ((oldp."key" = 'customers.read' AND newp."key" = 'people.read')
    OR (oldp."key" = 'customers.create' AND newp."key" = 'people.create')
    OR (oldp."key" = 'customers.update' AND newp."key" = 'people.update'));
DELETE FROM "permissions" oldp
USING "permissions" newp
WHERE ((oldp."key" = 'customers.read' AND newp."key" = 'people.read')
    OR (oldp."key" = 'customers.create' AND newp."key" = 'people.create')
    OR (oldp."key" = 'customers.update' AND newp."key" = 'people.update'));
UPDATE "permissions" SET "key" = 'people.read', "module" = 'people' WHERE "key" = 'customers.read';
UPDATE "permissions" SET "key" = 'people.create', "module" = 'people' WHERE "key" = 'customers.create';
UPDATE "permissions" SET "key" = 'people.update', "module" = 'people' WHERE "key" = 'customers.update';

COMMIT;
