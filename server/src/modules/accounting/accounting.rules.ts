import type { Currency } from "../../shared/money.js";

/**
 * The chart of accounts' rules, free of the database so they can be tested
 * alone. An account is a heading (groups others, takes no postings) or a
 * posting account (takes journal lines, in exactly one currency). A heading
 * may span both currencies; anything under a heading with a currency is in
 * that currency. Nothing is ever converted between IQD and USD.
 */

export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** The side an account's balance normally sits on. */
export const normalSide = (type: AccountType): "debit" | "credit" =>
  type === "asset" || type === "expense" ? "debit" : "credit";

export type ChartAccount = {
  id: number;
  code: string;
  accountType: AccountType;
  parentId: number | null;
  currency: Currency | null;
  isPostable: boolean;
  isActive: boolean;
  systemKey: string | null;
};

/** The fields of an account the rules look at, as a save would leave them. */
export type AccountShape = Pick<
  ChartAccount,
  "code" | "accountType" | "parentId" | "currency" | "isPostable" | "isActive"
>;

/** What else refers to an account. Journal lines arrive with the ledger. */
export type AccountUsage = { hasLines: boolean };

/** The account and every account under it, by id. */
export function subtreeIds(chart: ChartAccount[], rootId: number) {
  const children = new Map<number, number[]>();
  for (const account of chart)
    if (account.parentId !== null)
      children.set(account.parentId, [
        ...(children.get(account.parentId) ?? []),
        account.id,
      ]);
  const ids = new Set<number>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return ids;
}

/**
 * Why `next` cannot be saved, or null. `current` is the account as it is
 * stored (null for a new one); `chart` is every account, including it.
 */
export function accountChangeError(
  chart: ChartAccount[],
  current: ChartAccount | null,
  next: AccountShape,
  usage: AccountUsage = { hasLines: false },
): string | null {
  if (current?.systemKey) {
    const fixed =
      next.code !== current.code ||
      next.accountType !== current.accountType ||
      next.parentId !== current.parentId ||
      next.currency !== current.currency ||
      next.isPostable !== current.isPostable ||
      !next.isActive;
    if (fixed)
      return "هذا حساب من الدليل الأساسي يعتمد عليه النظام؛ يُعدَّل اسمه ووصفه فقط.";
  }

  if (next.isPostable && !next.currency)
    return "حساب الترحيل بعملة واحدة: اختر الدينار أو الدولار.";

  const children = current
    ? chart.filter((account) => account.parentId === current.id)
    : [];
  if (current && children.length) {
    if (next.isPostable)
      return "تحت هذا الحساب حسابات فرعية، فيبقى حساباً رئيسياً.";
    if (next.accountType !== current.accountType)
      return "تحت هذا الحساب حسابات فرعية؛ لا يتغير نوعه.";
    if (
      next.currency &&
      children.some((child) => child.currency !== next.currency)
    )
      return "عملات الحسابات الفرعية تختلف عن هذه العملة.";
    if (!next.isActive && children.some((child) => child.isActive))
      return "أوقف الحسابات الفرعية أولاً.";
  }

  if (current && usage.hasLines) {
    if (
      next.accountType !== current.accountType ||
      next.currency !== current.currency ||
      next.isPostable !== current.isPostable
    )
      return "على الحساب قيود؛ لا يتغير نوعه ولا عملته ولا كونه حساب ترحيل.";
  }

  if (next.parentId !== null) {
    const parent = chart.find((account) => account.id === next.parentId);
    if (!parent) return "الحساب الأب غير موجود.";
    if (current && subtreeIds(chart, current.id).has(parent.id))
      return "لا يوضع الحساب تحت نفسه أو تحت أحد حساباته الفرعية.";
    if (parent.isPostable)
      return "الحساب الأب حساب ترحيل؛ اختر حساباً رئيسياً.";
    if (parent.accountType !== next.accountType)
      return "الحساب الفرعي من نوع حسابه الأب.";
    if (parent.currency && parent.currency !== next.currency)
      return "الحساب الفرعي بعملة حسابه الأب.";
    // Under a stopped heading an account can only stay, and stay stopped.
    if (!parent.isActive && (next.isActive || current?.parentId !== parent.id))
      return "الحساب الأب موقوف؛ فعّله أولاً.";
  }
  return null;
}
