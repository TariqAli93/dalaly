-- Receipts and payments (Phase 4c): one table of vouchers, each posted to the
-- ledger with it. Additive only. The trigger at the end keeps a voucher as
-- issued: its one allowed change is being voided (status, the reversing
-- entry, reason, time and user, all at once); it is never deleted, and the
-- customer or deal it names cannot be deleted. A restore passes it as it
-- passes the ledger's triggers (dalaly.ledger_restore, 0009).
-- It also replaces 0009's journal_entries_guard so that deleting a user who
-- created or posted entries is refused with its own message (deactivate the
-- user instead) rather than "the entry is posted": who posted stays known.
CREATE TABLE "vouchers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"voucher_date" date NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"purpose" text NOT NULL,
	"money_account_id" bigint NOT NULL,
	"other_account_id" bigint NOT NULL,
	"person_id" bigint,
	"party_name" text NOT NULL,
	"deal_id" bigint,
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
	CONSTRAINT "vouchers_code_unique" UNIQUE("code"),
	CONSTRAINT "vouchers_kind" CHECK ("vouchers"."kind" in ('receipt', 'payment')),
	CONSTRAINT "vouchers_currency" CHECK ("vouchers"."currency" in ('IQD', 'USD')),
	CONSTRAINT "vouchers_amount" CHECK ("vouchers"."amount" > 0),
	CONSTRAINT "vouchers_status" CHECK ("vouchers"."status" in ('posted', 'voided')),
	CONSTRAINT "vouchers_void" CHECK (("vouchers"."status" = 'voided') = ("vouchers"."void_entry_id" is not null and "vouchers"."voided_at" is not null and "vouchers"."void_reason" is not null)),
	CONSTRAINT "vouchers_accounts" CHECK ("vouchers"."money_account_id" <> "vouchers"."other_account_id")
);
--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_money_account_id_accounts_id_fk" FOREIGN KEY ("money_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_other_account_id_accounts_id_fk" FOREIGN KEY ("other_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_void_entry_id_journal_entries_id_fk" FOREIGN KEY ("void_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vouchers_date" ON "vouchers" USING btree ("voucher_date","id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_person" ON "vouchers" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_deal" ON "vouchers" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_money_account" ON "vouchers" USING btree ("money_account_id");

--> statement-breakpoint
CREATE FUNCTION vouchers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  -- Posted: only the void, with nothing else changed.
  IF NEW.status <> 'voided'
    OR (NEW.code, NEW.kind, NEW.voucher_date, NEW.currency, NEW.amount, NEW.purpose,
        NEW.money_account_id, NEW.other_account_id, NEW.person_id, NEW.party_name,
        NEW.deal_id, NEW.description, NEW.reference, NEW.journal_entry_id,
        NEW.created_by, NEW.created_at)
      IS DISTINCT FROM
       (OLD.code, OLD.kind, OLD.voucher_date, OLD.currency, OLD.amount, OLD.purpose,
        OLD.money_account_id, OLD.other_account_id, OLD.person_id, OLD.party_name,
        OLD.deal_id, OLD.description, OLD.reference, OLD.journal_entry_id,
        OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'السند % صادر فلا يُعدَّل؛ ألغه وأصدر غيره.', OLD.code USING ERRCODE = 'DL001';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER vouchers_guard BEFORE INSERT OR UPDATE OR DELETE ON vouchers
  FOR EACH ROW EXECUTE FUNCTION vouchers_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION journal_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL)
      OR (OLD.posted_by IS NOT NULL AND NEW.posted_by IS NULL)
      OR (OLD.updated_by IS NOT NULL AND NEW.updated_by IS NULL) THEN
      RAISE EXCEPTION 'لهذا المستخدم قيود مرحَّلة باسمه؛ أوقفه بدل حذفه.' USING ERRCODE = 'DL001';
    END IF;
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
