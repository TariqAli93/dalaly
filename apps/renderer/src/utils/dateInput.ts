import { normalizeDigits } from "./digits";

/**
 * ما يكتبه المستخدم في حقل تاريخ أو وقت (DateField) وقيمته المخزّنة، بالصيغ
 * نفسها التي كان يعطيها <input type="date|time|month">: "YYYY-MM-DD" و"HH:MM"
 * و"YYYY-MM". يُقبل أي فاصل (/ - . مسافة) والأرقام العربية الهندية؛ اليوم أولاً
 * ما لم يكن الجزء الأول سنة من أربعة أرقام.
 */
export type DateInputKind = "date" | "time" | "month";

const pad = (value: number, length = 2) => String(value).padStart(length, "0");
const year = (part: string) => {
  const value = Number(part);
  return part.length <= 2 ? 2000 + value : value;
};

/** القيمة المخزّنة، أو "" لنص فارغ، أو null لنص لا يكوّن قيمة صحيحة. */
export function parseDateInput(text: string, kind: DateInputKind) {
  const clean = normalizeDigits(text ?? "").trim();
  if (!clean) return "";
  const parts = clean.split(/[\s/\-.:،,]+/).filter(Boolean);
  if (parts.some((part) => !/^\d+$/.test(part))) return null;

  if (kind === "time") {
    let [hours, minutes] = parts;
    // «1030» أو «930» بلا فاصل.
    if (parts.length === 1 && /^\d{3,4}$/.test(hours)) {
      minutes = hours.slice(-2);
      hours = hours.slice(0, -2);
    }
    if (parts.length > 2 || minutes === undefined) return null;
    const h = Number(hours);
    const m = Number(minutes);
    if (h > 23 || m > 59 || minutes.length !== 2) return null;
    return `${pad(h)}:${pad(m)}`;
  }

  if (kind === "month") {
    if (parts.length !== 2) return null;
    const [first, second] = parts;
    const [y, m] =
      first.length === 4
        ? [Number(first), Number(second)]
        : [year(second), Number(first)];
    if (m < 1 || m > 12 || y < 1900 || y > 2999) return null;
    return `${y}-${pad(m)}`;
  }

  if (parts.length !== 3) return null;
  const [first, second, third] = parts;
  const [y, m, d] =
    first.length === 4
      ? [Number(first), Number(second), Number(third)]
      : [year(third), Number(second), Number(first)];
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return null;
  // Day 0 of the next month is the last day of this one.
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** القيمة المخزّنة كما تُعرض في الحقل: 02/11/2026، 09:30، 11/2026. */
export function formatDateInput(
  value: string | null | undefined,
  kind: DateInputKind,
) {
  if (!value) return "";
  if (kind === "time") return value.slice(0, 5);
  const [y, m, d] = value.split("-");
  if (kind === "month") return m && y ? `${m}/${y}` : value;
  return y && m && d ? `${d.slice(0, 2)}/${m}/${y}` : value;
}

/** هل القيمة ضمن الحدود؟ النصوص بصيغة ISO تُقارن ترتيبياً. */
export function withinBounds(value: string, min?: string, max?: string) {
  return (!min || value >= min) && (!max || value <= max);
}
