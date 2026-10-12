BEGIN;
ALTER TABLE people ADD COLUMN governorate text, ADD COLUMN district text, ADD COLUMN neighborhood text,
 ADD COLUMN alley text, ADD COLUMN house_number text, ADD COLUMN residence_card_number text;
ALTER TABLE office_profiles ADD COLUMN owner_name text;
ALTER TABLE contract_office_snapshots ADD COLUMN owner_name text;
ALTER TABLE party_snapshots ADD COLUMN residential_details jsonb NOT NULL DEFAULT '{}', ADD COLUMN residence_card_number text;
ALTER TABLE identity_documents ADD COLUMN document_side text NOT NULL DEFAULT 'unspecified' CHECK(document_side IN ('front','back','both','unspecified'));
ALTER TABLE contract_attachments ADD COLUMN document_side text NOT NULL DEFAULT 'unspecified';
ALTER TABLE contracts ADD COLUMN agreement_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE legal_contract_templates ADD COLUMN wording_origin text NOT NULL DEFAULT 'specialist' CHECK(wording_origin IN ('specialist','office_standard'));
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='legal_contract_templates'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%approved_by%' LOOP
  EXECUTE format('ALTER TABLE legal_contract_templates DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE legal_contract_templates ADD CONSTRAINT wording_approval_evidence CHECK(
 (approval_status='approved')=(approved_at IS NOT NULL AND (approved_by IS NOT NULL OR (wording_origin='office_standard' AND NOT review_required)))
);
CREATE TABLE contract_procedures (
 id bigserial PRIMARY KEY, contract_id bigint NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
 step_key text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','not_applicable')),
 completed_on date, reference text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
 updated_by bigint REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(contract_id,step_key), CHECK((status='completed')=(completed_on IS NOT NULL))
);
CREATE TABLE contract_procedure_attachments (
 id bigserial PRIMARY KEY, contract_id bigint NOT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
 step_key text NOT NULL, name text NOT NULL, file_path text NOT NULL, file_type text NOT NULL, file_size bigint NOT NULL,
 uploaded_by bigint REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contract_procedures_contract ON contract_procedures(contract_id);
CREATE INDEX contract_procedure_files_contract ON contract_procedure_attachments(contract_id);
-- Administrative office wording supplied in the product request. This is not specialist certification.
-- Preserve every existing revision; never promote user drafts or overwrite issued documents.
INSERT INTO document_types(key,name,transaction_scope,is_required,is_active) VALUES('civil_id','هوية الأحوال المدنية','general',false,true) ON CONFLICT(key) DO NOTHING;
SET LOCAL dalaly.restore='on';
DO $$ DECLARE kind text; region text; revision bigint; BEGIN
 FOREACH kind IN ARRAY ARRAY['sale','rental'] LOOP
  FOREACH region IN ARRAY ARRAY['iq_federal','iq_kurdistan'] LOOP
   INSERT INTO legal_contract_templates(family_code,contract_type,property_type,jurisdiction,transaction_kind,title,version,
    approval_status,legal_basis,applicability_notes,change_kind,review_required,publication_status,is_default,wording_origin,approved_at)
   VALUES('office_standard:'||kind||':'||region,kind,'all_properties',region,CASE WHEN kind='rental' THEN 'lease' ELSE 'preliminary_sale' END,
    CASE WHEN kind='rental' THEN 'صيغة المكتب — اتفاق إيجار عقار' ELSE 'صيغة المكتب — اتفاق بيع عقار' END,1,
    'approved','صيغة اتفاق مكتب لتوثيق بيانات وشروط يحددها الطرفان؛ ليست اعتماداً قانونياً أو إجراءً رسمياً.',
    'صيغة عامة لوساطة المكتب. البنود الخاصة بالعقار تبقى ضمن صيغتها المستقلة.',
    'administrative',false,'active',true,'office_standard',now()) RETURNING id INTO revision;
   INSERT INTO legal_contract_clauses(legal_template_id,clause_code,clause_title,clause_content_ar,clause_order,is_required,conditions_json,version)
   VALUES(revision,'office_agreement','الاتفاق والتراضي',
    CASE WHEN kind='sale' THEN 'بتاريخ {{contract.date}} جرى الاتفاق والتراضي بين السيد {{seller.full_name}} بصفته الطرف الأول (البائع)، والسيد {{buyer.full_name}} بصفته الطرف الثاني (المشتري)، {{office.involvement}}، على بيع العقار المبينة أوصافه في هذا الاتفاق، لقاء المبلغ المتفق عليه {{contract.amount}}.'
    ELSE 'بتاريخ {{contract.date}} جرى الاتفاق والتراضي بين السيد {{lessor.full_name}} بصفته الطرف الأول (المؤجر)، والسيد {{lessee.full_name}} بصفته الطرف الثاني (المستأجر)، {{office.involvement}}، على تأجير العقار المبينة أوصافه في هذا الاتفاق، لقاء الأجرة المتفق عليها {{contract.amount}}.' END,
    0,true,'{"all":[]}',1);
   INSERT INTO legal_content_events(legal_template_id,action,comment,details) VALUES(revision,'office_wording','إضافة صيغة المكتب دون ادعاء مراجعة مختصة','{"origin":"user_requested_office_agreement"}');
  END LOOP;
 END LOOP;
END $$;
SET LOCAL dalaly.restore='off';
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
   AND ((s.document_model->'data'->>'agreement_mode'='office') OR (legal_normalize(s.document_model->'data'->>'additional_conditions')='' AND legal_normalize(NEW.notes)='') OR
    (s.review->>'content_hash'=s.content_hash AND EXISTS(SELECT 1 FROM legal_reviewers r JOIN users u ON u.id=r.user_id
     WHERE r.user_id=(s.review->'reviewer'->>'user_id')::bigint AND r.is_active AND u.is_active)))
 ) THEN RAISE EXCEPTION 'Active approved wording and applicable review required before issue'; END IF;
 RETURN NEW;
END $$;

INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
 WHERE (r.name IN ('office_manager','legal_editor') AND p.key IN ('contracts.read','contracts.manage','people.read','people.create','people.update','documents.read','documents.manage','properties.read','rentals.read','settings.read'))
 OR (r.name='office_manager' AND p.key='settings.update') ON CONFLICT DO NOTHING;
COMMIT;
