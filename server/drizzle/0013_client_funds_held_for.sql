-- Client funds held for someone (Phase 4f): a client-funds voucher names
-- whose money it is, the landlord or seller, apart from who paid it in or
-- took it out. A tenant's rent or a buyer's deposit is then held for the
-- landlord or seller, and a deposit returned to a buyer comes out of what is
-- held for the seller. Additive: a nullable column with a check, an index,
-- and vouchers_guard replaced to name the column when deleting a person
-- would clear it. Older vouchers keep null: their journal lines already name
-- the person the money is held for.
ALTER TABLE "vouchers" ADD COLUMN "held_for_person_id" bigint;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_held_for_person_id_people_id_fk" FOREIGN KEY ("held_for_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vouchers_held_for" ON "vouchers" USING btree ("held_for_person_id");--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_held_for" CHECK ("vouchers"."held_for_person_id" is null or "vouchers"."purpose" = 'client_funds');--> statement-breakpoint
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
  IF (OLD.person_id IS NOT NULL AND NEW.person_id IS NULL)
    OR (OLD.held_for_person_id IS NOT NULL AND NEW.held_for_person_id IS NULL) THEN
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
