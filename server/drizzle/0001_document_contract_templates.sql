CREATE TABLE IF NOT EXISTS legal_formulations (
  id bigserial PRIMARY KEY,
  system_key text UNIQUE,
  source_legacy_id bigint UNIQUE,
  contract_type text NOT NULL CHECK (contract_type IN ('sale', 'rental', 'general')),
  title text NOT NULL,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_default boolean NOT NULL DEFAULT false,
  legacy_metadata jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS legal_formulation_default_type ON legal_formulations(contract_type) WHERE is_default AND deleted_at IS NULL;
--> statement-breakpoint
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS docx_file_path text;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS docx_file_name text;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS docx_hash text;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS docx_variables jsonb NOT NULL DEFAULT '[]';
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS docx_template_default_type ON contract_templates(contract_type) WHERE is_default AND docx_file_path IS NOT NULL AND is_active;
--> statement-breakpoint
ALTER TABLE contract_legal_snapshots ADD COLUMN IF NOT EXISTS docx_data text;
ALTER TABLE contract_legal_snapshots ADD COLUMN IF NOT EXISTS docx_hash text;
ALTER TABLE contract_legal_snapshots ADD COLUMN IF NOT EXISTS document_template_snapshot jsonb;
ALTER TABLE contract_legal_snapshots ADD COLUMN IF NOT EXISTS formulation_snapshot jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS formulation_override text;
--> statement-breakpoint
-- Copy every revision, including archived wording. Keep original tables, event
-- history, conditional clauses and all issued-contract references intact.
INSERT INTO legal_formulations(source_legacy_id, contract_type, title, content, version, legacy_metadata, deleted_at, created_at, updated_at)
SELECT t.id, CASE WHEN t.contract_type = 'rental' THEN 'rental' ELSE 'sale' END,
       t.title || CASE WHEN t.version > 1 THEN ' · إصدار ' || t.version::text ELSE '' END,
       COALESCE(NULLIF(string_agg(c.clause_title || E'\n' || c.clause_content_ar, E'\n\n' ORDER BY c.clause_order, c.id), ''), t.legal_basis, ''),
       t.version,
       jsonb_build_object('template', to_jsonb(t), 'clauses', COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.clause_order, c.id) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb)),
       t.deleted_at, t.created_at, t.updated_at
FROM legal_contract_templates t LEFT JOIN legal_contract_clauses c ON c.legal_template_id = t.id
GROUP BY t.id
ON CONFLICT (source_legacy_id) DO NOTHING;
--> statement-breakpoint
-- Preserve an explicit active user default. Unselected migrated revisions stay
-- available for editing; system defaults are added by the idempotent seeder.
WITH chosen AS (
 SELECT DISTINCT ON (t.contract_type) f.id FROM legal_formulations f
 JOIN legal_contract_templates t ON t.id = f.source_legacy_id
 WHERE t.is_default AND t.publication_status = 'active' AND t.deleted_at IS NULL
   AND t.property_type IN ('all_properties', '*')
   AND NOT EXISTS (SELECT 1 FROM legal_contract_clauses c WHERE c.legal_template_id = t.id AND (NOT c.is_required OR jsonb_array_length(COALESCE(c.conditions_json->'all', '[]'::jsonb)) > 0))
 ORDER BY t.contract_type, t.is_system, t.version DESC, t.id DESC
)
UPDATE legal_formulations SET is_default = true WHERE id IN (SELECT id FROM chosen)
 AND NOT EXISTS (SELECT 1 FROM legal_formulations other WHERE other.contract_type = legal_formulations.contract_type AND other.is_default);
--> statement-breakpoint
-- Keep database-level immutability, including on installations created from
-- the consolidated schema. Restores use the existing transactional restore flag.
CREATE OR REPLACE FUNCTION protect_issued_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.status<>'draft' THEN
  IF TG_OP='UPDATE' AND OLD.status IN ('active','completed','expired') AND NEW.status='cancelled'
   AND NEW.cancelled_at IS NOT NULL AND NEW.cancelled_by IS NOT NULL AND btrim(NEW.cancellation_reason)<>''
   AND (OLD.generated_content IS NOT NULL OR OLD.generated_html IS NOT NULL)
   AND (to_jsonb(NEW)-ARRAY['status','cancelled_at','cancelled_by','cancellation_reason','cancellation_notes','updated_at'])=
       (to_jsonb(OLD)-ARRAY['status','cancelled_at','cancelled_by','cancellation_reason','cancellation_notes','updated_at']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Issued and cancelled contracts are immutable except documented cancellation';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Create a draft before issue'; END IF;
 IF NEW.status='cancelled' THEN RAISE EXCEPTION 'A draft cannot be cancelled as an issued contract'; END IF;
 IF NEW.status<>'draft' AND NOT EXISTS (
  SELECT 1 FROM contract_legal_snapshots s WHERE s.contract_id=NEW.id AND s.document_model->>'ready'='true'
   AND ((s.docx_data IS NOT NULL AND s.docx_hash IS NOT NULL AND s.formulation_snapshot IS NOT NULL AND s.document_template_snapshot IS NOT NULL)
     OR (s.docx_data IS NULL AND jsonb_array_length(s.legal_template_version)>0
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.legal_template_version) v LEFT JOIN legal_contract_templates t ON t.id=(v->>'id')::bigint WHERE t.id IS NULL OR t.approval_status<>'approved' OR t.publication_status<>'active' OR t.deleted_at IS NOT NULL)))
 ) THEN RAISE EXCEPTION 'Complete immutable document snapshots required before issue'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS issued_contract_guard ON contracts;
CREATE TRIGGER issued_contract_guard BEFORE INSERT OR UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION protect_issued_contract();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_issued_contract_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid bigint;
BEGIN
 IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 cid := CASE WHEN TG_OP='DELETE' THEN OLD.contract_id ELSE NEW.contract_id END;
 IF EXISTS(SELECT 1 FROM contracts WHERE (id=cid OR (TG_OP='UPDATE' AND id=OLD.contract_id)) AND status<>'draft') THEN RAISE EXCEPTION 'Issued contract snapshots are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['contract_legal_snapshots','contract_office_snapshots','contract_asset_snapshots','contract_attachments','contract_parties'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS document_snapshot_guard ON %I',t);
  EXECUTE format('CREATE TRIGGER document_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_issued_contract_snapshot()',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_issued_party_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM contracts c JOIN contract_parties p ON p.contract_id=c.id WHERE c.status<>'draft' AND p.id IN (
  CASE WHEN TG_OP='INSERT' THEN NEW.contract_party_id ELSE OLD.contract_party_id END,
  CASE WHEN TG_OP='DELETE' THEN OLD.contract_party_id ELSE NEW.contract_party_id END)) THEN RAISE EXCEPTION 'Issued party snapshots are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS issued_party_snapshot_guard ON party_snapshots;
CREATE TRIGGER issued_party_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON party_snapshots FOR EACH ROW EXECUTE FUNCTION protect_issued_party_snapshot();
