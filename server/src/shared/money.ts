import { z } from "zod";

/**
 * Money is exact everywhere. SQL keeps it in numeric(18,2); the API sends and
 * receives decimal strings ("1500000.00"); arithmetic here works on bigint
 * minor units (hundredths). A JavaScript number never holds an amount being
 * calculated: 0.1 + 0.2 is not 0.3, and amounts in dinars reach the range
 * where doubles lose whole units.
 */

/** Up to 16 whole digits (numeric(18,2)) and at most two decimals. */
const MONEY_TEXT = /^(\d{1,16})(?:\.(\d{1,2}))?$/;
const SCALE = 100n;

/**
 * An amount as the API stores it ("1234.50"), from a decimal string or a
 * finite number that has at most two decimals; null when it is not one
 * (negative, too many decimals, too large, an exponent, NaN).
 */
export function parseMoney(value: unknown): string | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    text = String(value);
  } else if (typeof value === "string") text = value.trim().replace(/,/g, "");
  else return null;
  const match = MONEY_TEXT.exec(text);
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, "");
  return `${whole}.${(match[2] ?? "").padEnd(2, "0")}`;
}

/** "1234.50" -> 123450n. The value must already be parsed. */
export function toMinor(amount: string): bigint {
  const parsed = parseMoney(amount);
  if (parsed === null) throw new Error(`Not an amount: ${amount}`);
  const [whole, fraction] = parsed.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction);
}

/** 123450n -> "1234.50"; negative minor units keep their sign. */
export function fromMinor(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const absolute = minor < 0n ? -minor : minor;
  const fraction = String(absolute % SCALE).padStart(2, "0");
  return `${sign}${absolute / SCALE}.${fraction}`;
}

export function addMoney(...amounts: string[]) {
  return fromMinor(amounts.reduce((sum, amount) => sum + toMinor(amount), 0n));
}

export function subtractMoney(from: string, amount: string) {
  return fromMinor(toMinor(from) - toMinor(amount));
}

export function compareMoney(a: string, b: string) {
  const difference = toMinor(a) - toMinor(b);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}

/** A percentage rate with up to four decimals ("2.5", "0.125"). */
const RATE_TEXT = /^(\d{1,3})(?:\.(\d{1,4}))?$/;

/**
 * `rate` percent of `amount`, rounded half up to the hundredth: 2.5% of
 * 150,000,000.00 is 3,750,000.00. Exact; the rate is a decimal string.
 */
export function percentOf(amount: string, rate: string) {
  const match = RATE_TEXT.exec(rate.trim());
  if (!match) throw new Error(`Not a rate: ${rate}`);
  const rateUnits =
    BigInt(match[1]) * 10_000n + BigInt((match[2] ?? "").padEnd(4, "0"));
  // minor units * rate in ten-thousandths of a percent / (100 * 10,000)
  const numerator = toMinor(amount) * rateUnits;
  const denominator = 100n * 10_000n;
  return fromMinor((numerator + denominator / 2n) / denominator);
}

const moneyMessage = "المبلغ غير صالح: رقم موجب بمنزلتين عشريتين على الأكثر.";

/** A required amount in a request body, stored as its decimal string. */
export const moneyField = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const parsed = parseMoney(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: moneyMessage });
      return z.NEVER;
    }
    return parsed;
  });

/** An optional amount: missing or null stays null; "" counts as missing. */
export const optionalMoneyField = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = parseMoney(value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: moneyMessage });
      return z.NEVER;
    }
    return parsed;
  });

export const CURRENCIES = ["IQD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
