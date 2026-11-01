import { todayIso } from "./format";

/**
 * فترات جاهزة لصفحتي الحسابات والتقارير: تنتهي كلها اليوم (أو آخر الشهر
 * الماضي)، فلا يُفتح منتقي التاريخ للحالات المعتادة. «منذ البداية» بداية
 * ثابتة أقدم من أي بيانات للمكتب؛ الخادم يفترض بداية السنة إن غابت.
 */
export type PeriodKey = "month" | "last-month" | "year" | "all";

export const PERIOD_PRESETS: Array<{ value: PeriodKey; title: string }> = [
  { value: "month", title: "هذا الشهر" },
  { value: "last-month", title: "الشهر الماضي" },
  { value: "year", title: "هذه السنة" },
  { value: "all", title: "منذ البداية" },
];

export const EARLIEST_DATE = "2000-01-01";

export function periodRange(
  key: PeriodKey,
  today = todayIso(),
): { from: string; to: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const pad = (value: number) => String(value).padStart(2, "0");
  switch (key) {
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last-month": {
      const lastYear = month === 1 ? year - 1 : year;
      const last = month === 1 ? 12 : month - 1;
      // Day 0 of this month is the last day of the previous one.
      const days = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
      return {
        from: `${lastYear}-${pad(last)}-01`,
        to: `${lastYear}-${pad(last)}-${pad(days)}`,
      };
    }
    case "year":
      return { from: `${year}-01-01`, to: today };
    case "all":
      return { from: EARLIEST_DATE, to: today };
  }
}

/** The preset a from/to pair is, or null for a custom range. */
export function periodKeyOf(
  range: { from: string; to: string },
  today = todayIso(),
): PeriodKey | null {
  return (
    PERIOD_PRESETS.find((preset) => {
      const presetRange = periodRange(preset.value, today);
      return presetRange.from === range.from && presetRange.to === range.to;
    })?.value ?? null
  );
}
