import {
  compareMoney,
  fromMinor,
  toMinor,
  type Currency,
} from "../../shared/money.js";
import { isMoneyAccount, type VoucherAccount } from "./vouchers.rules.js";

/**
 * Cash and bank, free of the database. A transfer moves money between two
 * cash or bank accounts of one currency; nothing is converted between IQD
 * and USD. A reconciliation compares what an account holds (a count, a bank
 * statement) with the books on a date; a difference may be posted as a
 * shortage (an expense) or an overage (other income). An expense category
 * names the expense account of each currency an expense goes to.
 */

/** Why money cannot move from `from` to `to`, or null. */
export function transferError(
  from: VoucherAccount | null,
  to: VoucherAccount | null,
  currency: Currency,
): string | null {
  for (const [account, side] of [
    [from, "المحوَّل منه"],
    [to, "المحوَّل إليه"],
  ] as const) {
    if (!account) return `الحساب ${side} غير موجود.`;
    if (!isMoneyAccount(account) || !account.isPostable)
      return `الحساب ${account.code} ليس صندوقاً ولا مصرفاً.`;
    if (!account.isActive) return `الحساب ${account.code} موقوف.`;
    if (account.currency !== currency)
      return `الحساب ${account.code} بعملة غير عملة التحويل؛ لا تحويل بين العملات.`;
  }
  if (from!.id === to!.id) return "التحويل بين حسابين مختلفين.";
  return null;
}

/** What a count or statement shows less what the books hold, exactly. */
export const reconciliationDifference = (statement: string, book: string) =>
  fromMinor(toMinor(statement) - toMinor(book));

/**
 * The entry that brings the books to what was counted: an overage credits
 * other income, a shortage debits the expense account. None when equal.
 */
export function adjustmentLines(
  difference: string,
  moneyAccountId: number,
  overageAccountId: number,
  shortageAccountId: number,
) {
  const sign = compareMoney(difference, "0.00");
  if (sign === 0) return null;
  const amount = difference.replace(/^-/, "");
  const zero = "0.00";
  return sign > 0
    ? [
        { accountId: moneyAccountId, debit: amount, credit: zero },
        { accountId: overageAccountId, debit: zero, credit: amount },
      ]
    : [
        { accountId: shortageAccountId, debit: amount, credit: zero },
        { accountId: moneyAccountId, debit: zero, credit: amount },
      ];
}

/** Why `account` cannot be an expense category's account in `currency`. */
export function categoryAccountError(
  account: VoucherAccount | null,
  currency: Currency,
): string | null {
  if (!account) return "الحساب غير موجود.";
  if (account.accountType !== "expense" || !account.isPostable)
    return `الحساب ${account.code} ليس حساب مصروفات للترحيل.`;
  if (!account.isActive) return `الحساب ${account.code} موقوف.`;
  if (account.currency !== currency)
    return `الحساب ${account.code} ليس بعملة ${currency === "IQD" ? "الدينار" : "الدولار"}.`;
  return null;
}
