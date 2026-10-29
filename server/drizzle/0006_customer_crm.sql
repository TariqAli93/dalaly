-- Customer CRM (Phase 2b): what the office deals with a customer as, how
-- they came, and the employee who looks after them. Additive only.
ALTER TABLE "people" ADD COLUMN "roles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "assigned_user_id" bigint;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_people_assigned" ON "people" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_people_roles" ON "people" USING gin ("roles");--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_roles" CHECK ("people"."roles" <@ ARRAY['buyer', 'seller', 'tenant', 'landlord', 'owner', 'investor', 'other']::text[]);--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_source" CHECK ("people"."source" is null or "people"."source" in ('walk_in', 'phone', 'referral', 'social', 'listing_ad', 'other'));