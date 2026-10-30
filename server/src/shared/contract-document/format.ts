/**
 * Formatting for contract values: Latin digits throughout (as in the rest of
 * Dalaly), amounts with thousands separators, and amounts in Arabic words
 * the way Iraqi contracts write them ("فقط ... دينار عراقي لا غير").
 */
import { CURRENCY_LABELS, type Currency } from "./model.js";

const GROUPED = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatAmount(value: number) {
  return GROUPED.format(value);
}

export function formatMoney(value: number, currency: Currency) {
  return `${GROUPED.format(value)} ${CURRENCY_LABELS[currency]}`;
}

/** YYYY-MM-DD → 2026/10/26; anything else → null. */
export function formatContractDate(value: string | null | undefined) {
  const parts = parseDate(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

export function parseDate(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (date.getUTCMonth() !== parts[1] - 1) return null;
  return parts;
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The same day `months` later; the 31st becomes the month's last day. */
export function addMonths(value: string, months: number) {
  const parts = parseDate(value);
  if (!parts) return null;
  const [year, month, day] = parts;
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(target);
}

/** Whole days from start to end (end exclusive). */
export function daysBetween(start: string, end: string) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return null;
  return Math.round(
    (Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) /
      86_400_000,
  );
}

/**
 * Whole months from start to end when end falls on the same day of a later
 * month (or the day before it, the usual way a lease is written), else null.
 */
export function wholeMonthsBetween(start: string, end: string) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return null;
  const months = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  for (const candidate of [months, months + 1]) {
    if (candidate <= 0) continue;
    const exact = addMonths(start, candidate);
    if (!exact) continue;
    const dayBefore = toIsoDate(
      new Date(Date.UTC(...dateParts(exact)) - 86_400_000),
    );
    if (exact === end || dayBefore === end) return candidate;
  }
  return null;
}

function dateParts(value: string): [number, number, number] {
  const [year, month, day] = parseDate(value)!;
  return [year, month - 1, day];
}

function plural(
  count: number,
  one: string,
  two: string,
  few: string,
  many: string,
) {
  if (count === 1) return one;
  if (count === 2) return two;
  if (count % 100 >= 3 && count % 100 <= 10) return `${count} ${few}`;
  return `${count} ${many}`;
}

/** "سنة واحدة"، "6 أشهر"، "سنة و6 أشهر"، أو "45 يوماً". */
export function formatDuration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const months = wholeMonthsBetween(start, end);
  if (months !== null) {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    const parts = [];
    // "سنة واحدة" alone, but "سنة و6 أشهر" together.
    const both = Boolean(years && rest);
    if (years)
      parts.push(
        plural(years, both ? "سنة" : "سنة واحدة", "سنتان", "سنوات", "سنة"),
      );
    if (rest)
      parts.push(
        plural(rest, both ? "شهر" : "شهر واحد", "شهران", "أشهر", "شهراً"),
      );
    return parts.join(" و");
  }
  const days = daysBetween(start, end);
  if (days === null || days <= 0) return null;
  return plural(days, "يوم واحد", "يومان", "أيام", "يوماً");
}

// ─── Amounts in words ───────────────────────────────────────────────────

const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];
const HUNDREDS = [
  "",
  "مئة",
  "مئتان",
  "ثلاثمئة",
  "أربعمئة",
  "خمسمئة",
  "ستمئة",
  "سبعمئة",
  "ثمانمئة",
  "تسعمئة",
];
/** [one, two, plural (3–10), accusative (11–99)] */
const SCALES: Array<[string, string, string, string]> = [
  ["", "", "", ""],
  ["ألف", "ألفان", "آلاف", "ألفاً"],
  ["مليون", "مليونان", "ملايين", "مليوناً"],
  ["مليار", "ملياران", "مليارات", "ملياراً"],
  ["ترليون", "ترليونان", "ترليونات", "ترليوناً"],
  ["كوادريليون", "كوادريليونان", "كوادريليونات", "كوادريليوناً"],
];

