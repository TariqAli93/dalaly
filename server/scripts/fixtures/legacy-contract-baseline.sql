CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"action" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"file_path" text,
	"file_size" bigint,
	"duration_ms" integer,
	"error" text,
	"user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" bigint,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_asset_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" bigint NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_asset_snapshots_source_key" UNIQUE("contract_id","source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "contract_attachments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"contract_party_id" bigint NOT NULL,
	"identity_document_id" bigint NOT NULL,
	"document_type" text,
	"document_name" text NOT NULL,
	"document_side" text DEFAULT 'unspecified' NOT NULL,
	"document_number" text,
	"file_path" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" bigint,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_attachments_party_document_key" UNIQUE("contract_party_id","identity_document_id")
);
--> statement-breakpoint
CREATE TABLE "contract_legal_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"legal_template_version" jsonb NOT NULL,
	"approved_clause_snapshot" jsonb NOT NULL,
	"document_model" jsonb NOT NULL,
	"visual_snapshot" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"review" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_legal_snapshots_contract_id_unique" UNIQUE("contract_id")
);
--> statement-breakpoint
CREATE TABLE "contract_office_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"office_name" text NOT NULL,
	"owner_name" text,
	"logo_file_path" text,
	"address" text,
	"phone_primary" text,
	"phone_secondary" text,
	"email" text,
	"license_number" text,
	"additional_contact" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_office_snapshots_contract_id_unique" UNIQUE("contract_id")
);
--> statement-breakpoint
CREATE TABLE "contract_parties" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"person_id" bigint NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_parties_contract_role_key" UNIQUE("contract_id","role")
);
--> statement-breakpoint
CREATE TABLE "contract_procedure_attachments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"step_key" text NOT NULL,
	"name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"uploaded_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_procedures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_id" bigint NOT NULL,
	"step_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_on" date,
	"reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_procedures_contract_id_step_key_key" UNIQUE("contract_id","step_key")
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_type" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"template_code" text,
	"version" integer DEFAULT 1 NOT NULL,
	"layout_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"branding_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_body" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_templates_template_code_unique" UNIQUE("template_code")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"contract_type" text NOT NULL,
	"property_id" bigint,
	"rental_id" bigint,
	"template_id" bigint,
	"status" text DEFAULT 'draft' NOT NULL,
	"contract_date" timestamp with time zone DEFAULT now() NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"amount" numeric(18, 2),
	"paid_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"payment_info" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"generated_content" text,
	"generated_html" text,
	"legal_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agreement_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"optional_clause_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"issued_by" bigint,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" bigint,
	"cancellation_reason" text,
	"cancellation_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"governorate_id" bigint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_types" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"transaction_scope" text DEFAULT 'general' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "favorite_properties" (
	"user_id" bigint NOT NULL,
	"property_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_properties_user_id_property_id_pk" PRIMARY KEY("user_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "favorite_rentals" (
	"user_id" bigint NOT NULL,
	"rental_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_rentals_user_id_rental_id_pk" PRIMARY KEY("user_id","rental_id")
);
--> statement-breakpoint
CREATE TABLE "governorates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governorates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "identity_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"person_id" bigint NOT NULL,
	"document_type_id" bigint,
	"document_name" text NOT NULL,
	"document_side" text DEFAULT 'unspecified' NOT NULL,
	"document_number" text,
	"file_path" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" bigint,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_documents_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "legal_content_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"legal_template_id" bigint NOT NULL,
	"action" text NOT NULL,
	"actor_id" bigint,
	"comment" text NOT NULL,
	"reviewer_snapshot" jsonb,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_contract_clauses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"legal_template_id" bigint NOT NULL,
	"clause_code" text NOT NULL,
	"clause_title" text NOT NULL,
	"clause_content_ar" text NOT NULL,
	"clause_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"conditions_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_clause_id" bigint,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_clause_code_key" UNIQUE("legal_template_id","clause_code")
);
--> statement-breakpoint
CREATE TABLE "legal_contract_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"family_code" text NOT NULL,
	"wording_origin" text DEFAULT 'specialist' NOT NULL,
	"contract_type" text NOT NULL,
	"property_type" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"transaction_kind" text NOT NULL,
	"title" text NOT NULL,
	"version" integer NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"legal_basis" text DEFAULT '' NOT NULL,
	"applicability_notes" text DEFAULT '' NOT NULL,
	"parent_id" bigint,
	"based_on_id" bigint,
	"change_kind" text DEFAULT 'new_legal' NOT NULL,
	"review_required" boolean DEFAULT true NOT NULL,
	"publication_status" text DEFAULT 'unpublished' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" bigint,
	"target_at" timestamp with time zone,
	"priority" integer DEFAULT 1 NOT NULL,
	"approved_by" bigint,
	"approved_at" timestamp with time zone,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_template_revision_key" UNIQUE("family_code","version")
);
--> statement-breakpoint
CREATE TABLE "legal_reviewers" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"lawyer_name" text NOT NULL,
	"registration_number" text NOT NULL,
	"qualification_evidence" text NOT NULL,
	"verified_by" bigint NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_task_notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"legal_template_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"target_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "legal_notice_once" UNIQUE("legal_template_id","user_id","kind","target_at")
);
--> statement-breakpoint
CREATE TABLE "neighborhoods" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"district_id" bigint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_profiles" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"owner_name" text,
	"phone_primary" text,
	"phone_secondary" text,
	"email" text,
	"address" text,
	"additional_contact" text,
	"license_number" text,
	"logo_file_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_party_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"identity_number" text,
	"phone_primary" text,
	"phone_secondary" text,
	"email" text,
	"address" text,
	"residential_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"residence_card_number" text,
	"notes" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_snapshots_contract_party_id_unique" UNIQUE("contract_party_id")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"phone_primary" text,
	"phone_secondary" text,
	"email" text,
	"address" text,
	"national_id" text,
	"governorate" text,
	"district" text,
	"neighborhood" text,
	"alley" text,
	"house_number" text,
	"residence_card_number" text,
	"person_type" text DEFAULT 'individual' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"module" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text,
	"code" text NOT NULL,
	"property_type" text NOT NULL,
	"legal_type" text NOT NULL,
	"area_value" numeric(14, 2) NOT NULL,
	"area_unit" text NOT NULL,
	"pricing_method" text NOT NULL,
	"unit_price" numeric(18, 2),
	"total_price" numeric(18, 2) NOT NULL,
	"governorate" text,
	"city" text,
	"district" text,
	"governorate_id" bigint,
	"district_id" bigint,
	"neighborhood_id" bigint,
	"neighborhood" text,
	"governorate_text" text,
	"district_text" text,
	"neighborhood_text" text,
	"address_details" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"location_link" text,
	"owner_name" text NOT NULL,
	"owner_phone" text NOT NULL,
	"owner_notes" text,
	"owner_person_id" bigint,
	"status" text DEFAULT 'available' NOT NULL,
	"notes" text,
	"nazal" text,
	"plot_number" text,
	"plot_letter" text,
	"subdistrict_number" text,
	"subdistrict_name" text,
	"mahalla" text,
	"alley" text,
	"house_number" text,
	"nearest_landmark" text,
	"street_width" text,
	"frontage" text,
	"rooms_count" integer,
	"bathrooms_count" integer,
	"is_negotiable" boolean DEFAULT false NOT NULL,
	"amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "properties_code_unique" UNIQUE("code"),
	CONSTRAINT "properties_location_range" CHECK (("properties"."latitude" IS NULL AND "properties"."longitude" IS NULL) OR ("properties"."latitude" IS NOT NULL AND "properties"."longitude" IS NOT NULL AND "properties"."latitude" BETWEEN -90 AND 90 AND "properties"."longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "property_followups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"property_id" bigint NOT NULL,
	"user_id" bigint,
	"type" text NOT NULL,
	"notes" text,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"property_id" bigint NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"person_id" bigint NOT NULL,
	"property_type" text NOT NULL,
	"budget_min" numeric(18, 2),
	"budget_max" numeric(18, 2),
	"area_unit" text,
	"area_min" numeric(14, 2),
	"area_max" numeric(14, 2),
	"rooms_count" integer,
	"bathrooms_count" integer,
	"floors_count" integer,
	"governorate_id" bigint,
	"district_id" bigint,
	"neighborhood_id" bigint,
	"governorate" text,
	"district" text,
	"neighborhood" text,
	"amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"other_requirements" text,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "purchase_requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rental_followups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rental_id" bigint NOT NULL,
	"user_id" bigint,
	"type" text NOT NULL,
	"notes" text,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rental_id" bigint NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"person_id" bigint NOT NULL,
	"property_type" text NOT NULL,
	"rent_period" text,
	"budget_min" numeric(18, 2),
	"budget_max" numeric(18, 2),
	"area_unit" text,
	"area_min" numeric(14, 2),
	"area_max" numeric(14, 2),
	"floors_count" integer,
	"rooms_count" integer,
	"bathrooms_count" integer,
	"governorate_id" bigint,
	"district_id" bigint,
	"neighborhood_id" bigint,
	"governorate" text,
	"district" text,
	"neighborhood" text,
	"amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"other_requirements" text,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "rental_requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rentals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text,
	"code" text NOT NULL,
	"property_type" text NOT NULL,
	"rent_price" numeric(18, 2) NOT NULL,
	"rent_period" text NOT NULL,
	"area_value" numeric(14, 2) NOT NULL,
	"area_unit" text NOT NULL,
	"floors_count" integer,
	"rooms_count" integer,
	"bathrooms_count" integer,
	"amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"other_details" text,
	"governorate_id" bigint,
	"district_id" bigint,
	"neighborhood_id" bigint,
	"governorate" text,
	"district" text,
	"neighborhood" text,
	"address_details" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"location_link" text,
	"owner_name" text NOT NULL,
	"owner_phone" text NOT NULL,
	"owner_notes" text,
	"owner_person_id" bigint,
	"status" text DEFAULT 'available' NOT NULL,
	"is_negotiable" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "rentals_code_unique" UNIQUE("code"),
	CONSTRAINT "rentals_location_range" CHECK (("rentals"."latitude" IS NULL AND "rentals"."longitude" IS NULL) OR ("rentals"."latitude" IS NOT NULL AND "rentals"."longitude" IS NOT NULL AND "rentals"."latitude" BETWEEN -90 AND 90 AND "rentals"."longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" bigint NOT NULL,
	"permission_id" bigint NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" bigint NOT NULL,
	"role_id" bigint NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"pin_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "contract_asset_snapshots" ADD CONSTRAINT "contract_asset_snapshots_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_contract_party_id_contract_parties_id_fk" FOREIGN KEY ("contract_party_id") REFERENCES "public"."contract_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_identity_document_id_identity_documents_id_fk" FOREIGN KEY ("identity_document_id") REFERENCES "public"."identity_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_legal_snapshots" ADD CONSTRAINT "contract_legal_snapshots_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_office_snapshots" ADD CONSTRAINT "contract_office_snapshots_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_procedure_attachments" ADD CONSTRAINT "contract_procedure_attachments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_procedure_attachments" ADD CONSTRAINT "contract_procedure_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_procedures" ADD CONSTRAINT "contract_procedures_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_procedures" ADD CONSTRAINT "contract_procedures_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_governorate_id_governorates_id_fk" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_properties" ADD CONSTRAINT "favorite_properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_properties" ADD CONSTRAINT "favorite_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_rentals" ADD CONSTRAINT "favorite_rentals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_rentals" ADD CONSTRAINT "favorite_rentals_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_content_events" ADD CONSTRAINT "legal_content_events_legal_template_id_legal_contract_templates_id_fk" FOREIGN KEY ("legal_template_id") REFERENCES "public"."legal_contract_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_content_events" ADD CONSTRAINT "legal_content_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_contract_clauses" ADD CONSTRAINT "legal_contract_clauses_legal_template_id_legal_contract_templates_id_fk" FOREIGN KEY ("legal_template_id") REFERENCES "public"."legal_contract_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_contract_templates" ADD CONSTRAINT "legal_contract_templates_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_contract_templates" ADD CONSTRAINT "legal_contract_templates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_contract_templates" ADD CONSTRAINT "legal_contract_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_reviewers" ADD CONSTRAINT "legal_reviewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_reviewers" ADD CONSTRAINT "legal_reviewers_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_task_notifications" ADD CONSTRAINT "legal_task_notifications_legal_template_id_legal_contract_templates_id_fk" FOREIGN KEY ("legal_template_id") REFERENCES "public"."legal_contract_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_task_notifications" ADD CONSTRAINT "legal_task_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_snapshots" ADD CONSTRAINT "party_snapshots_contract_party_id_contract_parties_id_fk" FOREIGN KEY ("contract_party_id") REFERENCES "public"."contract_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_followups" ADD CONSTRAINT "property_followups_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_governorate_id_governorates_id_fk" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD CONSTRAINT "rental_followups_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD CONSTRAINT "rental_followups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_images" ADD CONSTRAINT "rental_images_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_governorate_id_governorates_id_fk" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_governorate_id_governorates_id_fk" FOREIGN KEY ("governorate_id") REFERENCES "public"."governorates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_contract_asset_snapshots_contract" ON "contract_asset_snapshots" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_contract" ON "contract_attachments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_parties_person" ON "contract_parties" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_type" ON "contracts" USING btree ("contract_type");--> statement-breakpoint
CREATE INDEX "idx_contracts_property" ON "contracts" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_rental" ON "contracts" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_status" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contracts_dates" ON "contracts" USING btree ("contract_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_districts_governorate" ON "districts" USING btree ("governorate_id");--> statement-breakpoint
CREATE INDEX "idx_document_types_scope" ON "document_types" USING btree ("transaction_scope");--> statement-breakpoint
CREATE INDEX "idx_document_types_active" ON "document_types" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_identity_documents_person" ON "identity_documents" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_identity_documents_type" ON "identity_documents" USING btree ("document_type_id");--> statement-breakpoint
CREATE INDEX "idx_identity_documents_status" ON "identity_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_identity_documents_expires_at" ON "identity_documents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_neighborhoods_district" ON "neighborhoods" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "idx_people_full_name" ON "people" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "idx_people_phone_primary" ON "people" USING btree ("phone_primary");--> statement-breakpoint
CREATE INDEX "idx_people_person_type" ON "people" USING btree ("person_type");--> statement-breakpoint
CREATE INDEX "idx_people_status" ON "people" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_properties_status" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_properties_type" ON "properties" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "idx_properties_legal_type" ON "properties" USING btree ("legal_type");--> statement-breakpoint
CREATE INDEX "idx_properties_area_unit" ON "properties" USING btree ("area_unit");--> statement-breakpoint
CREATE INDEX "idx_properties_pricing_method" ON "properties" USING btree ("pricing_method");--> statement-breakpoint
CREATE INDEX "idx_properties_district" ON "properties" USING btree ("district");--> statement-breakpoint
CREATE INDEX "idx_properties_governorate_id" ON "properties" USING btree ("governorate_id");--> statement-breakpoint
CREATE INDEX "idx_properties_district_id" ON "properties" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "idx_properties_neighborhood_id" ON "properties" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE INDEX "idx_followups_property" ON "property_followups" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_followups_scheduled" ON "property_followups" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_property_images_property" ON "property_images" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_person" ON "purchase_requests" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_property_type" ON "purchase_requests" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_budget" ON "purchase_requests" USING btree ("budget_max");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_governorate" ON "purchase_requests" USING btree ("governorate_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_district" ON "purchase_requests" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_neighborhood" ON "purchase_requests" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_requests_status" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rental_followups_rental" ON "rental_followups" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX "idx_rental_followups_scheduled" ON "rental_followups" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_rental_images_rental" ON "rental_images" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_person" ON "rental_requests" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_property_type" ON "rental_requests" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_rent_period" ON "rental_requests" USING btree ("rent_period");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_budget" ON "rental_requests" USING btree ("budget_max");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_governorate" ON "rental_requests" USING btree ("governorate_id");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_district" ON "rental_requests" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_neighborhood" ON "rental_requests" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE INDEX "idx_rental_requests_status" ON "rental_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rentals_status" ON "rentals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rentals_property_type" ON "rentals" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "idx_rentals_rent_period" ON "rentals" USING btree ("rent_period");--> statement-breakpoint
CREATE INDEX "idx_rentals_rent_price" ON "rentals" USING btree ("rent_price");--> statement-breakpoint
CREATE INDEX "idx_rentals_area" ON "rentals" USING btree ("area_value");--> statement-breakpoint
CREATE INDEX "idx_rentals_governorate" ON "rentals" USING btree ("governorate");--> statement-breakpoint
CREATE INDEX "idx_rentals_district" ON "rentals" USING btree ("district");--> statement-breakpoint
CREATE INDEX "idx_rentals_neighborhood" ON "rentals" USING btree ("neighborhood");--> statement-breakpoint
CREATE INDEX "idx_rentals_governorate_id" ON "rentals" USING btree ("governorate_id");--> statement-breakpoint
CREATE INDEX "idx_rentals_district_id" ON "rentals" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "idx_rentals_neighborhood_id" ON "rentals" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_token_hash" ON "sessions" USING btree ("token_hash");