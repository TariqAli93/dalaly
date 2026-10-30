import {
  addMoney,
  compareMoney,
  parseMoney,
  percentOf,
  subtractMoney,
} from "../../shared/money.js";

/**
 * Commissions, free of the database. A commission is the office's income
 * from a deal: a fixed amount, or a percentage of the deal's agreed price
 * (never the price itself). Employees' shares are fixed amounts or
 * percentages of the commission, together no more than it; the office keeps
 * the rest. Everything is exact (bigint minor units, half-up rounding).
 */

export const PAYER_ROLES = ["client", "owner"] as const;
export type PayerRole = (typeof PAYER_ROLES)[number];
export const SHARE_BASES = ["fixed", "percent"] as const;
export type ShareBasis = (typeof SHARE_BASES)[number];

export type Share = {
  basis: ShareBasis;
  /** A percentage ("2.5"), for "percent". */
  rate?: string | null;
  /** A decimal amount, for "fixed". */
  amount?: string | null;
};

const RATE = /^(\d{1,3})(?:\.(\d{1,4}))?$/;

/** A rate above 0 and at most 100, or null. */
export function parseRate(rate: string | null | undefined) {
  const text = rate?.trim() ?? "";
  if (!RATE.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const tenThousandths =
    BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  return tenThousandths > 0n && tenThousandths <= 1_000_000n ? text : null;
}

/**
 * A share's amount of `base`: its fixed amount, or its rate of `base`.
 * Returns an Arabic error instead when the share cannot give a positive
 * amount.
 */
export function shareAmount(
  share: Share,
  base: string | null,
  what: string,
): { amount: string } | { error: string } {
  if (share.basis === "percent") {
    const rate = parseRate(share.rate);
    if (!rate)
      return { error: `نسبة ${what} بين 0 و100 بأربع منازل على الأكثر.` };
    if (!base) return { error: `لا مبلغ تُحسب منه نسبة ${what}.` };
    const amount = percentOf(base, rate);
    if (compareMoney(amount, "0.00") <= 0)
      return { error: `نسبة ${what} من ${base} لا تبلغ فلساً.` };
    return { amount };
  }
  const amount = parseMoney(share.amount);
  if (amount === null || compareMoney(amount, "0.00") <= 0)
    return { error: `مبلغ ${what} رقم موجب بمنزلتين عشريتين على الأكثر.` };
  return { amount };
}

/**
 * Employees' shares of a commission, each exact; together no more than the
 * commission. Returns their amounts or an Arabic error.
 */
export function splitAmounts(
  commission: string,
  shares: Array<Share & { userId: number }>,
): { amounts: string[] } | { error: string } {
  const users = new Set<number>();
  const amounts: string[] = [];
  for (const share of shares) {
    if (users.has(share.userId))
      return { error: "للموظف حصة واحدة من العمولة." };
    users.add(share.userId);
    const result = shareAmount(share, commission, "حصة الموظف");
    if ("error" in result) return result;
    amounts.push(result.amount);
  }
  const total = amounts.length ? addMoney(...amounts) : "0.00";
  if (compareMoney(total, commission) > 0)
    return {
      error: `حصص الموظفين ${total} أكبر من العمولة ${commission}.`,
    };
  return { amounts };
}

/** What is left to collect or pay: the amount less what was settled. */
export const outstanding = (amount: string, settled: string) =>
  subtractMoney(amount, settled);

/** Why an allocation of `amount` to something with `left` outstanding fails. */
export function allocationError(amount: string, left: string, what: string) {
  if (compareMoney(left, "0.00") <= 0) return `${what} مسدد بالكامل.`;
  if (compareMoney(amount, left) > 0)
    return `المبلغ ${amount} أكبر من المتبقي من ${what} (${left}).`;
  return null;
}
