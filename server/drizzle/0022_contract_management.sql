BEGIN;
ALTER TABLE contracts ADD COLUMN issued_at timestamptz, ADD COLUMN issued_by bigint REFERENCES users(id),
 ADD COLUMN cancelled_at timestamptz, ADD COLUMN cancelled_by bigint REFERENCES users(id),
 ADD COLUMN cancellation_reason text, ADD COLUMN cancellation_notes text;
ALTER TABLE legal_contract_templates ADD COLUMN is_system boolean NOT NULL DEFAULT false,
 ADD COLUMN deleted_at timestamptz, ADD COLUMN deleted_by bigint REFERENCES users(id);

SET LOCAL dalaly.restore='on';
UPDATE legal_contract_templates SET is_system=true WHERE created_by IS NULL;
-- Keep a single selected default for each contract type, preferring the general
-- office wording. Existing scope-specific wording and historical snapshots remain.
UPDATE legal_contract_templates SET is_default=false WHERE is_default AND id NOT IN (
 SELECT DISTINCT ON(contract_type) id FROM legal_contract_templates WHERE is_default
 ORDER BY contract_type,(property_type='all_properties') DESC,(jurisdiction='iq_federal') DESC,version DESC,id DESC
);
UPDATE contracts SET issued_at=coalesce(generated_at,updated_at) WHERE status<>'draft' AND generated_content IS NOT NULL;
SET LOCAL dalaly.restore='off';
DROP INDEX legal_active_scope;
CREATE INDEX legal_active_scope ON legal_contract_templates(contract_type,property_type,jurisdiction,transaction_kind) WHERE publication_status='active' AND deleted_at IS NULL;
CREATE UNIQUE INDEX legal_active_family ON legal_contract_templates(family_code) WHERE publication_status='active' AND deleted_at IS NULL;
CREATE UNIQUE INDEX legal_default_type ON legal_contract_templates(contract_type) WHERE is_default AND deleted_at IS NULL;
ALTER TABLE legal_contract_templates ADD CONSTRAINT legal_deleted_archived CHECK(deleted_at IS NULL OR (NOT is_default AND NOT is_system AND publication_status='archived'));

-- Approval is an authorized office action. Professional eligibility is no longer
-- a precondition. Revision wording and all issued snapshots stay immutable.
CREATE OR REPLACE FUNCTION protect_legal_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.approval_status<>'draft' OR NEW.approved_by IS NOT NULL OR NEW.publication_status<>'unpublished' OR NEW.is_default OR NEW.is_system OR NEW.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'New legal revisions must be custom unpublished drafts'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Legal revisions must be archived, not deleted'; END IF;
 IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Deleted legal revisions are immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['approval_status','approved_by','approved_at','updated_at','publication_status','is_default','target_at','priority','deleted_at','deleted_by'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['approval_status','approved_by','approved_at','updated_at','publication_status','is_default','target_at','priority','deleted_at','deleted_by']) THEN
  RAISE EXCEPTION 'Legal revisions are immutable; create a new revision'; END IF;
 IF NEW.deleted_at IS NOT NULL AND (OLD.is_system OR OLD.is_default OR NEW.deleted_by IS NULL) THEN
  RAISE EXCEPTION 'Protected or default legal templates cannot be deleted'; END IF;
 IF OLD.approval_status=NEW.approval_status THEN
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN RAISE EXCEPTION 'Approval evidence is immutable'; END IF;
 ELSE
  IF NOT ((OLD.approval_status='draft' AND NEW.approval_status IN ('pending','approved')) OR
   (OLD.approval_status='pending' AND NEW.approval_status IN ('approved','rejected'))) THEN RAISE EXCEPTION 'Invalid legal approval transition'; END IF;
  IF NEW.approval_status='approved' THEN
   IF legal_normalize(NEW.legal_basis)='' OR legal_normalize(NEW.applicability_notes)='' OR NEW.property_type='*' OR
    NOT EXISTS(SELECT 1 FROM legal_contract_clauses WHERE legal_template_id=NEW.id AND is_required) OR
    NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.approved_by AND is_active) THEN RAISE EXCEPTION 'Required wording and office approval are missing'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_issued_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.status<>'draft' THEN
  IF TG_OP='UPDATE' AND OLD.status IN ('active','completed','expired') AND NEW.status='cancelled' AND
   NEW.cancelled_at IS NOT NULL AND NEW.cancelled_by IS NOT NULL AND legal_normalize(NEW.cancellation_reason)<>'' AND
   (OLD.generated_content IS NOT NULL OR OLD.generated_html IS NOT NULL) AND
   (to_jsonb(NEW)-ARRAY['status','cancelled_at','cancelled_by','cancellation_reason','cancellation_notes','updated_at'])=
   (to_jsonb(OLD)-ARRAY['status','cancelled_at','cancelled_by','cancellation_reason','cancellation_notes','updated_at']) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Issued and cancelled contracts are immutable except documented cancellation';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Create a draft before issue'; END IF;
 IF NEW.status='cancelled' THEN RAISE EXCEPTION 'A draft cannot be cancelled as an issued contract'; END IF;
 IF NEW.status<>'draft' AND NOT EXISTS(
  SELECT 1 FROM contract_legal_snapshots s WHERE s.contract_id=NEW.id AND s.document_model->>'ready'='true'
   AND jsonb_array_length(s.legal_template_version)>0
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.legal_template_version) v LEFT JOIN legal_contract_templates t ON t.id=(v->>'id')::bigint
     WHERE t.id IS NULL OR t.approval_status<>'approved' OR t.publication_status<>'active' OR t.deleted_at IS NOT NULL)
 ) THEN RAISE EXCEPTION 'Active approved wording and complete snapshots required before issue'; END IF;
 RETURN NEW;
END $$;

INSERT INTO permissions(key,name,module) VALUES
 ('contracts.issue','إصدار العقود','contracts'),('contracts.cancel','إلغاء العقود','contracts'),
 ('contracts.print','طباعة العقود وتصديرها','contracts'),('legal_content.delete','حذف الصيغ القانونية المخصصة','legal_content') ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
 SELECT DISTINCT existing.role_id,p.id FROM role_permissions existing JOIN permissions base ON base.id=existing.permission_id
 CROSS JOIN permissions p WHERE (base.key='contracts.manage' AND p.key IN ('contracts.issue','contracts.cancel'))
 OR (base.key='contracts.read' AND p.key='contracts.print') OR (base.key='legal_content.manage' AND p.key='legal_content.delete') ON CONFLICT DO NOTHING;
COMMIT;
