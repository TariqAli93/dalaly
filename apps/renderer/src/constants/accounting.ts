import type {
  AccountType,
  Currency,
  JournalSource,
  JournalStatus,
  VoucherKind,
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

export const VOUCHER_KINDS: Array<{ value: VoucherKind; title: string }> = [
  { value: "receipt", title: "سند قبض" },
  { value: "payment", title: "سند صرف" },
];
export function voucherKindLabel(value: string) {
  return VOUCHER_KINDS.find((kind) => kind.value === value)?.title ?? value;
}

/**
 * أغراض السندات كما يعرّفها الخادم (vouchers.rules.ts): الغرض يحدد الحساب
 * المقابل. مال البائع أو المؤجر أمانة لا إيراد؛ العمولة وحدها إيراد المكتب.
 */
export const VOUCHER_PURPOSES: Record<
  VoucherKind,
  Array<{ value: string; title: string; hint: string; types: AccountType[] }>
> = {
  receipt: [
    {
      value: "commission",
      title: "عمولة المكتب",
      hint: "إيراد المكتب من الصفقة.",
      types: ["revenue"],
    },
    {
      value: "client_funds",
      title: "أمانة لحساب مالك أو بائع",
      hint: "عربون أو إيجار أو ثمن يُحفظ لصاحبه؛ ليس إيراداً للمكتب.",
      types: ["liability"],
    },
    {
      value: "receivable",
      title: "تسديد دين زبون",
      hint: "زبون يسدد ما عليه للمكتب.",
      types: ["asset"],
    },
    {
      value: "other_income",
      title: "إيراد آخر",
      hint: "إيراد لا علاقة له بالعمولات.",
      types: ["revenue"],
    },
    {
      value: "capital",
      title: "رأس مال",
      hint: "مال يضعه صاحب المكتب.",
      types: ["equity"],
    },
  ],
  payment: [
    {
      value: "client_funds",
      title: "تسليم أمانة لمالك أو بائع",
      hint: "بحدود ما قُبض لحسابه فقط.",
      types: ["liability"],
    },
    {
      value: "commission",
      title: "عمولة موظف",
      hint: "حصة موظف من العمولة.",
      types: ["expense", "liability"],
    },
    {
      value: "expense",
      title: "مصروف",
      hint: "إيجار المكتب ورواتب وخدمات وغيرها.",
      types: ["expense"],
    },
    {
      value: "payable",
      title: "تسديد دين على المكتب",
      hint: "مبلغ مستحق على المكتب.",
      types: ["liability"],
    },
    {
      value: "drawing",
      title: "سحب شخصي",
      hint: "مال يأخذه صاحب المكتب.",
      types: ["equity"],
    },
  ],
};
export function voucherPurposeLabel(kind: string, value: string) {
  return (
    VOUCHER_PURPOSES[kind as VoucherKind]?.find((item) => item.value === value)
      ?.title ?? value
  );
}
