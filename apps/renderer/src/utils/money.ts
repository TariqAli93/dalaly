/**
 * Exact sums of amounts typed in the journal editor, so the editor's balance
 * agrees with the server's: decimal strings become bigint hundredths, never a
 * JavaScript number (0.1 + 0.2 is not 0.3). The server checks again.
 */

const MONEY_TEXT = /^(\d{1,16})(?:\.(\d{1,2}))?$/;

/** "1,500.5" -> 150050n; empty is zero; anything else is null. */
export function amountToMinor(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0n;
  const text = String(value).trim().replace(/,/g, "");
  if (text === "") return 0n;
  const match = MONEY_TEXT.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/** 150050n -> "1500.50"; keeps a minus sign. */
export function minorToAmount(minor: bigint) {
  const sign = minor < 0n ? "-" : "";
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

/** The sum of amounts, or null when one is not an amount. */
export function sumAmounts(values: Array<string | number | null | undefined>) {
  let total = 0n;
  for (const value of values) {
    const minor = amountToMinor(value);
    if (minor === null) return null;
    total += minor;
  }
  return total;
}
