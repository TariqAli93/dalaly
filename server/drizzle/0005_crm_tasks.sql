-- CRM tasks (Phase 2a): follow-ups gain the columns of a task (customer,
-- assignee, status, priority, completion, outcome) and "activities" holds the
-- same for a customer or a request without a listing. Additive only.
CREATE TABLE "activities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"type" text NOT NULL,
	"notes" text,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"person_id" bigint NOT NULL,
	"assigned_user_id" bigint,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purchase_request_id" bigint,
	"rental_request_id" bigint,
	CONSTRAINT "activities_status" CHECK ("activities"."status" in ('open', 'done', 'cancelled')),
	CONSTRAINT "activities_priority" CHECK ("activities"."priority" in ('low', 'normal', 'high', 'urgent'))
);
--> statement-breakpoint
ALTER TABLE "property_followups" ADD COLUMN "person_id" bigint;--> statement-breakpoint
ALTER TABLE "property_followups" ADD COLUMN "assigned_user_id" bigint;--> statement-breakpoint
ALTER TABLE "property_followups" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_followups" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_followups" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "property_followups" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "property_followups" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD COLUMN "person_id" bigint;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD COLUMN "assigned_user_id" bigint;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_rental_request_id_rental_requests_id_fk" FOREIGN KEY ("rental_request_id") REFERENCES "public"."rental_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activities_person" ON "activities" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_activities_open_due" ON "activities" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_activities_assigned" ON "activities" USING btree ("assigned_user_id");--> statement-breakpoint
ALTER TABLE "property_followups" ADD CONSTRAINT "property_followups_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_followups" ADD CONSTRAINT "property_followups_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD CONSTRAINT "rental_followups_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_followups" ADD CONSTRAINT "rental_followups_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_followups_open_due" ON "property_followups" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_followups_assigned" ON "property_followups" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_followups_person" ON "property_followups" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_rental_followups_open_due" ON "rental_followups" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_rental_followups_assigned" ON "rental_followups" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_rental_followups_person" ON "rental_followups" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "property_followups" ADD CONSTRAINT "property_followups_status" CHECK ("property_followups"."status" in ('open', 'done', 'cancelled'));--> statement-breakpoint
ALTER TABLE "property_followups" ADD CONSTRAINT "property_followups_priority" CHECK ("property_followups"."priority" in ('low', 'normal', 'high', 'urgent'));--> statement-breakpoint
ALTER TABLE "rental_followups" ADD CONSTRAINT "rental_followups_status" CHECK ("rental_followups"."status" in ('open', 'done', 'cancelled'));--> statement-breakpoint
ALTER TABLE "rental_followups" ADD CONSTRAINT "rental_followups_priority" CHECK ("rental_followups"."priority" in ('low', 'normal', 'high', 'urgent'));--> statement-breakpoint
-- Follow-ups recorded before tasks existed: one without a date, or whose date
-- has passed, is history and becomes done; a future one stays an open task.
UPDATE "property_followups" SET "status" = 'done', "completed_at" = coalesce("scheduled_at", "created_at") WHERE "scheduled_at" IS NULL OR "scheduled_at" < now();--> statement-breakpoint
UPDATE "rental_followups" SET "status" = 'done', "completed_at" = coalesce("scheduled_at", "created_at") WHERE "scheduled_at" IS NULL OR "scheduled_at" < now();--> statement-breakpoint
UPDATE "property_followups" SET "updated_at" = "created_at";--> statement-breakpoint
UPDATE "rental_followups" SET "updated_at" = "created_at";
