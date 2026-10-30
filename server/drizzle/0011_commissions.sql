-- Commissions (Phase 4d): the office's commission on a deal and employees'
-- shares of it, and the allocation of receipts and payments to them.
-- Additive only: two tables, two nullable columns and a check on vouchers.
-- The triggers keep commissions as recorded. Their one allowed change is
-- being cancelled (with its reversing entry, reason, time and user). Shares
-- never change, and the deal or customer a commission names cannot be
-- deleted. A restore passes them (dalaly.ledger_restore, 0009).
-- vouchers_guard is replaced so the new allocation columns are fixed too.
CREATE TABLE "commission_splits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"commission_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"basis" text NOT NULL,
	"rate" numeric(7, 4),
	"amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_splits_basis" CHECK ("commission_splits"."basis" in ('fixed', 'percent')),
	CONSTRAINT "commission_splits_rate" CHECK (("commission_splits"."basis" = 'percent') = ("commission_splits"."rate" is not null)),
	CONSTRAINT "commission_splits_amount" CHECK ("commission_splits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"deal_id" bigint,
	"payer_role" text NOT NULL,
	"payer_person_id" bigint,
	"currency" text NOT NULL,
	"basis" text NOT NULL,
	"rate" numeric(7, 4),
	"base_amount" numeric(18, 2),
	"amount" numeric(18, 2) NOT NULL,
	"commission_date" date NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"journal_entry_id" bigint NOT NULL,
	"cancel_entry_id" bigint,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" bigint,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_code_unique" UNIQUE("code"),
	CONSTRAINT "commissions_payer_role" CHECK ("commissions"."payer_role" in ('client', 'owner')),
	CONSTRAINT "commissions_currency" CHECK ("commissions"."currency" in ('IQD', 'USD')),
	CONSTRAINT "commissions_basis" CHECK ("commissions"."basis" in ('fixed', 'percent')),
	CONSTRAINT "commissions_rate" CHECK (("commissions"."basis" = 'percent') = ("commissions"."rate" is not null and "commissions"."base_amount" is not null)),
	CONSTRAINT "commissions_amount" CHECK ("commissions"."amount" > 0),
	CONSTRAINT "commissions_status" CHECK ("commissions"."status" in ('active', 'cancelled')),
	CONSTRAINT "commissions_cancel" CHECK (("commissions"."status" = 'cancelled') = ("commissions"."cancel_entry_id" is not null and "commissions"."cancelled_at" is not null and "commissions"."cancel_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "commission_id" bigint;--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "commission_split_id" bigint;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_commission_id_commissions_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."commissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_payer_person_id_people_id_fk" FOREIGN KEY ("payer_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_cancel_entry_id_journal_entries_id_fk" FOREIGN KEY ("cancel_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commission_splits_user" ON "commission_splits" USING btree ("commission_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_commission_splits_user" ON "commission_splits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_commissions_deal" ON "commissions" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_commissions_payer" ON "commissions" USING btree ("payer_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commissions_deal_payer" ON "commissions" USING btree ("deal_id","payer_role") WHERE "commissions"."status" = 'active';--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_commission_id_commissions_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."commissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_commission_split_id_commission_splits_id_fk" FOREIGN KEY ("commission_split_id") REFERENCES "public"."commission_splits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vouchers_commission" ON "vouchers" USING btree ("commission_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_commission_split" ON "vouchers" USING btree ("commission_split_id");--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_allocation" CHECK (("vouchers"."commission_id" is null or "vouchers"."kind" = 'receipt') and ("vouchers"."commission_split_id" is null or "vouchers"."kind" = 'payment'));

--> statement-breakpoint
CREATE FUNCTION commissions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'العمولة % لا تُحذف؛ تُلغى بقيد عكسي.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'تُسجَّل العمولة قائمة.' USING ERRCODE = 'DL001';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
    OR (OLD.cancelled_by IS NOT NULL AND NEW.cancelled_by IS NULL) THEN
    RAISE EXCEPTION 'لهذا المستخدم عمولات باسمه؛ أوقفه بدل حذفه.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.payer_person_id IS NOT NULL AND NEW.payer_person_id IS NULL THEN
    RAISE EXCEPTION 'لهذا الزبون عمولات مسجلة؛ لا يُحذف.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.deal_id IS NOT NULL AND NEW.deal_id IS NULL THEN
    RAISE EXCEPTION 'لهذه الصفقة عمولات مسجلة؛ لا تُحذف.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'العمولة % ملغاة؛ لا تتغير.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF NEW.status <> 'cancelled'
    OR (NEW.code, NEW.deal_id, NEW.payer_role, NEW.payer_person_id, NEW.currency,
        NEW.basis, NEW.rate, NEW.base_amount, NEW.amount, NEW.commission_date,
        NEW.description, NEW.journal_entry_id, NEW.created_by, NEW.created_at)
      IS DISTINCT FROM
       (OLD.code, OLD.deal_id, OLD.payer_role, OLD.payer_person_id, OLD.currency,
        OLD.basis, OLD.rate, OLD.base_amount, OLD.amount, OLD.commission_date,
        OLD.description, OLD.journal_entry_id, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'العمولة % مسجلة فلا تُعدَّل؛ ألغها وسجّل غيرها.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER commissions_guard BEFORE INSERT OR UPDATE OR DELETE ON commissions
  FOR EACH ROW EXECUTE FUNCTION commissions_guard();
--> statement-breakpoint
CREATE FUNCTION commission_splits_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'حصص الموظفين من العمولة لا تتغير؛ تُلغى العمولة وتُسجَّل غيرها.' USING ERRCODE = 'DL001';
END
$$;
--> statement-breakpoint
CREATE TRIGGER commission_splits_guard BEFORE UPDATE OR DELETE ON commission_splits
  FOR EACH ROW EXECUTE FUNCTION commission_splits_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vouchers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'السند % لا يُحذف؛ يُلغى بقيد عكسي.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'posted' THEN
      RAISE EXCEPTION 'يُصدر السند مرحَّلاً.' USING ERRCODE = 'DL001';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
    OR (OLD.voided_by IS NOT NULL AND NEW.voided_by IS NULL) THEN
    RAISE EXCEPTION 'لهذا المستخدم سندات باسمه؛ أوقفه بدل حذفه.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.person_id IS NOT NULL AND NEW.person_id IS NULL THEN
    RAISE EXCEPTION 'لهذا الزبون سندات قبض أو صرف؛ لا يُحذف.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.deal_id IS NOT NULL AND NEW.deal_id IS NULL THEN
    RAISE EXCEPTION 'لهذه الصفقة سندات قبض أو صرف؛ لا تُحذف.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'السند % ملغى؛ لا يتغير.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF NEW.status <> 'voided'
    OR (NEW.code, NEW.kind, NEW.voucher_date, NEW.currency, NEW.amount, NEW.purpose,
        NEW.money_account_id, NEW.other_account_id, NEW.person_id, NEW.party_name,
        NEW.deal_id, NEW.description, NEW.reference, NEW.commission_id,
        NEW.commission_split_id, NEW.journal_entry_id, NEW.created_by, NEW.created_at)
      IS DISTINCT FROM
       (OLD.code, OLD.kind, OLD.voucher_date, OLD.currency, OLD.amount, OLD.purpose,
        OLD.money_account_id, OLD.other_account_id, OLD.person_id, OLD.party_name,
        OLD.deal_id, OLD.description, OLD.reference, OLD.commission_id,
        OLD.commission_split_id, OLD.journal_entry_id, OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'السند % صادر فلا يُعدَّل؛ ألغه وأصدر غيره.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
