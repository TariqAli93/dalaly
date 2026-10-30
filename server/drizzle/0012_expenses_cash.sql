-- Expenses and cash (Phase 4e): expense categories (the expense account of
-- each currency), a voucher's category, transfers between cash and bank
-- accounts, and reconciliations of a count or a bank statement against the
-- books. Additive: three tables, a nullable column and a check on vouchers,
-- and a wider list of journal entry sources (with "reconciliation").
-- Transfers change only by being voided; reconciliations never change.
-- vouchers_guard is replaced to compare whole rows (to_jsonb), so a column
-- added later is fixed too without replacing it again. A restore passes the
-- triggers (dalaly.ledger_restore, 0009).
CREATE TABLE "cash_reconciliations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"account_id" bigint NOT NULL,
	"statement_date" date NOT NULL,
	"statement_balance" numeric(18, 2) NOT NULL,
	"book_balance" numeric(18, 2) NOT NULL,
	"difference" numeric(18, 2) NOT NULL,
	"adjustment_entry_id" bigint,
	"notes" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_reconciliations_code_unique" UNIQUE("code"),
	CONSTRAINT "cash_reconciliations_difference" CHECK ("cash_reconciliations"."difference" = "cash_reconciliations"."statement_balance" - "cash_reconciliations"."book_balance")
);
--> statement-breakpoint
CREATE TABLE "cash_transfers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"transfer_date" date NOT NULL,
	"currency" text NOT NULL,
	"from_account_id" bigint NOT NULL,
	"to_account_id" bigint NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"journal_entry_id" bigint NOT NULL,
	"void_entry_id" bigint,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" bigint,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_transfers_code_unique" UNIQUE("code"),
	CONSTRAINT "cash_transfers_currency" CHECK ("cash_transfers"."currency" in ('IQD', 'USD')),
	CONSTRAINT "cash_transfers_amount" CHECK ("cash_transfers"."amount" > 0),
	CONSTRAINT "cash_transfers_accounts" CHECK ("cash_transfers"."from_account_id" <> "cash_transfers"."to_account_id"),
	CONSTRAINT "cash_transfers_status" CHECK ("cash_transfers"."status" in ('posted', 'voided')),
	CONSTRAINT "cash_transfers_void" CHECK (("cash_transfers"."status" = 'voided') = ("cash_transfers"."void_entry_id" is not null and "cash_transfers"."voided_at" is not null and "cash_transfers"."void_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"iqd_account_id" bigint,
	"usd_account_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "expense_categories_account" CHECK ("expense_categories"."iqd_account_id" is not null or "expense_categories"."usd_account_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_source";--> statement-breakpoint
ALTER TABLE "vouchers" ADD COLUMN "expense_category_id" bigint;--> statement-breakpoint
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_adjustment_entry_id_journal_entries_id_fk" FOREIGN KEY ("adjustment_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_reconciliations" ADD CONSTRAINT "cash_reconciliations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_void_entry_id_journal_entries_id_fk" FOREIGN KEY ("void_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_iqd_account_id_accounts_id_fk" FOREIGN KEY ("iqd_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_usd_account_id_accounts_id_fk" FOREIGN KEY ("usd_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cash_reconciliations_account" ON "cash_reconciliations" USING btree ("account_id","statement_date");--> statement-breakpoint
CREATE INDEX "idx_cash_transfers_date" ON "cash_transfers" USING btree ("transfer_date","id");--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_expense_category_id_expense_categories_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vouchers_expense_category" ON "vouchers" USING btree ("expense_category_id");--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_source" CHECK ("journal_entries"."source_type" in ('manual', 'reversal', 'receipt', 'payment', 'commission', 'expense', 'transfer', 'lease', 'reconciliation'));--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_expense_category" CHECK ("vouchers"."expense_category_id" is null or ("vouchers"."kind" = 'payment' and "vouchers"."purpose" = 'expense'));

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
    OR (to_jsonb(NEW) - ARRAY['status', 'void_entry_id', 'void_reason', 'voided_at', 'voided_by'])
      IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'void_entry_id', 'void_reason', 'voided_at', 'voided_by'])
  THEN
    RAISE EXCEPTION 'السند % صادر فلا يُعدَّل؛ ألغه وأصدر غيره.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION cash_transfers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'التحويل % لا يُحذف؛ يُلغى بقيد عكسي.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'posted' THEN
      RAISE EXCEPTION 'يُسجَّل التحويل مرحَّلاً.' USING ERRCODE = 'DL001';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
    OR (OLD.voided_by IS NOT NULL AND NEW.voided_by IS NULL) THEN
    RAISE EXCEPTION 'لهذا المستخدم تحويلات باسمه؛ أوقفه بدل حذفه.' USING ERRCODE = 'DL001';
  END IF;
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'التحويل % ملغى؛ لا يتغير.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF NEW.status <> 'voided'
    OR (to_jsonb(NEW) - ARRAY['status', 'void_entry_id', 'void_reason', 'voided_at', 'voided_by'])
      IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'void_entry_id', 'void_reason', 'voided_at', 'voided_by'])
  THEN
    RAISE EXCEPTION 'التحويل % مسجل فلا يُعدَّل؛ ألغه وسجّل غيره.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER cash_transfers_guard BEFORE INSERT OR UPDATE OR DELETE ON cash_transfers
  FOR EACH ROW EXECUTE FUNCTION cash_transfers_guard();
--> statement-breakpoint
CREATE FUNCTION cash_reconciliations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'لهذا المستخدم مطابقات باسمه؛ أوقفه بدل حذفه.' USING ERRCODE = 'DL001';
  END IF;
  RAISE EXCEPTION 'المطابقة % سجل ثابت؛ لا تُعدَّل ولا تُحذف.', OLD.code USING ERRCODE = 'DL001';
END
$$;
--> statement-breakpoint
CREATE TRIGGER cash_reconciliations_guard BEFORE UPDATE OR DELETE ON cash_reconciliations
  FOR EACH ROW EXECUTE FUNCTION cash_reconciliations_guard();
