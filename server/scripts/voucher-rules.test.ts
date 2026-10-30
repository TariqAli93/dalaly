import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYMENT_PURPOSES,
  RECEIPT_PURPOSES,
  purposeOf,
  voucherAccountsError,
  voucherLines,
  type VoucherAccount,
  type VoucherDraft,
} from "../src/modules/accounting/vouchers.rules.js";

const account = (patch: Partial<VoucherAccount> & { id: number }): VoucherAccount => ({
  code: String(patch.id),
  accountType: "asset",
  currency: "IQD",
  isPostable: true,
  isActive: true,
  headingKeys: [],
  ...patch,
});
const cash = account({ id: 1, code: "1101", headingKeys: ["cash", "assets"] });
const bank = account({ id: 2, code: "1201", headingKeys: ["bank", "assets"] });
const income = account({ id: 3, code: "4101", accountType: "revenue", headingKeys: ["brokerage_income", "revenue"] });
const held = account({ id: 4, code: "2101", accountType: "liability", headingKeys: ["client_funds", "liabilities"] });
const rent = account({ id: 5, code: "5203", accountType: "expense", headingKeys: ["operating_expenses", "expenses"] });
const draft = (patch: Partial<VoucherDraft>): VoucherDraft => ({
  kind: "receipt",
  purpose: "commission",
  currency: "IQD",
  money: cash,
  other: income,
  ...patch,
});

test("each purpose names a default account of a fitting type", () => {
  for (const purpose of Object.values({ ...RECEIPT_PURPOSES, ...PAYMENT_PURPOSES }))
    assert.ok(purpose.types.length && purpose.key);
  assert.equal(purposeOf("receipt", "commission")?.key, "brokerage_income");
  assert.equal(purposeOf("payment", "commission")?.key, "commission_expense");
  assert.equal(purposeOf("receipt", "expense"), null, "an expense is paid, not received");
  assert.equal(purposeOf("payment", "capital"), null);
});

test("a commission is income; money held for a seller is never income", () => {
  assert.equal(voucherAccountsError(draft({})), null);
  assert.equal(voucherAccountsError(draft({ purpose: "client_funds", other: held })), null);
  assert.match(voucherAccountsError(draft({ purpose: "client_funds", other: income }))!, /لا يناسب غرض السند/);
  assert.match(voucherAccountsError(draft({ purpose: "commission", other: held }))!, /لا يناسب/);
});

test("the money side is an active cash or bank account of the voucher's currency", () => {
  assert.equal(voucherAccountsError(draft({ money: bank })), null);
  assert.match(voucherAccountsError(draft({ money: income }))!, /ليس صندوقاً ولا مصرفاً/);
  assert.match(voucherAccountsError(draft({ money: { ...cash, currency: "USD" } }))!, /بعملة غير عملة السند/);
  assert.match(voucherAccountsError(draft({ money: { ...cash, isActive: false } }))!, /موقوف/);
  assert.match(voucherAccountsError(draft({ money: null }))!, /غير موجود/);
});

test("the other side is a posting account of the same currency, not cash or bank", () => {
  assert.match(voucherAccountsError(draft({ other: { ...income, currency: "USD" } }))!, /لا تحويل بين العملات/);
  assert.match(voucherAccountsError(draft({ other: { ...income, isPostable: false } }))!, /حساب رئيسي/);
  assert.match(voucherAccountsError(draft({ purpose: "receivable", other: bank }))!, /تحويل نقدي/);
  assert.equal(voucherAccountsError(draft({ kind: "payment", purpose: "expense", other: rent })), null);
  assert.match(voucherAccountsError(draft({ kind: "payment", purpose: "expense", other: income }))!, /لا يناسب/);
  assert.match(voucherAccountsError(draft({ kind: "payment", purpose: "other_income" }))!, /غير معروف/);
});

test("a receipt debits the money; a payment credits it", () => {
  assert.deepEqual(voucherLines("receipt", "100.00", 1, 3), [
    { accountId: 1, debit: "100.00", credit: "0.00" },
    { accountId: 3, debit: "0.00", credit: "100.00" },
  ]);
  assert.deepEqual(voucherLines("payment", "100.00", 1, 5), [
    { accountId: 5, debit: "100.00", credit: "0.00" },
    { accountId: 1, debit: "0.00", credit: "100.00" },
  ]);
});
