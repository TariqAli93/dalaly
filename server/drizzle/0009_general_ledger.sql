-- General ledger (Phase 4b): journal entries in one currency, their lines,
-- and closed months. Additive only. The triggers at the end make the ledger's
-- history permanent in the database itself, whatever the code does:
--   * an entry is inserted as a draft and posted only when its lines balance,
--     in active posting accounts of its currency, outside a closed month;
--   * a posted entry and its lines never change or go (a reversing entry
--     corrects them); deleting a customer or deal they name is refused;
--   * an account with posted lines keeps its type, currency and kind.
-- A restore replaces whole tables: it sets dalaly.ledger_restore for its own
-- transaction, which these triggers let through. Errors use SQLSTATE DL001
-- with an Arabic message, which the API answers as a 409.
CREATE TABLE "accounting_periods" (
	"period" text PRIMARY KEY NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" bigint,
	"notes" text,
	CONSTRAINT "accounting_periods_period" CHECK ("accounting_periods"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_id" bigint,
	"idempotency_key" text,
	"reversal_of_id" bigint,
	"posted_at" timestamp with time zone,
	"posted_by" bigint,
	"created_by" bigint,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_code_unique" UNIQUE("code"),
	CONSTRAINT "journal_entries_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "journal_entries_reversal_of_id_unique" UNIQUE("reversal_of_id"),
	CONSTRAINT "journal_entries_status" CHECK ("journal_entries"."status" in ('draft', 'posted')),
	CONSTRAINT "journal_entries_currency" CHECK ("journal_entries"."currency" in ('IQD', 'USD')),
	CONSTRAINT "journal_entries_source" CHECK ("journal_entries"."source_type" in ('manual', 'reversal', 'receipt', 'payment', 'commission', 'expense', 'transfer', 'lease')),
	CONSTRAINT "journal_entries_reversal" CHECK (("journal_entries"."reversal_of_id" is null) = ("journal_entries"."source_type" <> 'reversal')),
	CONSTRAINT "journal_entries_posted" CHECK (("journal_entries"."status" = 'posted') = ("journal_entries"."posted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"line_no" integer NOT NULL,
	"account_id" bigint NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"person_id" bigint,
	"deal_id" bigint,
	"memo" text,
	CONSTRAINT "journal_lines_amounts" CHECK ("journal_lines"."debit" >= 0 and "journal_lines"."credit" >= 0 and ("journal_lines"."debit" > 0) <> ("journal_lines"."credit" > 0))
);
--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_journal_entries_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_journal_entries_date" ON "journal_entries" USING btree ("entry_date","id");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_source" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_journal_lines_entry_line" ON "journal_lines" USING btree ("entry_id","line_no");--> statement-breakpoint
CREATE INDEX "idx_journal_lines_account" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_journal_lines_person" ON "journal_lines" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_journal_lines_deal" ON "journal_lines" USING btree ("deal_id");

--> statement-breakpoint
CREATE FUNCTION ledger_restoring() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('dalaly.ledger_restore', true), '') = 'on'
$$;
--> statement-breakpoint
CREATE FUNCTION journal_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  line_count integer;
  total_debit numeric;
  total_credit numeric;
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'القيد % مرحَّل فلا يُحذف؛ صحّحه بقيد عكسي.', OLD.code USING ERRCODE = 'DL001';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'القيد % مرحَّل فلا يُعدَّل؛ صحّحه بقيد عكسي.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  IF NEW.status = 'posted' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'يُنشأ القيد مسودة ويُرحَّل بعد إضافة سطوره.' USING ERRCODE = 'DL001';
    END IF;
    IF EXISTS (SELECT 1 FROM accounting_periods WHERE period = to_char(NEW.entry_date, 'YYYY-MM')) THEN
      RAISE EXCEPTION 'الشهر % مقفل؛ لا يُرحَّل إليه قيد.', to_char(NEW.entry_date, 'YYYY-MM') USING ERRCODE = 'DL001';
    END IF;
    SELECT count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
      INTO line_count, total_debit, total_credit
      FROM journal_lines WHERE entry_id = NEW.id;
    IF line_count < 2 OR total_debit = 0 OR total_debit <> total_credit THEN
      RAISE EXCEPTION 'القيد % غير متوازن.', NEW.code USING ERRCODE = 'DL001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.entry_id = NEW.id
        AND (NOT a.is_postable OR NOT a.is_active OR a.currency IS DISTINCT FROM NEW.currency)
    ) THEN
      RAISE EXCEPTION 'في القيد % حساب ليس حساب ترحيل فعّالاً بعملة القيد.', NEW.code USING ERRCODE = 'DL001';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_entries_guard();
--> statement-breakpoint
CREATE FUNCTION journal_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM journal_entries WHERE id = OLD.entry_id AND status = 'posted') THEN
    -- A customer or deal being deleted sets its links to null.
    IF TG_OP = 'UPDATE' AND OLD.person_id IS NOT NULL AND NEW.person_id IS NULL THEN
      RAISE EXCEPTION 'لهذا الزبون قيود مرحَّلة في الدفاتر؛ لا يُحذف.' USING ERRCODE = 'DL001';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.deal_id IS NOT NULL AND NEW.deal_id IS NULL THEN
      RAISE EXCEPTION 'لهذه الصفقة قيود مرحَّلة في الدفاتر؛ لا تُحذف.' USING ERRCODE = 'DL001';
    END IF;
    RAISE EXCEPTION 'سطور القيد المرحَّل لا تتغير.' USING ERRCODE = 'DL001';
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM journal_entries WHERE id = NEW.entry_id AND status = 'posted') THEN
    RAISE EXCEPTION 'سطور القيد المرحَّل لا تتغير.' USING ERRCODE = 'DL001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER journal_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION journal_lines_guard();
--> statement-breakpoint
CREATE FUNCTION accounts_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_restoring() THEN RETURN NEW; END IF;
  IF (NEW.account_type, NEW.currency, NEW.is_postable) IS DISTINCT FROM (OLD.account_type, OLD.currency, OLD.is_postable)
    AND EXISTS (
      SELECT 1 FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.account_id = OLD.id AND e.status = 'posted'
    ) THEN
    RAISE EXCEPTION 'على الحساب % قيود مرحَّلة؛ لا يتغير نوعه ولا عملته ولا كونه حساب ترحيل.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER accounts_ledger_guard BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_ledger_guard();
