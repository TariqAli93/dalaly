CREATE TABLE "studio_legacy_archive" (
	"id" bigint PRIMARY KEY NOT NULL,
	"contract_number" text NOT NULL,
	"contract_type" text NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_path" text,
	"pdf_hash" text,
	"source_hash" text NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint,
	"version_id" bigint,
	"action" text NOT NULL,
	"performed_by" bigint NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_contracts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_number" text NOT NULL,
	"contract_type" text NOT NULL,
	"property_id" bigint,
	"rental_id" bigint,
	"first_person_id" bigint,
	"second_person_id" bigint,
	"total_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"contract_date" date NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"current_version_id" bigint,
	"revision_reason" text,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" bigint,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	CONSTRAINT "studio_contracts_contract_number_unique" UNIQUE("contract_number"),
	CONSTRAINT "studio_contract_type" CHECK ("studio_contracts"."contract_type" IN ('sale','rental')),
	CONSTRAINT "studio_contract_status" CHECK ("studio_contracts"."status" IN ('draft','issued','superseded','cancelled')),
	CONSTRAINT "studio_contract_revision" CHECK ("studio_contracts"."revision">0),
	CONSTRAINT "studio_contract_amount" CHECK ("studio_contracts"."total_amount">=0 AND "studio_contracts"."paid_amount">=0 AND "studio_contracts"."paid_amount"<="studio_contracts"."total_amount"),
	CONSTRAINT "studio_contract_asset_domain" CHECK (("studio_contracts"."contract_type"='sale' AND "studio_contracts"."rental_id" IS NULL) OR ("studio_contracts"."contract_type"='rental' AND "studio_contracts"."property_id" IS NULL)),
	CONSTRAINT "studio_contract_distinct_parties" CHECK ("studio_contracts"."first_person_id" IS NULL OR "studio_contracts"."second_person_id" IS NULL OR "studio_contracts"."first_person_id"<>"studio_contracts"."second_person_id"),
	CONSTRAINT "studio_contract_dates" CHECK ("studio_contracts"."start_date" IS NULL OR "studio_contracts"."end_date" IS NULL OR "studio_contracts"."end_date">="studio_contracts"."start_date")
);
--> statement-breakpoint
CREATE TABLE "studio_documents" (
	"contract_id" bigint PRIMARY KEY NOT NULL,
	"content_json" jsonb NOT NULL,
	"content_template_id" bigint,
	"design_template_id" bigint,
	"template_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"design_config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_legacy_tables" (
	"table_name" text PRIMARY KEY NOT NULL,
	"rows_json" jsonb NOT NULL,
	"source_hash" text NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_previews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"document_snapshot" jsonb NOT NULL,
	"data_snapshot" jsonb NOT NULL,
	"template_snapshot" jsonb NOT NULL,
	"design_snapshot" jsonb NOT NULL,
	"pdf_path" text NOT NULL,
	"pdf_hash" text NOT NULL,
	"created_by" bigint NOT NULL,
	"approved_by" bigint,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contract_type" text NOT NULL,
	"template_kind" text NOT NULL,
	"content_json" jsonb,
	"design_config" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_by" bigint,
	"system_key" text,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_templates_system_key_unique" UNIQUE("system_key"),
	CONSTRAINT "studio_template_type" CHECK ("studio_templates"."contract_type" IN ('sale','rental')),
	CONSTRAINT "studio_template_kind" CHECK ("studio_templates"."template_kind" IN ('content','design')),
	CONSTRAINT "studio_template_version" CHECK ("studio_templates"."version">0),
	CONSTRAINT "studio_template_review" CHECK ("studio_templates"."review_status" IN ('unreviewed','reviewed')),
	CONSTRAINT "studio_template_payload" CHECK (("studio_templates"."template_kind"='content' AND "studio_templates"."content_json" IS NOT NULL AND "studio_templates"."design_config" IS NULL) OR ("studio_templates"."template_kind"='design' AND "studio_templates"."design_config" IS NOT NULL AND "studio_templates"."content_json" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "studio_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"version_number" integer NOT NULL,
	"document_snapshot" jsonb NOT NULL,
	"data_snapshot" jsonb NOT NULL,
	"template_snapshot" jsonb NOT NULL,
	"design_snapshot" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"pdf_path" text NOT NULL,
	"pdf_hash" text NOT NULL,
	"issued_by" bigint NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"supersedes_version_id" bigint,
	"reason" text,
	"request_id" uuid NOT NULL,
	"preview_id" uuid NOT NULL,
	CONSTRAINT "studio_versions_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "studio_versions_preview_id_unique" UNIQUE("preview_id"),
	CONSTRAINT "studio_version_number" UNIQUE("contract_id","version_number"),
	CONSTRAINT "studio_version_contract" UNIQUE("id","contract_id"),
	CONSTRAINT "studio_version_positive" CHECK ("studio_versions"."version_number">0),
	CONSTRAINT "studio_version_status" CHECK ("studio_versions"."status" IN ('issued','superseded','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "studio_audit_logs" ADD CONSTRAINT "studio_audit_logs_contract_id_studio_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."studio_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_audit_logs" ADD CONSTRAINT "studio_audit_logs_version_id_studio_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."studio_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_audit_logs" ADD CONSTRAINT "studio_audit_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_first_person_id_people_id_fk" FOREIGN KEY ("first_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_second_person_id_people_id_fk" FOREIGN KEY ("second_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_contracts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_contracts" ADD CONSTRAINT "studio_current_version_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."studio_versions"("id","contract_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_documents" ADD CONSTRAINT "studio_documents_contract_id_studio_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."studio_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_documents" ADD CONSTRAINT "studio_documents_content_template_id_studio_templates_id_fk" FOREIGN KEY ("content_template_id") REFERENCES "public"."studio_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_documents" ADD CONSTRAINT "studio_documents_design_template_id_studio_templates_id_fk" FOREIGN KEY ("design_template_id") REFERENCES "public"."studio_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_previews" ADD CONSTRAINT "studio_previews_contract_id_studio_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."studio_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_previews" ADD CONSTRAINT "studio_previews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_previews" ADD CONSTRAINT "studio_previews_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_templates" ADD CONSTRAINT "studio_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_versions" ADD CONSTRAINT "studio_versions_contract_id_studio_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."studio_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_versions" ADD CONSTRAINT "studio_versions_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_versions" ADD CONSTRAINT "studio_versions_supersedes_version_id_studio_versions_id_fk" FOREIGN KEY ("supersedes_version_id") REFERENCES "public"."studio_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_versions" ADD CONSTRAINT "studio_versions_preview_id_studio_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."studio_previews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_audit_contract" ON "studio_audit_logs" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_contracts_asset" ON "studio_contracts" USING btree ("property_id","rental_id");--> statement-breakpoint
CREATE INDEX "studio_contracts_parties" ON "studio_contracts" USING btree ("first_person_id","second_person_id");--> statement-breakpoint
CREATE INDEX "studio_contracts_status" ON "studio_contracts" USING btree ("status","contract_date");
--> statement-breakpoint
-- Drizzle does not model deferred FKs or trigger bodies. Keep these guards
-- in the same migration as the tables so setup and recovery cannot omit them.
ALTER TABLE studio_contracts ALTER CONSTRAINT studio_current_version_fk DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION studio_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('dalaly.restore',true)='on' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='studio_versions' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status')
    AND OLD.status='issued' AND NEW.status IN ('superseded','cancelled') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Contract Studio historical records are immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER studio_version_immutable BEFORE UPDATE OR DELETE ON studio_versions FOR EACH ROW EXECUTE FUNCTION studio_immutable_record();
--> statement-breakpoint
CREATE TRIGGER studio_audit_immutable BEFORE UPDATE OR DELETE ON studio_audit_logs FOR EACH ROW EXECUTE FUNCTION studio_immutable_record();
--> statement-breakpoint
CREATE TRIGGER studio_archive_immutable BEFORE UPDATE OR DELETE ON studio_legacy_archive FOR EACH ROW EXECUTE FUNCTION studio_immutable_record();
--> statement-breakpoint
CREATE TRIGGER studio_tables_immutable BEFORE UPDATE OR DELETE ON studio_legacy_tables FOR EACH ROW EXECUTE FUNCTION studio_immutable_record();
