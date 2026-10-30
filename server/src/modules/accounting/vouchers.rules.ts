import type { Currency } from "../../shared/money.js";
import type { AccountType } from "./accounting.rules.js";

/**
 * Receipts and payments: money into or out of a cash or bank account, the
 * other side on an account its purpose allows. A receipt debits the money
 * account and credits the other; a payment the reverse. The purpose decides
 * what the money is, so it decides the other side's type: the price of a
 * property collected for its seller is client funds (a liability), never
 * office income.
 */

export const VOUCHER_KINDS = ["receipt", "payment"] as const;
export type VoucherKind = (typeof VOUCHER_KINDS)[number];

type Purpose = {
  /** The default account: `${key}.${currency}` in the default chart. */
  key: string;
  /** The types the other side may have when another account is chosen. */
  types: AccountType[];
};

export const RECEIPT_PURPOSES = {
  /** The office's commission or fee: income. */
  commission: { key: "brokerage_income", types: ["revenue"] },
  /** Money held for a landlord or seller (rent, deposit, down payment). */
  client_funds: { key: "client_funds", types: ["liability"] },
  /** A customer settling what they owe the office. */
  receivable: { key: "receivables", types: ["asset"] },
  other_income: { key: "other_income", types: ["revenue"] },
  /** The owner putting money into the office. */
  capital: { key: "capital", types: ["equity"] },
} as const satisfies Record<string, Purpose>;

export const PAYMENT_PURPOSES = {
  /** Handing collected money to its landlord or seller. */
  client_funds: { key: "client_funds", types: ["liability"] },
  /** An employee's commission. */
  commission: { key: "commission_expense", types: ["expense", "liability"] },
  expense: { key: "operating_expenses", types: ["expense"] },
  /** Settling what the office owes. */
  payable: { key: "payables", types: ["liability"] },
  /** The owner taking money out. */
  drawing: { key: "capital", types: ["equity"] },
} as const satisfies Record<string, Purpose>;

export type ReceiptPurpose = keyof typeof RECEIPT_PURPOSES;
export type PaymentPurpose = keyof typeof PAYMENT_PURPOSES;
export type VoucherPurpose = ReceiptPurpose | PaymentPurpose;

export function purposeOf(kind: VoucherKind, purpose: string): Purpose | null {
  const table: Record<string, Purpose> =
    kind === "receipt" ? RECEIPT_PURPOSES : PAYMENT_PURPOSES;
  return table[purpose] ?? null;
}

/** An account as the voucher rules see it, with what it sits under. */
export type VoucherAccount = {
  id: number;
  code: string;
  accountType: AccountType;
  currency: Currency | null;
  isPostable: boolean;
  isActive: boolean;
  /** The system keys of its headings, nearest first ("cash", "assets"). */
  headingKeys: string[];
};

/** Under the default "cash" or "bank" heading. */
export const isMoneyAccount = (account: VoucherAccount) =>
  account.headingKeys.includes("cash") || account.headingKeys.includes("bank");

export type VoucherDraft = {
  kind: VoucherKind;
  purpose: string;
  currency: Currency;
  money: VoucherAccount | null;
  other: VoucherAccount | null;
};

/** Why the voucher's accounts do not fit, or null. */
export function voucherAccountsError(draft: VoucherDraft): string | null {
  const purpose = purposeOf(draft.kind, draft.purpose);
  if (!purpose) return "غرض السند غير معروف.";
  const { money, other, currency } = draft;
  if (!money) return "حساب الصندوق أو المصرف غير موجود.";
  if (!isMoneyAccount(money) || !money.isPostable)
    return `الحساب ${money.code} ليس صندوقاً ولا مصرفاً.`;
  if (!money.isActive) return `الحساب ${money.code} موقوف.`;
  if (money.currency !== currency)
    return `الحساب ${money.code} بعملة غير عملة السند.`;
  if (!other) return "الحساب المقابل غير موجود.";
  if (!other.isPostable)
    return `الحساب ${other.code} حساب رئيسي؛ اختر حساب ترحيل تحته.`;
  if (!other.isActive) return `الحساب ${other.code} موقوف.`;
  if (other.currency !== currency)
    return `الحساب ${other.code} بعملة غير عملة السند؛ لا تحويل بين العملات.`;
  if (isMoneyAccount(other))
    return "النقل بين الصندوق والمصرف تحويل نقدي، لا سند قبض أو صرف.";
  if (!(purpose.types as readonly string[]).includes(other.accountType))
    return `الحساب ${other.code} لا يناسب غرض السند.`;
  return null;
}

/** A deal's two sides, for whom its client funds may be held. */
export type DealParties = {
  clientPersonId: number;
  ownerPersonId: number | null;
};

/**
 * Whose money a client-funds voucher moves. A receipt holds it for the
 * landlord or seller: the one named, else the deal's owner, else the payer.
 * A payment hands out of what is held for the one named, else for the payee,
 * so a deposit can go back to a buyer out of what is held for the seller.
 * On a deal it is held for one of the deal's two sides. Other purposes name
 * no one. Returns the person (or null), or why it does not fit.
 */
export function heldFor(input: {
  kind: VoucherKind;
  purpose: string;
  personId: number | null;
  heldForId: number | null;
  /** A deal's or a lease's two sides. */
  deal: DealParties | null;
  /** What the two sides are of, for the message. */
  subject?: string;
}): { personId: number | null } | { error: string } {
  if (input.purpose !== "client_funds")
    return input.heldForId
      ? { error: "صاحب الأمانة يُحدَّد في سندات أمانات العملاء فقط." }
      : { personId: null };
  const id =
    input.heldForId ??
    (input.kind === "receipt"
      ? (input.deal?.ownerPersonId ?? input.personId)
      : input.personId);
  if (!id)
    return {
      error:
        input.kind === "receipt"
          ? "حدد لمن تُحفظ الأمانة: المالك أو البائع."
          : "أمانات العملاء تُصرف لزبون بعينه: اختر المالك أو البائع.",
    };
  if (
    input.deal &&
    id !== input.deal.clientPersonId &&
    id !== input.deal.ownerPersonId
  )
    return {
      error: `أمانة ${input.subject ?? "الصفقة"} تُحفظ لأحد طرفيها.`,
    };
  return { personId: id };
}

/** The journal lines of a voucher: the money side and the other side. */
export function voucherLines(
  kind: VoucherKind,
  amount: string,
  moneyAccountId: number,
  otherAccountId: number,
) {
  const zero = "0.00";
  return kind === "receipt"
    ? [
        { accountId: moneyAccountId, debit: amount, credit: zero },
        { accountId: otherAccountId, debit: zero, credit: amount },
      ]
    : [
        { accountId: otherAccountId, debit: amount, credit: zero },
        { accountId: moneyAccountId, debit: zero, credit: amount },
      ];
}
