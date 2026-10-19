-- Retirement migration. Historical creation files remain byte-for-byte intact.
-- Existing data requires the separately approved maintenance connection setting.
DO $$
DECLARE candidates text[] := ARRAY[
 'studio_audit_logs','studio_versions','studio_previews','studio_documents',
 'studio_contracts','studio_templates','studio_clauses','studio_legacy_archive','studio_legacy_tables',
 'contract_procedure_attachments','contract_procedures','contract_attachments',
 'contract_asset_snapshots','contract_office_snapshots','contract_legal_snapshots',
 'party_snapshots','contract_parties','contracts','contract_templates',
 'legal_task_notifications','legal_content_events','legal_contract_clauses',
 'legal_contract_templates','legal_formulations','legal_reviewers'];
 present text; incoming text;
BEGIN
 SELECT string_agg(format('%I.%I',n.nspname,c.relname),',') INTO present
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(candidates);
 IF present IS NOT NULL OR
    EXISTS(SELECT 1 FROM public.permissions WHERE key ~ '^(contracts|contract_templates|legal_content|legal_formulations|formulations|studio)\.') OR
    EXISTS(SELECT 1 FROM public.app_settings WHERE key ~ '^(studio|contracts|contract_templates|legal_content)\.') OR
    EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('studio_immutable_record','protect_issued_contract','protect_issued_contract_snapshot','protect_issued_party_snapshot')) OR
    EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_type IN ('contract','contracts','contract_template','contract_templates','studio_contract','studio_template','legal_content','legal_formulation')) THEN
   IF current_setting('dalaly.approved_module_removal',true) IS DISTINCT FROM 'contracts' THEN
     RAISE EXCEPTION 'Separate approval and a verified restore are required before module retirement';
   END IF;
   SELECT string_agg(format('%s.%s',s.relname,f.conname),',') INTO incoming
   FROM pg_constraint f JOIN pg_class s ON s.oid=f.conrelid JOIN pg_class t ON t.oid=f.confrelid
   JOIN pg_namespace sn ON sn.oid=s.relnamespace JOIN pg_namespace tn ON tn.oid=t.relnamespace
   WHERE f.contype='f' AND tn.nspname='public' AND t.relname=ANY(candidates)
     AND (sn.nspname<>'public' OR NOT(s.relname=ANY(candidates)));
   IF incoming IS NOT NULL THEN RAISE EXCEPTION 'Shared relations require separate review: %',incoming; END IF;
   -- Preserve setup protection independently of records about to be retired.
   CREATE TABLE IF NOT EXISTS public.dalaly_setup_state(id boolean PRIMARY KEY DEFAULT true CHECK(id),initialized_at timestamptz NOT NULL DEFAULT now());
   INSERT INTO public.dalaly_setup_state(id) VALUES(true) ON CONFLICT DO NOTHING;
   IF present IS NOT NULL THEN
     EXECUTE 'DROP TABLE '||present; -- RESTRICT is intentional; no cascading into shared objects.
   END IF;
 END IF;
END $$;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.studio_immutable_record();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.protect_issued_contract();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.protect_issued_contract_snapshot();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.protect_issued_party_snapshot();
--> statement-breakpoint
DELETE FROM public.role_permissions WHERE permission_id IN (
 SELECT id FROM public.permissions WHERE key ~ '^(contracts|contract_templates|legal_content|legal_formulations|formulations|studio)\.'
);
--> statement-breakpoint
DELETE FROM public.permissions WHERE key ~ '^(contracts|contract_templates|legal_content|legal_formulations|formulations|studio)\.';
--> statement-breakpoint
DELETE FROM public.app_settings WHERE key ~ '^(studio|contracts|contract_templates|legal_content)\.';
--> statement-breakpoint
DELETE FROM public.audit_logs WHERE entity_type IN ('contract','contracts','contract_template','contract_templates','studio_contract','studio_template','legal_content','legal_formulation');
