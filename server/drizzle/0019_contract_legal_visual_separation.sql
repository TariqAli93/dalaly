BEGIN;

ALTER TABLE contract_templates ADD COLUMN template_code text UNIQUE,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN layout_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN branding_config jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN legacy_body text;
ALTER TABLE contracts ADD COLUMN generated_html text,
  ADD COLUMN legal_context jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN optional_clause_codes jsonb NOT NULL DEFAULT '[]';

CREATE TABLE legal_reviewers (
  user_id bigint PRIMARY KEY REFERENCES users(id), lawyer_name text NOT NULL,
  registration_number text NOT NULL, qualification_evidence text NOT NULL,
  verified_by bigint NOT NULL REFERENCES users(id), verified_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE legal_contract_templates (
  id bigserial PRIMARY KEY, family_code text NOT NULL, contract_type text NOT NULL CHECK (contract_type IN ('sale','rental')),
  property_type text NOT NULL, jurisdiction text NOT NULL, transaction_kind text NOT NULL,
  title text NOT NULL, version integer NOT NULL CHECK (version > 0),
  approval_status text NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','pending','approved','rejected')),
  legal_basis text NOT NULL DEFAULT '', applicability_notes text NOT NULL DEFAULT '',
  approved_by bigint REFERENCES users(id), approved_at timestamptz,
  created_by bigint REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_template_revision_key UNIQUE(family_code,version),
  CHECK ((approval_status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX legal_selection_idx ON legal_contract_templates(contract_type,property_type,jurisdiction,transaction_kind,approval_status);
CREATE TABLE legal_contract_clauses (
  id bigserial PRIMARY KEY, legal_template_id bigint NOT NULL REFERENCES legal_contract_templates(id),
  clause_code text NOT NULL, clause_title text NOT NULL, clause_content_ar text NOT NULL,
  clause_order integer NOT NULL, is_required boolean NOT NULL DEFAULT true,
  conditions_json jsonb NOT NULL DEFAULT '{}', version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_clause_code_key UNIQUE(legal_template_id,clause_code)
);
CREATE TABLE legal_content_events (
  id bigserial PRIMARY KEY, legal_template_id bigint NOT NULL REFERENCES legal_contract_templates(id),
  action text NOT NULL, actor_id bigint REFERENCES users(id), comment text NOT NULL,
  reviewer_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE contract_legal_snapshots (
  id bigserial PRIMARY KEY, contract_id bigint NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  legal_template_version jsonb NOT NULL, approved_clause_snapshot jsonb NOT NULL,
  document_model jsonb NOT NULL, visual_snapshot jsonb NOT NULL, content_hash text NOT NULL,
  review jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

-- Historical contracts retain their actual text and original visual body.
INSERT INTO contract_legal_snapshots(contract_id,legal_template_version,approved_clause_snapshot,document_model,visual_snapshot,content_hash)
SELECT c.id,'[]','[]',jsonb_build_object('legacy',true,'approval_status','unknown','content',c.generated_content),
  jsonb_build_object('legacy',true,'template_id',v.id,'body',v.body,'name',v.name),'legacy'
FROM contracts c LEFT JOIN contract_templates v ON v.id=c.template_id WHERE c.generated_content IS NOT NULL;

-- Preserve every legacy wording, without conferring legal approval on it.
INSERT INTO legal_contract_templates(family_code,contract_type,property_type,jurisdiction,transaction_kind,title,version)
SELECT 'legacy_'||id, contract_type, '*', 'iq_federal', CASE WHEN contract_type='rental' THEN 'lease' ELSE 'preliminary_sale' END,
  'نص سابق غير معتمد: '||name, 1 FROM contract_templates WHERE contract_type IN ('sale','rental');
INSERT INTO legal_contract_clauses(legal_template_id,clause_code,clause_title,clause_content_ar,clause_order,version)
SELECT l.id,'legacy_text','النص السابق للمراجعة',v.body,1,1
FROM legal_contract_templates l JOIN contract_templates v ON l.family_code='legacy_'||v.id;
UPDATE contract_templates SET legacy_body=body, body='{{document}}', is_active=false, template_code='legacy_'||id;
ALTER TABLE contract_templates ADD CONSTRAINT visual_body_only CHECK(body='{{document}}');

-- Keep the first existing id in each domain for existing references.
UPDATE contract_templates v SET template_code=v.contract_type||'_01', is_active=true,
  name=CASE WHEN v.contract_type='rental' THEN 'إيجار' ELSE 'بيع' END||' · كلاسيكي'
WHERE v.id IN (SELECT min(id) FROM contract_templates WHERE contract_type IN ('sale','rental') GROUP BY contract_type);
INSERT INTO contract_templates(contract_type,name,body,is_active,template_code)
SELECT kind, CASE WHEN kind='rental' THEN 'إيجار' ELSE 'بيع' END||' · '||style,
  '{{document}}',true,kind||'_'||lpad(n::text,2,'0')
FROM (VALUES ('sale'),('rental')) k(kind)
CROSS JOIN (VALUES (1,'كلاسيكي'),(2,'إطار رسمي'),(3,'حديث'),(4,'مختصر'),(5,'رأسية'),(6,'حبر')) s(n,style)
ON CONFLICT (template_code) DO NOTHING;
UPDATE contract_templates SET layout_config=jsonb_build_object(
  'font','Tahoma','font_size',CASE right(template_code,2) WHEN '04' THEN 12 ELSE 14 END,
  'line_height',CASE right(template_code,2) WHEN '04' THEN 1.6 ELSE 1.9 END,
  'margin_mm',18,'paragraph_spacing',8,
  'header_style',CASE right(template_code,2) WHEN '03' THEN 'band' WHEN '05' THEN 'stacked' ELSE 'classic' END,
  'border_style',CASE right(template_code,2) WHEN '02' THEN 'double' WHEN '06' THEN 'solid' ELSE 'none' END,
  'signature_style',CASE right(template_code,2) WHEN '05' THEN 'stacked' ELSE 'columns' END,
  'accent_color',CASE right(template_code,2) WHEN '03' THEN '#176b66' WHEN '06' THEN '#222222' ELSE '#24364b' END),
  branding_config='{"show_logo":true,"watermark":false}'::jsonb
WHERE template_code ~ '^(sale|rental)_0[1-6]$';

-- Scopes are isolated: no residential fallback for agricultural/commercial.
-- Empty drafts need lawyer-authored wording, legal basis and applicability.
INSERT INTO legal_contract_templates(family_code,contract_type,property_type,jurisdiction,transaction_kind,title,version)
SELECT kind||'_'||ptype,kind,ptype,'iq_federal',CASE WHEN kind='rental' THEN 'lease' ELSE 'preliminary_sale' END,
  CASE WHEN kind='rental' THEN 'صيغة إيجار: ' ELSE 'اتفاق بيع أولي: ' END||label,1
FROM (VALUES ('sale'),('rental')) k(kind)
CROSS JOIN (VALUES ('land','أرض غير محددة الاستخدام'),('house','بيت'),('apartment','شقة'),('residential_land','أرض سكنية'),
  ('agricultural_land','أرض زراعية / دونم'),('commercial','عقار تجاري'),('warehouse','مخزن'),
  ('building','بناية'),('villa','فيلا'),('other','أخرى')) p(ptype,label);


INSERT INTO permissions(key,name,module) VALUES
 ('legal_content.read','عرض الصيغ القانونية','legal_content'),
 ('legal_content.manage','إدارة إصدارات الصيغ القانونية','legal_content'),
 ('legal_content.approve','اعتماد الصيغ ومراجعة العقود','legal_content'),
 ('legal_reviewers.manage','التحقق من أهلية المراجعين القانونيين','legal_content')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('admin','Super Admin') AND p.key IN ('legal_content.read','legal_content.manage','legal_reviewers.manage')
ON CONFLICT DO NOTHING;
INSERT INTO roles(name,description) VALUES ('legal_reviewer','مراجع قانوني عراقي مؤهل؛ يتطلب توثيق الأهلية') ON CONFLICT(name) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='legal_reviewer' AND p.key IN ('legal_content.read','legal_content.manage','legal_content.approve','contracts.read')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION protect_legal_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('dalaly.restore', true)='on' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.approval_status<>'draft' OR NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'New legal revisions must be unapproved drafts'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['approval_status','approved_by','approved_at','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['approval_status','approved_by','approved_at','updated_at']) THEN
    RAISE EXCEPTION 'Legal revisions are immutable; create a new revision';
  END IF;
  IF NOT ((OLD.approval_status='draft' AND NEW.approval_status='pending') OR
    (OLD.approval_status='pending' AND NEW.approval_status IN ('approved','rejected'))) THEN
    RAISE EXCEPTION 'Invalid legal approval transition';
  END IF;
  IF NEW.approval_status='approved' AND (NEW.legal_basis='' OR NEW.applicability_notes='' OR NOT EXISTS (SELECT 1 FROM legal_contract_clauses WHERE legal_template_id=NEW.id AND is_required)) THEN
    RAISE EXCEPTION 'Legal basis, applicability and mandatory clauses required';
  END IF;
  IF NEW.approval_status='approved' AND NOT EXISTS(SELECT 1 FROM legal_reviewers r JOIN users u ON u.id=r.user_id
    WHERE r.user_id=NEW.approved_by AND r.is_active AND u.is_active) THEN
    RAISE EXCEPTION 'Qualified active legal reviewer required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER legal_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON legal_contract_templates FOR EACH ROW EXECUTE FUNCTION protect_legal_revision();
CREATE OR REPLACE FUNCTION protect_legal_clause() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('dalaly.restore', true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' OR (SELECT approval_status FROM legal_contract_templates WHERE id=NEW.legal_template_id)<>'draft' THEN
    RAISE EXCEPTION 'Legal clauses are immutable; create a new revision';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER legal_clause_guard BEFORE INSERT OR UPDATE OR DELETE ON legal_contract_clauses FOR EACH ROW EXECUTE FUNCTION protect_legal_clause();
CREATE OR REPLACE FUNCTION protect_legal_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('dalaly.restore', true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
  RAISE EXCEPTION 'Legal revision history is append-only';
END $$;
CREATE TRIGGER legal_history_guard BEFORE UPDATE OR DELETE ON legal_content_events FOR EACH ROW EXECUTE FUNCTION protect_legal_history();
CREATE OR REPLACE FUNCTION protect_issued_contract_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid bigint;
BEGIN
  IF current_setting('dalaly.restore', true)='on' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  cid := CASE WHEN TG_OP='DELETE' THEN OLD.contract_id ELSE NEW.contract_id END;
  IF EXISTS(SELECT 1 FROM contracts WHERE (id=cid OR (TG_OP='UPDATE' AND id=OLD.contract_id)) AND status<>'draft') THEN
    RAISE EXCEPTION 'Issued contract snapshots are immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contract_legal_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_legal_snapshots
  FOR EACH ROW EXECUTE FUNCTION protect_issued_contract_snapshot();
CREATE TRIGGER contract_office_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_office_snapshots FOR EACH ROW EXECUTE FUNCTION protect_issued_contract_snapshot();
CREATE TRIGGER contract_asset_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_asset_snapshots FOR EACH ROW EXECUTE FUNCTION protect_issued_contract_snapshot();
CREATE TRIGGER contract_attachment_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_attachments FOR EACH ROW EXECUTE FUNCTION protect_issued_contract_snapshot();
CREATE TRIGGER contract_party_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_parties FOR EACH ROW EXECUTE FUNCTION protect_issued_contract_snapshot();
CREATE OR REPLACE FUNCTION protect_issued_party_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('dalaly.restore', true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM contracts c JOIN contract_parties p ON p.contract_id=c.id WHERE c.status<>'draft' AND p.id IN (
    CASE WHEN TG_OP='INSERT' THEN NEW.contract_party_id ELSE OLD.contract_party_id END,
    CASE WHEN TG_OP='DELETE' THEN OLD.contract_party_id ELSE NEW.contract_party_id END)) THEN
    RAISE EXCEPTION 'Issued party snapshots are immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER issued_party_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON party_snapshots FOR EACH ROW EXECUTE FUNCTION protect_issued_party_snapshot();
CREATE OR REPLACE FUNCTION protect_issued_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('dalaly.restore', true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.status<>'draft' THEN RAISE EXCEPTION 'Issued contracts are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='INSERT' AND NEW.status<>'draft' THEN RAISE EXCEPTION 'Create a draft and review before issue'; END IF;
  IF NEW.status<>'draft' AND NOT EXISTS (SELECT 1 FROM contract_legal_snapshots s WHERE s.contract_id=NEW.id
    AND s.document_model->>'ready'='true' AND s.review->>'content_hash'=s.content_hash) THEN
    RAISE EXCEPTION 'Reviewed approved legal content required before issue';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issued_contract_guard BEFORE INSERT OR UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION protect_issued_contract();

COMMIT;
