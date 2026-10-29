import type { AccountType, Currency } from "../types";

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
