BEGIN;

ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "paid_amount" numeric(18,2) NOT NULL DEFAULT 0;

-- The original snapshot table allowed one asset per contract. Keep all existing
-- rows, then replace that constraint with a per-source constraint.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'contract_asset_snapshots'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE "contract_asset_snapshots" DROP CONSTRAINT %I',
      item.conname
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "contract_asset_snapshots_source_key"
  ON "contract_asset_snapshots" ("contract_id", "source_type", "source_id");

INSERT INTO "document_types" (
  "key", "name", "transaction_scope", "is_required", "is_active"
) VALUES (
  'security_approval', 'موافقة أمنية', 'rent', true, true
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "transaction_scope" = EXCLUDED."transaction_scope",
  "is_required" = true,
  "is_active" = true;

COMMIT;
