import type {
  AccountType,
  Currency,
  JournalSource,
  JournalStatus,
} from "../types";

/** أنواع الحسابات بترتيب الدليل، وجهة رصيدها المعتادة. */
export const ACCOUNT_TYPES: Array<{
  value: AccountType;
  title: string;
  side: "debit" | "credit";
}> = [
  { value: "asset", title: "أصول", side: "debit" },
  { value: "liability", title: "التزامات", side: "credit" },
  { value: "equity", title: "حقوق ملكية", side: "credit" },
  { value: "revenue", title: "إيرادات", side: "credit" },
  { value: "expense", title: "مصروفات", side: "debit" },
];

export function accountTypeLabel(value: string) {
  return ACCOUNT_TYPES.find((type) => type.value === value)?.title ?? value;
}

export const ACCOUNT_CURRENCIES: Array<{ value: Currency; title: string }> = [
  { value: "IQD", title: "دينار عراقي" },
  { value: "USD", title: "دولار أمريكي" },
];

export function accountCurrencyLabel(value: Currency | null) {
  return value
    ? (ACCOUNT_CURRENCIES.find((currency) => currency.value === value)?.title ??
        value)
    : "العملتان";
}

/** من أين جاء القيد: يدوي، أو عكسي، أو من سند وعمولة ومصروف في المراحل التالية. */
export const JOURNAL_SOURCES: Array<{ value: JournalSource; title: string }> = [
  { value: "manual", title: "قيد يدوي" },
  { value: "reversal", title: "قيد عكسي" },
  { value: "receipt", title: "سند قبض" },
  { value: "payment", title: "سند صرف" },
  { value: "commission", title: "عمولة" },
  { value: "expense", title: "مصروف" },
  { value: "transfer", title: "تحويل نقدي" },
  { value: "lease", title: "إيجار" },
];

export function journalSourceLabel(value: string) {
  return (
    JOURNAL_SOURCES.find((source) => source.value === value)?.title ?? value
  );
}

export const JOURNAL_STATUSES: Array<{
  value: JournalStatus;
  title: string;
  color: string;
}> = [
  { value: "draft", title: "مسودة", color: "warning" },
  { value: "posted", title: "مرحَّل", color: "success" },
];

export function journalStatusLabel(value: string) {
  return (
    JOURNAL_STATUSES.find((status) => status.value === value)?.title ?? value
  );
}
export function journalStatusColor(value: string) {
  return (
    JOURNAL_STATUSES.find((status) => status.value === value)?.color ??
    "default"
  );
}
