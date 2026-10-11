BEGIN;
ALTER TABLE legal_contract_templates
 ADD COLUMN parent_id bigint REFERENCES legal_contract_templates(id) DEFERRABLE INITIALLY DEFERRED,
 ADD COLUMN based_on_id bigint REFERENCES legal_contract_templates(id) DEFERRABLE INITIALLY DEFERRED,
 ADD COLUMN change_kind text NOT NULL DEFAULT 'new_legal' CHECK(change_kind IN ('new_legal','administrative','substantive')),
 ADD COLUMN review_required boolean NOT NULL DEFAULT true,
 ADD COLUMN publication_status text NOT NULL DEFAULT 'unpublished' CHECK(publication_status IN ('unpublished','active','archived')),
 ADD COLUMN is_default boolean NOT NULL DEFAULT false,
 ADD COLUMN target_at timestamptz,
 ADD COLUMN priority integer NOT NULL DEFAULT 1 CHECK(priority BETWEEN 0 AND 2);
ALTER TABLE legal_contract_clauses ADD COLUMN source_clause_id bigint REFERENCES legal_contract_clauses(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE legal_content_events ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE TABLE legal_task_notifications (
 id bigserial PRIMARY KEY, legal_template_id bigint NOT NULL REFERENCES legal_contract_templates(id),
 user_id bigint NOT NULL REFERENCES users(id), kind text NOT NULL CHECK(kind IN ('early','overdue')),
 target_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 CONSTRAINT legal_notice_once UNIQUE(legal_template_id,user_id,kind,target_at)
);
-- Preserve existing specialist approvals. Only the newest approved version in
-- each exact scope continues serving new contracts; never approve old drafts.
SET LOCAL dalaly.restore='on';
UPDATE legal_contract_templates SET publication_status='archived' WHERE approval_status='approved';
UPDATE legal_contract_templates t SET publication_status='active',is_default=true WHERE t.id IN (
 SELECT DISTINCT ON(contract_type,property_type,jurisdiction,transaction_kind) id FROM legal_contract_templates
 WHERE approval_status='approved' ORDER BY contract_type,property_type,jurisdiction,transaction_kind,version DESC,id DESC
);
SET LOCAL dalaly.restore='off';
ALTER TABLE legal_contract_templates ADD CONSTRAINT legal_active_approved CHECK(publication_status<>'active' OR approval_status='approved'),
 ADD CONSTRAINT legal_default_active CHECK(NOT is_default OR publication_status='active');
CREATE UNIQUE INDEX legal_active_scope ON legal_contract_templates(contract_type,property_type,jurisdiction,transaction_kind) WHERE publication_status='active';

CREATE FUNCTION legal_normalize(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT btrim(regexp_replace(normalize(coalesce(value,''), NFC),'[[:space:]]+',' ','g'))
$$;
CREATE FUNCTION legal_revision_terms(revision_id bigint) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('scope',jsonb_build_array(t.contract_type,t.property_type,t.jurisdiction,t.transaction_kind),
 'basis',legal_normalize(t.legal_basis),'applicability',legal_normalize(t.applicability_notes),
 'clauses',coalesce((SELECT jsonb_agg(jsonb_build_object('code',c.clause_code,'title',legal_normalize(c.clause_title),
 'text',legal_normalize(c.clause_content_ar),'required',c.is_required,'conditions',
 CASE WHEN c.conditions_json='{}'::jsonb THEN '{"all":[]}'::jsonb ELSE c.conditions_json END) ORDER BY c.clause_order,c.clause_code)
 FROM legal_contract_clauses c WHERE c.legal_template_id=t.id),'[]'::jsonb))
 FROM legal_contract_templates t WHERE t.id=revision_id
$$;
CREATE OR REPLACE FUNCTION protect_legal_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE baseline bigint;
BEGIN
 IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.approval_status<>'draft' OR NEW.approved_by IS NOT NULL OR NEW.publication_status<>'unpublished' OR NEW.is_default THEN
   RAISE EXCEPTION 'New legal revisions must be unapproved unpublished drafts'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Legal revisions are immutable'; END IF;
 IF (to_jsonb(NEW)-ARRAY['approval_status','approved_by','approved_at','updated_at','publication_status','is_default','target_at','priority'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['approval_status','approved_by','approved_at','updated_at','publication_status','is_default','target_at','priority']) THEN
  RAISE EXCEPTION 'Legal revisions are immutable; create a new revision'; END IF;
 IF OLD.approval_status=NEW.approval_status THEN
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN RAISE EXCEPTION 'Approval evidence is immutable'; END IF;
 ELSE
  IF NOT ((OLD.approval_status='draft' AND NEW.approval_status IN ('pending','approved')) OR
   (OLD.approval_status='pending' AND NEW.approval_status IN ('approved','rejected'))) THEN RAISE EXCEPTION 'Invalid legal approval transition'; END IF;
  IF NEW.approval_status='approved' THEN
   IF legal_normalize(NEW.legal_basis)='' OR legal_normalize(NEW.applicability_notes)='' OR NEW.property_type='*' OR
    NOT EXISTS(SELECT 1 FROM legal_contract_clauses WHERE legal_template_id=NEW.id AND is_required) THEN RAISE EXCEPTION 'Required legal content missing'; END IF;
   SELECT id INTO baseline FROM legal_contract_templates WHERE contract_type=NEW.contract_type AND property_type=NEW.property_type
    AND jurisdiction=NEW.jurisdiction AND transaction_kind=NEW.transaction_kind AND approval_status='approved'
    ORDER BY version DESC,id DESC LIMIT 1;
   -- Classification is never sufficient evidence: compare actual stored terms.
   IF NOT coalesce((NOT NEW.review_required AND NEW.based_on_id=baseline AND legal_revision_terms(NEW.id)=legal_revision_terms(baseline)),false) THEN
    IF OLD.approval_status<>'pending' OR NOT EXISTS(SELECT 1 FROM legal_reviewers r JOIN users u ON u.id=r.user_id
     WHERE r.user_id=NEW.approved_by AND r.is_active AND u.is_active) THEN RAISE EXCEPTION 'Specialist review required for new or changed legal terms'; END IF;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_issued_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.status<>'draft' THEN RAISE EXCEPTION 'Issued contracts are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Create a draft before issue'; END IF;
 IF NEW.status<>'draft' AND NOT EXISTS(
  SELECT 1 FROM contract_legal_snapshots s WHERE s.contract_id=NEW.id AND s.document_model->>'ready'='true'
   AND jsonb_array_length(s.legal_template_version)>0
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.legal_template_version) v LEFT JOIN legal_contract_templates t ON t.id=(v->>'id')::bigint
     WHERE t.id IS NULL OR t.approval_status<>'approved' OR t.publication_status<>'active')
   AND ((legal_normalize(s.document_model->'data'->>'additional_conditions')='' AND legal_normalize(NEW.notes)='') OR
    (s.review->>'content_hash'=s.content_hash AND EXISTS(SELECT 1 FROM legal_reviewers r JOIN users u ON u.id=r.user_id
     WHERE r.user_id=(s.review->'reviewer'->>'user_id')::bigint AND r.is_active AND u.is_active)))
 ) THEN RAISE EXCEPTION 'Active approved wording and specialist-reviewed exceptions required before issue'; END IF;
 RETURN NEW;
END $$;
INSERT INTO permissions(key,name,module) VALUES
 ('legal_content.publish','نشر الصيغ واعتماد التعديلات الإدارية','legal_content'),
 ('legal_content.propose','اقتراح تعديلات الصيغ دون نشر','legal_content') ON CONFLICT(key) DO NOTHING;
INSERT INTO roles(name,description) VALUES ('office_manager','مدير المكتب؛ نشر الصيغ المراجعة مسبقاً'),('legal_editor','موظف؛ اقتراح تعديلات دون نشر') ON CONFLICT(name) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE (r.name IN ('admin','Super Admin','office_manager') AND p.key IN ('legal_content.read','legal_content.manage','legal_content.publish'))
 OR (r.name='office_manager' AND p.key IN ('contracts.read','contracts.manage','contract_templates.manage'))
 OR (r.name='legal_editor' AND p.key IN ('legal_content.read','legal_content.propose','contracts.read')) ON CONFLICT DO NOTHING;
COMMIT;
