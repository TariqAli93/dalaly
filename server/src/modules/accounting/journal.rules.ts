import {
  compareMoney,
  fromMinor,
  toMinor,
  type Currency,
} from "../../shared/money.js";
import type { ChartAccount } from "./accounting.rules.js";

/**
 * The general ledger's rules, free of the database. An entry is in one
 * currency; each line debits or credits one posting account of that currency
 * with a positive amount; the debits equal the credits. A posted entry never
 * changes: a mistake is corrected by a reversing entry. A closed month takes
 * no postings. The database enforces the same with triggers (0009).
 */

export type EntryLine = {
  accountId: number;
  /** Decimal strings ("1500.00"); exactly one of them is above zero. */
  debit: string;
  credit: string;
};

export type EntryDraft = {
  entryDate: string;
  currency: Currency;
  lines: EntryLine[];
};

/** "2026-10-29" -> "2026-10". */
export const periodOf = (date: string) => date.slice(0, 7);

/** Total debits and credits of the lines, exactly. */
export function entryTotals(lines: EntryLine[]) {
  let debit = 0n;
  let credit = 0n;
  for (const line of lines) {
    debit += toMinor(line.debit);
    credit += toMinor(line.credit);
  }
  return { debit: fromMinor(debit), credit: fromMinor(credit) };
}

/**
 * Why `draft` cannot be saved, or null. `chart` has every account the lines
 * name; `closed` holds the closed months ("YYYY-MM"). A draft may be
 * unbalanced and dated in a closed month; `posting` checks those too.
 */
export function entryError(
  draft: EntryDraft,
  chart: Map<number, ChartAccount>,
  closed: Set<string>,
  { posting }: { posting: boolean },
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.entryDate))
    return "تاريخ القيد بصيغة YYYY-MM-DD.";
  if (posting && closed.has(periodOf(draft.entryDate)))
    return `الشهر ${periodOf(draft.entryDate)} مقفل؛ لا يُرحَّل إليه قيد.`;
  if (draft.lines.length < 2) return "للقيد سطران على الأقل: مدين ودائن.";
  for (const [index, line] of draft.lines.entries()) {
    const label = `السطر ${index + 1}`;
    const debit = compareMoney(line.debit, "0.00") > 0;
    const credit = compareMoney(line.credit, "0.00") > 0;
    if (debit === credit)
      return `${label}: مبلغ في المدين أو في الدائن، لا فيهما معاً ولا صفر.`;
    const account = chart.get(line.accountId);
    if (!account) return `${label}: الحساب غير موجود.`;
    if (!account.isPostable)
      return `${label}: ${account.code} حساب رئيسي؛ يُرحَّل إلى حساباته الفرعية.`;
    if (!account.isActive) return `${label}: الحساب ${account.code} موقوف.`;
    if (account.currency !== draft.currency)
      return `${label}: الحساب ${account.code} بعملة غير عملة القيد؛ لا تحويل بين العملات.`;
  }
  if (!posting) return null;
  const totals = entryTotals(draft.lines);
  if (compareMoney(totals.debit, totals.credit) !== 0)
    return `القيد غير متوازن: المدين ${totals.debit} والدائن ${totals.credit}.`;
  return null;
}

/** The lines of the entry that reverses one: each side swapped. */
export const reversalLines = <T extends EntryLine>(lines: T[]): T[] =>
  lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
