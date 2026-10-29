import assert from "node:assert/strict";
import test from "node:test";
import {
  accountChangeError,
  normalSide,
  subtreeIds,
  type AccountShape,
  type ChartAccount,
} from "../src/modules/accounting/accounting.rules.js";
import { DEFAULT_ACCOUNTS } from "../src/modules/accounting/default-chart.js";

const node = (patch: Partial<ChartAccount> & { id: number }): ChartAccount => ({
  code: String(patch.id),
  accountType: "expense",
  parentId: null,
  currency: null,
  isPostable: false,
  isActive: true,
  systemKey: null,
  ...patch,
});
// 1 expenses (heading) > 2 office (heading) > 3 rent IQD (posting); 4 a USD heading.
const chart = [
  node({ id: 1 }),
  node({ id: 2, parentId: 1 }),
  node({ id: 3, parentId: 2, currency: "IQD", isPostable: true }),
  node({ id: 4, parentId: 1, currency: "USD" }),
];
const shape = (account: ChartAccount, patch: Partial<AccountShape> = {}): AccountShape => ({
  code: account.code,
  accountType: account.accountType,
  parentId: account.parentId,
  currency: account.currency,
  isPostable: account.isPostable,
  isActive: account.isActive,
  ...patch,
});
const fresh = (patch: Partial<AccountShape>): AccountShape => ({
  code: "9",
  accountType: "expense",
  parentId: 2,
  currency: "IQD",
  isPostable: true,
  isActive: true,
  ...patch,
});

test("assets and expenses sit on the debit side, the rest on the credit side", () => {
  assert.deepEqual(
    (["asset", "liability", "equity", "revenue", "expense"] as const).map(normalSide),
    ["debit", "credit", "credit", "credit", "debit"],
  );
});

test("a new account goes under an active heading of its type and currency", () => {
  assert.equal(accountChangeError(chart, null, fresh({})), null);
  assert.equal(accountChangeError(chart, null, fresh({ parentId: null })), null);
  assert.match(accountChangeError(chart, null, fresh({ currency: null }))!, /عملة واحدة/);
  assert.equal(accountChangeError(chart, null, fresh({ currency: null, isPostable: false })), null, "a heading spans both");
  assert.match(accountChangeError(chart, null, fresh({ parentId: 3 }))!, /حساب ترحيل/);
  assert.match(accountChangeError(chart, null, fresh({ accountType: "asset" }))!, /من نوع/);
  assert.match(accountChangeError(chart, null, fresh({ parentId: 4 }))!, /بعملة حسابه الأب/);
  assert.equal(accountChangeError(chart, null, fresh({ parentId: 4, currency: "USD" })), null);
  assert.match(accountChangeError(chart, null, fresh({ parentId: 99 }))!, /غير موجود/);
  const stopped = chart.map((a) => (a.id === 2 ? { ...a, isActive: false } : a));
  assert.match(accountChangeError(stopped, null, fresh({}))!, /موقوف/);
  assert.match(accountChangeError(stopped, null, fresh({ isActive: false }))!, /موقوف/, "not even a stopped one");
});

test("a heading cannot go under itself or its own children", () => {
  assert.deepEqual([...subtreeIds(chart, 1)].sort(), [1, 2, 3, 4]);
  assert.deepEqual([...subtreeIds(chart, 2)].sort(), [2, 3]);
  assert.match(accountChangeError(chart, chart[0], shape(chart[0], { parentId: 2 }))!, /تحت نفسه/);
  assert.match(accountChangeError(chart, chart[1], shape(chart[1], { parentId: 2 }))!, /تحت نفسه/);
  assert.equal(accountChangeError(chart, chart[1], shape(chart[1], { parentId: null })), null);
  // A USD heading takes only USD accounts: not one spanning both, nor one holding IQD.
  assert.match(accountChangeError(chart, chart[1], shape(chart[1], { parentId: 4 }))!, /بعملة حسابه الأب/);
  assert.match(accountChangeError(chart, chart[1], shape(chart[1], { parentId: 4, currency: "USD" }))!, /عملات الحسابات الفرعية/);
});

test("a heading with children keeps its kind, and stops after them", () => {
  const office = chart[1];
  assert.match(accountChangeError(chart, office, shape(office, { isPostable: true, currency: "IQD" }))!, /يبقى حساباً رئيسياً/);
  assert.match(accountChangeError(chart, office, shape(office, { accountType: "asset" }))!, /لا يتغير نوعه/);
  assert.match(accountChangeError(chart, office, shape(office, { currency: "USD" }))!, /عملات الحسابات الفرعية/);
  assert.equal(accountChangeError(chart, office, shape(office, { currency: "IQD" })), null);
  assert.match(accountChangeError(chart, office, shape(office, { isActive: false }))!, /أوقف الحسابات الفرعية/);
  const rentStopped = chart.map((a) => (a.id === 3 ? { ...a, isActive: false } : a));
  assert.equal(accountChangeError(rentStopped, office, shape(office, { isActive: false })), null);
});

test("an account under a stopped heading stays stopped until the heading is active", () => {
  const stopped = chart.map((a) => (a.id === 2 ? { ...a, isActive: false } : a.id === 3 ? { ...a, isActive: false } : a));
  const rent = stopped[2];
  assert.equal(accountChangeError(stopped, rent, shape(rent, { code: "301" })), null, "a stopped account can still be edited");
  assert.match(accountChangeError(stopped, rent, shape(rent, { isActive: true }))!, /فعّله أولاً/);
});

test("a default account changes only its name; one with lines keeps its kind", () => {
  const cash = node({ id: 5, accountType: "asset", currency: "IQD", isPostable: true, systemKey: "cash.IQD" });
  const all = [...chart, cash];
  assert.equal(accountChangeError(all, cash, shape(cash)), null);
  for (const patch of [{ code: "6" }, { currency: "USD" as const }, { isActive: false }, { parentId: 1 }, { accountType: "expense" as const }, { isPostable: false }])
    assert.match(accountChangeError(all, cash, shape(cash, patch))!, /الدليل الأساسي/, JSON.stringify(patch));
  const rent = chart[2];
  assert.match(accountChangeError(chart, rent, shape(rent, { currency: "USD" }), { hasLines: true })!, /على الحساب قيود/);
  assert.equal(accountChangeError(chart, rent, shape(rent, { code: "33" }), { hasLines: true }), null);
});

test("the default chart: unique codes and keys, each account after its heading, of its type", () => {
  const keys = new Map(DEFAULT_ACCOUNTS.map((account, index) => [account.systemKey, { account, index }]));
  assert.equal(keys.size, DEFAULT_ACCOUNTS.length);
  assert.equal(new Set(DEFAULT_ACCOUNTS.map((account) => account.code)).size, DEFAULT_ACCOUNTS.length);
  DEFAULT_ACCOUNTS.forEach((account, index) => {
    assert.match(account.code, /^[0-9]{1,10}$/);
    assert.equal(account.isPostable, account.currency !== null, account.systemKey);
    if (!account.parentKey) return;
    const parent = keys.get(account.parentKey);
    assert.ok(parent && parent.index < index, `${account.systemKey} after ${account.parentKey}`);
    assert.equal(parent.account.accountType, account.accountType);
    assert.equal(parent.account.isPostable, false);
    assert.ok(account.code.startsWith(parent.account.code), account.code);
  });
  for (const key of ["cash", "bank", "client_funds", "brokerage_income", "commission_expense"])
    assert.deepEqual(
      DEFAULT_ACCOUNTS.filter((account) => account.parentKey === key).map((account) => account.currency),
      ["IQD", "USD"],
      key,
    );
});
