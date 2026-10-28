-- Contracts ("agreements"): the four built-in templates and their version
-- history, contracts with their parties, immutable issued revisions and
-- exports, and a link from customer documents to a contract. New names only:
-- the retired contract system's tables (contracts, contract_*, studio_*) may
-- still exist on old installs and are not touched.
CREATE TABLE "agreement_exports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agreement_id" bigint NOT NULL,
	"revision" integer,
	"format" text NOT NULL,
	"file_name" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_exports_format" CHECK ("agreement_exports"."format" in ('pdf', 'docx', 'print'))
);
--> statement-breakpoint
CREATE TABLE "agreement_parties" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agreement_id" bigint NOT NULL,
	"role" text NOT NULL,
	"person_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_parties_role" CHECK ("agreement_parties"."role" in ('seller', 'buyer', 'landlord', 'tenant'))
);
--> statement-breakpoint
CREATE TABLE "agreement_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agreement_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"template_key" text NOT NULL,
	"document" jsonb NOT NULL,
	"terms" jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"values" jsonb NOT NULL,
	"logo" text,
	"reason" text,
	"issued_by" bigint,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_template_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb,
	"change_type" text NOT NULL,
	"note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_template_versions_change" CHECK ("agreement_template_versions"."change_type" in ('saved', 'design_reset', 'full_reset', 'restored'))
);
--> statement-breakpoint
CREATE TABLE "agreement_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"definition" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"factory_revision" integer DEFAULT 1 NOT NULL,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_templates_template_key_unique" UNIQUE("template_key"),
	CONSTRAINT "agreement_templates_key" CHECK ("agreement_templates"."template_key" in ('sale', 'installment_sale', 'residential_rent', 'commercial_rent'))
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"template_key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"property_id" bigint,
	"rental_id" bigint,
	"terms" jsonb NOT NULL,
	"document" jsonb NOT NULL,
	"template_version" integer DEFAULT 0 NOT NULL,
	"draft_rev" integer DEFAULT 1 NOT NULL,
	"current_revision" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone,
	"issued_by" bigint,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" bigint,
	"cancel_reason" text,
	"amend_reason" text,
	"created_by" bigint,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreements_code_unique" UNIQUE("code"),
	CONSTRAINT "agreements_template_key" CHECK ("agreements"."template_key" in ('sale', 'installment_sale', 'residential_rent', 'commercial_rent')),
	CONSTRAINT "agreements_status" CHECK ("agreements"."status" in ('draft', 'review', 'issued', 'cancelled')),
	CONSTRAINT "agreements_one_listing" CHECK ("agreements"."property_id" is null or "agreements"."rental_id" is null)
);
--> statement-breakpoint
ALTER TABLE "identity_documents" ADD COLUMN "agreement_id" bigint;--> statement-breakpoint
ALTER TABLE "agreement_exports" ADD CONSTRAINT "agreement_exports_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_exports" ADD CONSTRAINT "agreement_exports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_parties" ADD CONSTRAINT "agreement_parties_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_parties" ADD CONSTRAINT "agreement_parties_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_revisions" ADD CONSTRAINT "agreement_revisions_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_revisions" ADD CONSTRAINT "agreement_revisions_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_template_versions" ADD CONSTRAINT "agreement_template_versions_template_id_agreement_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agreement_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_template_versions" ADD CONSTRAINT "agreement_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_templates" ADD CONSTRAINT "agreement_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agreement_exports_agreement" ON "agreement_exports" USING btree ("agreement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agreement_parties_role" ON "agreement_parties" USING btree ("agreement_id","role");--> statement-breakpoint
CREATE INDEX "idx_agreement_parties_person" ON "agreement_parties" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agreement_revisions" ON "agreement_revisions" USING btree ("agreement_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agreement_template_versions" ON "agreement_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "idx_agreements_status" ON "agreements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_agreements_template" ON "agreements" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "idx_agreements_property" ON "agreements" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_agreements_rental" ON "agreements" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX "idx_agreements_updated" ON "agreements" USING btree ("updated_at");--> statement-breakpoint
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_identity_documents_agreement" ON "identity_documents" USING btree ("agreement_id");