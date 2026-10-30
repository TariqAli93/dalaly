-- Lease payments (Phase 5b): rent collected against a lease's installments,
-- its deposit and the landlord's payouts are client-funds vouchers naming
-- the lease (and, for rent, the installment); a lease can be ended early
-- (terminated: installments due after its date are released) or renewed (a
-- new lease naming the one it renews). Additive: nullable columns, checks,
-- indexes; the status check is widened (dropped and added again). The
-- leases_guard trigger is replaced to allow exactly these changes: active to
-- cancelled, terminated or renewed, and renewed back to active when its
-- renewal is cancelled. Terms and schedules still never change.
ALTER TABLE "leases" DROP CONSTRAINT "leases_status";--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "termination_date" date;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "termination_reason" text;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "terminated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "terminated_by" bigint;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "renewed_from_id" bigint;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "lease_id" bigint;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "lease_installment_id" bigint;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_terminated_by_users_id_fk" FOREIGN KEY ("terminated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_renewed_from_id_leases_id_fk" FOREIGN KEY ("renewed_from_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_lease_installment_id_lease_installments_id_fk" FOREIGN KEY ("lease_installment_id") REFERENCES "public"."lease_installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_leases_renewed_from" ON "leases" USING btree ("renewed_from_id") WHERE "leases"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "idx_vouchers_lease" ON "vouchers" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_lease_installment" ON "vouchers" USING btree ("lease_installment_id");--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_termination" CHECK (("leases"."status" = 'terminated') = ("leases"."termination_date" is not null and "leases"."termination_reason" is not null and "leases"."terminated_at" is not null));--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_renewal" CHECK ("leases"."renewed_from_id" is null or "leases"."renewed_from_id" <> "leases"."id");--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_status" CHECK ("leases"."status" in ('active', 'terminated', 'renewed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_lease" CHECK (("vouchers"."lease_id" is null or "vouchers"."purpose" = 'client_funds') and ("vouchers"."lease_installment_id" is null or ("vouchers"."lease_id" is not null and "vouchers"."kind" = 'receipt')));--> statement-breakpoint
CREATE OR REPLACE FUNCTION leases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
    OR (OLD.cancelled_by IS NOT NULL AND NEW.cancelled_by IS NULL)
    OR (OLD.terminated_by IS NOT NULL AND NEW.terminated_by IS NULL) THEN
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
  IF OLD.status IN ('cancelled', 'terminated') THEN
    RAISE EXCEPTION 'الإيجار % منتهٍ؛ لا يتغير.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF NOT (
      (OLD.status = 'active' AND NEW.status IN ('cancelled', 'terminated', 'renewed'))
      OR (OLD.status = 'renewed' AND NEW.status = 'active'))
    OR (to_jsonb(NEW) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by',
          'termination_date', 'termination_reason', 'terminated_at', 'terminated_by'])
      IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by',
          'termination_date', 'termination_reason', 'terminated_at', 'terminated_by'])
  THEN
    RAISE EXCEPTION 'الإيجار % لا يُعدَّل؛ ألغه أو أنهه أو جدّده.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
