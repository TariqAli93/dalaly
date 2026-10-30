-- Leases (Phase 5a): a lease in force and its schedule. Additive: two
-- tables. A lease is activated from an issued rent contract (keeping the
-- revision it read) or entered by hand; its terms and its installments
-- never change, and a mistake is cancelled. One live lease per contract.
-- Links to customers, the listing and the contract are set null only by a
-- restore, which puts them back (dalaly.ledger_restore, 0009); otherwise the
-- triggers refuse it, so a customer, listing or contract with a lease is
-- not deleted.
CREATE TABLE "lease_installments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lease_id" bigint NOT NULL,
	"seq" integer NOT NULL,
	"due_date" date NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	CONSTRAINT "lease_installments_amount" CHECK ("lease_installments"."amount" > 0),
	CONSTRAINT "lease_installments_seq" CHECK ("lease_installments"."seq" > 0),
	CONSTRAINT "lease_installments_period" CHECK ("lease_installments"."period_end" >= "lease_installments"."period_start")
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"agreement_id" bigint,
	"agreement_revision" integer,
	"rental_id" bigint,
	"landlord_person_id" bigint,
	"tenant_person_id" bigint,
	"currency" text NOT NULL,
	"rent_amount" numeric(18, 2) NOT NULL,
	"frequency" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"deposit" numeric(18, 2),
	"office_collects" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" bigint,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leases_code_unique" UNIQUE("code"),
	CONSTRAINT "leases_currency" CHECK ("leases"."currency" in ('IQD', 'USD')),
	CONSTRAINT "leases_rent" CHECK ("leases"."rent_amount" > 0),
	CONSTRAINT "leases_deposit" CHECK ("leases"."deposit" is null or "leases"."deposit" >= 0),
	CONSTRAINT "leases_frequency" CHECK ("leases"."frequency" in ('monthly', 'quarterly', 'semi_annual', 'annual')),
	CONSTRAINT "leases_dates" CHECK ("leases"."end_date" > "leases"."start_date"),
	CONSTRAINT "leases_status" CHECK ("leases"."status" in ('active', 'cancelled')),
	CONSTRAINT "leases_cancel" CHECK (("leases"."status" = 'cancelled') = ("leases"."cancelled_at" is not null and "leases"."cancel_reason" is not null)),
	CONSTRAINT "leases_agreement_revision" CHECK ("leases"."agreement_id" is null or "leases"."agreement_revision" is not null),
	CONSTRAINT "leases_parties" CHECK ("leases"."landlord_person_id" is null or "leases"."tenant_person_id" is null or "leases"."landlord_person_id" <> "leases"."tenant_person_id")
);
--> statement-breakpoint
ALTER TABLE "lease_installments" ADD CONSTRAINT "lease_installments_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_landlord_person_id_people_id_fk" FOREIGN KEY ("landlord_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_person_id_people_id_fk" FOREIGN KEY ("tenant_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lease_installments_seq" ON "lease_installments" USING btree ("lease_id","seq");--> statement-breakpoint
CREATE INDEX "idx_lease_installments_due" ON "lease_installments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_leases_rental" ON "leases" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX "idx_leases_landlord" ON "leases" USING btree ("landlord_person_id");--> statement-breakpoint
CREATE INDEX "idx_leases_tenant" ON "leases" USING btree ("tenant_person_id");--> statement-breakpoint
CREATE INDEX "idx_leases_dates" ON "leases" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_leases_agreement_live" ON "leases" USING btree ("agreement_id") WHERE "leases"."status" <> 'cancelled';--> statement-breakpoint
CREATE FUNCTION leases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'عقد الإيجار % لا يُحذف؛ يُلغى.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'يُفعَّل الإيجار ساري المفعول.' USING ERRCODE = 'DL001';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
    OR (OLD.cancelled_by IS NOT NULL AND NEW.cancelled_by IS NULL) THEN
    RAISE EXCEPTION 'لهذا المستخدم عقود إيجار باسمه؛ أوقفه بدل حذفه.' USING ERRCODE = 'DL001';
  END IF;
  IF (OLD.landlord_person_id IS NOT NULL AND NEW.landlord_person_id IS NULL)
    OR (OLD.tenant_person_id IS NOT NULL AND NEW.tenant_person_id IS NULL) THEN
    RAISE EXCEPTION 'لهذا الزبون عقود إيجار؛ لا يُحذف.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.rental_id IS NOT NULL AND NEW.rental_id IS NULL THEN
    RAISE EXCEPTION 'لهذا العرض عقود إيجار؛ أرشفه بدل حذفه.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.agreement_id IS NOT NULL AND NEW.agreement_id IS NULL THEN
    RAISE EXCEPTION 'لهذا العقد إيجار مفعَّل؛ لا يُحذف.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'الإيجار % ملغى؛ لا يتغير.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF NEW.status <> 'cancelled'
    OR (to_jsonb(NEW) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by'])
      IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by'])
  THEN
    RAISE EXCEPTION 'الإيجار % لا يُعدَّل؛ ألغه وفعّل غيره.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER leases_guard BEFORE INSERT OR UPDATE OR DELETE ON leases
  FOR EACH ROW EXECUTE FUNCTION leases_guard();
--> statement-breakpoint
CREATE FUNCTION lease_installments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'جدول أقساط الإيجار لا يتغير؛ يُلغى الإيجار ويُفعَّل غيره.' USING ERRCODE = 'DL001';
END
$$;
--> statement-breakpoint
CREATE TRIGGER lease_installments_guard BEFORE UPDATE OR DELETE ON lease_installments
  FOR EACH ROW EXECUTE FUNCTION lease_installments_guard();