function belowThousand(value: number) {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]!);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]!);
    else {
      const ones = rest % 10;
      const tens = TENS[Math.floor(rest / 10)]!;
      parts.push(ones ? `${ONES[ones]} و${tens}` : tens);
    }
  }
  return parts.join(" و");
}

function scaled(count: number, scale: number) {
  if (scale === 0) return belowThousand(count);
  const [one, two, few, many] = SCALES[scale]!;
  if (count === 1) return one;
  if (count === 2) return two;
  const tail = count % 100;
  const word = tail >= 3 && tail <= 10 ? few : tail >= 11 ? many : one;
  return `${belowThousand(count)} ${word}`;
}

/** A whole number in Arabic words; "صفر" for zero. */
export function numberToArabicWords(value: number) {
  let rest = Math.floor(Math.abs(value));
  if (!rest) return "صفر";
  const groups: string[] = [];
  let scale = 0;
  while (rest > 0 && scale < SCALES.length) {
    const group = rest % 1000;
    if (group) groups.unshift(scaled(group, scale));
    rest = Math.floor(rest / 1000);
    scale += 1;
  }
  return groups.join(" و");
}

const MINOR_UNITS: Record<Currency, [string, string, string]> = {
  // [one/eleven+, three to ten, accusative eleven+]
  IQD: ["فلس", "فلوس", "فلساً"],
  USD: ["سنت", "سنتات", "سنتاً"],
};

/**
 * An exact amount ("1500000.50") in words, read from its digits rather than
 * a JavaScript number, so a sixteen-digit amount keeps every unit:
 * "فقط مليون وخمسمئة ألف دينار عراقي وخمسون فلساً لا غير". Fils or cents
 * only when not zero.
 */
export function decimalAmountInWords(amount: string, currency: Currency) {
  const [whole = "0", fraction = ""] = amount.trim().split(".");
  const digits = whole.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
  const groups: string[] = [];
  for (let end = digits.length, scale = 0; end > 0; end -= 3, scale += 1) {
    const group = Number(digits.slice(Math.max(0, end - 3), end));
    if (group) groups.unshift(scaled(group, scale));
  }
  const words = groups.length ? groups.join(" و") : "صفر";
  const minor = Number(`${fraction}00`.slice(0, 2));
  const [one, few, many] = MINOR_UNITS[currency];
  const unit = minor >= 3 && minor <= 10 ? few : minor >= 11 ? many : one;
  const cents = minor ? ` و${belowThousand(minor)} ${unit}` : "";
  return `فقط ${words} ${CURRENCY_LABELS[currency]}${cents} لا غير`;
}

/** "فقط مئة وخمسون مليون دينار عراقي لا غير". */
export function amountInWords(value: number, currency: Currency) {
  return `فقط ${numberToArabicWords(value)} ${CURRENCY_LABELS[currency]} لا غير`;
}

const ORDINALS = [
  "",
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
];
const ORDINAL_UNITS = [
  "",
  "الحادي",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
];
const ORDINAL_TENS = [
  "",
  "",
  "العشرون",
  "الثلاثون",
  "الأربعون",
  "الخمسون",
  "الستون",
  "السبعون",
  "الثمانون",
  "التسعون",
];

/** 1 → "الأول"، 11 → "الحادي عشر"، 21 → "الحادي والعشرون". */
export function arabicOrdinal(value: number) {
  if (value <= 0) return String(value);
  if (value <= 10) return ORDINALS[value]!;
  if (value < 20) return `${ORDINAL_UNITS[value - 10]} عشر`;
  if (value < 100) {
    const units = value % 10;
    const tens = ORDINAL_TENS[Math.floor(value / 10)]!;
    return units ? `${ORDINAL_UNITS[units]} و${tens}` : tens;
  }
  return String(value);
}
