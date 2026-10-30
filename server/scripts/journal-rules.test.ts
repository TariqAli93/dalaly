import assert from "node:assert/strict";
import test from "node:test";
import type { ChartAccount } from "../src/modules/accounting/accounting.rules.js";
import {
  entryError,
  entryTotals,
  periodOf,
  reversalLines,
  type EntryDraft,
} from "../src/modules/accounting/journal.rules.js";

const account = (patch: Partial<ChartAccount> & { id: number }): ChartAccount => ({
  code: String(1100 + patch.id),
  accountType: "asset",
  parentId: null,
  currency: "IQD",
  isPostable: true,
  isActive: true,
  systemKey: null,
  ...patch,
});
const chart = new Map(
  [
    account({ id: 1 }), // cash IQD
    account({ id: 2, accountType: "revenue" }), // income IQD
    account({ id: 3, currency: "USD" }), // cash USD
    account({ id: 4, isPostable: false, currency: null }), // a heading
    account({ id: 5, isActive: false }), // stopped
  ].map((row) => [row.id, row]),
);
const draft = (patch: Partial<EntryDraft> = {}): EntryDraft => ({
  entryDate: "2026-10-29",
  currency: "IQD",
  lines: [
    { accountId: 1, debit: "1500000.50", credit: "0.00" },
    { accountId: 2, debit: "0.00", credit: "1500000.50" },
  ],
  ...patch,
});
const posting = { posting: true };

test("a balanced entry in posting accounts of its currency posts", () => {
  assert.equal(entryError(draft(), chart, new Set(), posting), null);
  assert.deepEqual(entryTotals(draft().lines), { debit: "1500000.50", credit: "1500000.50" });
});

test("totals are exact where floating point is not", () => {
  const lines = [
    { accountId: 1, debit: "0.10", credit: "0.00" },
    { accountId: 1, debit: "0.20", credit: "0.00" },
    { accountId: 2, debit: "0.00", credit: "0.30" },
  ];
  assert.equal(0.1 + 0.2 === 0.3, false);
  assert.equal(entryError(draft({ lines }), chart, new Set(), posting), null);
  const large = [
    { accountId: 1, debit: "9999999999999999.99", credit: "0.00" },
    { accountId: 2, debit: "0.00", credit: "9999999999999999.99" },
  ];
  assert.equal(entryError(draft({ lines: large }), chart, new Set(), posting), null);
});

test("an unbalanced entry is refused for posting but kept as a draft", () => {
  const lines = [
    { accountId: 1, debit: "100.00", credit: "0.00" },
    { accountId: 2, debit: "0.00", credit: "99.99" },
  ];
  assert.match(entryError(draft({ lines }), chart, new Set(), posting)!, /غير متوازن: المدين 100.00 والدائن 99.99/);
  assert.equal(entryError(draft({ lines }), chart, new Set(), { posting: false }), null);
});

test("each line is one side, in an active posting account of the entry's currency", () => {
  const line = (patch: object) => draft({ lines: [{ accountId: 1, debit: "1.00", credit: "0.00", ...patch }, { accountId: 2, debit: "0.00", credit: "1.00" }] });
  assert.match(entryError(line({ credit: "1.00" }), chart, new Set(), posting)!, /السطر 1: مبلغ في المدين أو في الدائن/);
  assert.match(entryError(line({ debit: "0.00" }), chart, new Set(), posting)!, /السطر 1/);
  assert.match(entryError(line({ accountId: 3 }), chart, new Set(), posting)!, /لا تحويل بين العملات/);
  assert.match(entryError(line({ accountId: 4 }), chart, new Set(), posting)!, /حساب رئيسي/);
  assert.match(entryError(line({ accountId: 5 }), chart, new Set(), posting)!, /موقوف/);
  assert.match(entryError(line({ accountId: 99 }), chart, new Set(), posting)!, /غير موجود/);
  assert.match(entryError(line({ accountId: 3 }), chart, new Set(), { posting: false })!, /لا تحويل/, "a draft keeps to one currency too");
  assert.match(entryError(draft({ lines: draft().lines.slice(0, 1) }), chart, new Set(), posting)!, /سطران على الأقل/);
});

test("a closed month takes no postings; drafts may wait in it", () => {
  assert.equal(periodOf("2026-10-29"), "2026-10");
  const closed = new Set(["2026-10"]);
  assert.match(entryError(draft(), chart, closed, posting)!, /الشهر 2026-10 مقفل/);
  assert.equal(entryError(draft(), chart, closed, { posting: false }), null);
  assert.equal(entryError(draft({ entryDate: "2026-11-01" }), chart, closed, posting), null);
  assert.match(entryError(draft({ entryDate: "29/10/2026" }), chart, new Set(), posting)!, /YYYY-MM-DD/);
});

test("a reversal swaps every line's side and keeps the rest", () => {
  const lines = [
    { accountId: 1, debit: "5.00", credit: "0.00", memo: "x" },
    { accountId: 2, debit: "0.00", credit: "5.00", memo: null },
  ];
  assert.deepEqual(reversalLines(lines), [
    { accountId: 1, debit: "0.00", credit: "5.00", memo: "x" },
    { accountId: 2, debit: "5.00", credit: "0.00", memo: null },
  ]);
  assert.equal(entryError(draft({ lines: reversalLines(draft().lines) }), chart, new Set(), posting), null);
});
