import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustmentLines,
  categoryAccountError,
  reconciliationDifference,
  transferError,
} from "../src/modules/accounting/cash.rules.js";
import type { VoucherAccount } from "../src/modules/accounting/vouchers.rules.js";

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
const usdBank = account({ id: 3, code: "1202", currency: "USD", headingKeys: ["bank", "assets"] });
const rent = account({ id: 4, code: "5203", accountType: "expense", headingKeys: ["operating_expenses"] });

test("a transfer moves money between two cash or bank accounts of one currency", () => {
  assert.equal(transferError(cash, bank, "IQD"), null);
  assert.match(transferError(cash, usdBank, "IQD")!, /لا تحويل بين العملات/);
  assert.match(transferError(cash, cash, "IQD")!, /حسابين مختلفين/);
  assert.match(transferError(cash, rent, "IQD")!, /ليس صندوقاً ولا مصرفاً/);
  assert.match(transferError({ ...cash, isActive: false }, bank, "IQD")!, /موقوف/);
  assert.match(transferError(null, bank, "IQD")!, /المحوَّل منه غير موجود/);
});

test("a reconciliation's difference is exact, either way", () => {
  assert.equal(reconciliationDifference("1000000.00", "1000250.50"), "-250.50");
  assert.equal(reconciliationDifference("0.30", "0.10"), "0.20");
  assert.equal(reconciliationDifference("-50.00", "0.00"), "-50.00", "an overdrawn statement");
  assert.equal(reconciliationDifference("5.00", "5.00"), "0.00");
});

test("an overage goes to other income, a shortage to expenses, nothing when equal", () => {
  assert.deepEqual(adjustmentLines("125.00", 1, 7, 8), [
    { accountId: 1, debit: "125.00", credit: "0.00" },
    { accountId: 7, debit: "0.00", credit: "125.00" },
  ]);
  assert.deepEqual(adjustmentLines("-250.50", 1, 7, 8), [
    { accountId: 8, debit: "250.50", credit: "0.00" },
    { accountId: 1, debit: "0.00", credit: "250.50" },
  ]);
  assert.equal(adjustmentLines("0.00", 1, 7, 8), null);
});

test("an expense category's account is an active expense posting account of its currency", () => {
  assert.equal(categoryAccountError(rent, "IQD"), null);
  assert.match(categoryAccountError(rent, "USD")!, /بعملة الدولار/);
  assert.match(categoryAccountError(cash, "IQD")!, /ليس حساب مصروفات/);
  assert.match(categoryAccountError({ ...rent, isPostable: false }, "IQD")!, /ليس حساب مصروفات/);
  assert.match(categoryAccountError({ ...rent, isActive: false }, "IQD")!, /موقوف/);
});
