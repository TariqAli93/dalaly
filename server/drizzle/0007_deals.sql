-- Deals (Phase 3a): an opportunity from first interest to contract and
-- outcome, with every stage move and every offer recorded, and a deal link
-- on customer activities. Additive only.
CREATE TABLE "deal_offers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deal_id" bigint NOT NULL,
	"party" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"notes" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_offers_party" CHECK ("deal_offers"."party" in ('client', 'owner')),
	CONSTRAINT "deal_offers_status" CHECK ("deal_offers"."status" in ('proposed', 'countered', 'accepted', 'rejected', 'withdrawn')),
	CONSTRAINT "deal_offers_amount" CHECK ("deal_offers"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deal_id" bigint NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"reason" text,
	"user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"deal_type" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"title" text,
	"property_id" bigint,
	"rental_id" bigint,
	"client_person_id" bigint NOT NULL,
	"owner_person_id" bigint,
	"assigned_user_id" bigint,
	"purchase_request_id" bigint,
	"rental_request_id" bigint,
	"agreement_id" bigint,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"asking_price" numeric(18, 2),
	"agreed_price" numeric(18, 2),
	"expected_commission" numeric(18, 2),
	"expected_close_date" text,
	"lost_reason" text,
	"notes" text,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_by" bigint,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_code_unique" UNIQUE("code"),
	CONSTRAINT "deals_type" CHECK ("deals"."deal_type" in ('sale', 'rent')),
	CONSTRAINT "deals_stage" CHECK ("deals"."stage" in ('new', 'contacted', 'qualified', 'viewing_scheduled', 'viewing_done', 'negotiating', 'agreed', 'contract_preparation', 'contract_issued', 'won', 'lost', 'cancelled')),
	CONSTRAINT "deals_priority" CHECK ("deals"."priority" in ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "deals_currency" CHECK ("deals"."currency" in ('IQD', 'USD')),
	CONSTRAINT "deals_listing" CHECK (("deals"."deal_type" = 'sale' and "deals"."rental_id" is null) or ("deals"."deal_type" = 'rent' and "deals"."property_id" is null)),
	CONSTRAINT "deals_parties" CHECK ("deals"."owner_person_id" is null or "deals"."owner_person_id" <> "deals"."client_person_id"),
	CONSTRAINT "deals_close_date" CHECK ("deals"."expected_close_date" is null or "deals"."expected_close_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "deal_id" bigint;--> statement-breakpoint
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_offers" ADD CONSTRAINT "deal_offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_client_person_id_people_id_fk" FOREIGN KEY ("client_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_rental_request_id_rental_requests_id_fk" FOREIGN KEY ("rental_request_id") REFERENCES "public"."rental_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deal_offers_deal" ON "deal_offers" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_deal_stage_history_deal" ON "deal_stage_history" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_deals_stage" ON "deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_deals_client" ON "deals" USING btree ("client_person_id");--> statement-breakpoint
CREATE INDEX "idx_deals_owner" ON "deals" USING btree ("owner_person_id");--> statement-breakpoint
CREATE INDEX "idx_deals_assigned" ON "deals" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_deals_property" ON "deals" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "idx_deals_rental" ON "deals" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX "idx_deals_agreement" ON "deals" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "idx_deals_updated" ON "deals" USING btree ("updated_at");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activities_deal" ON "activities" USING btree ("deal_id");