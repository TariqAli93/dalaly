import type {
  DocumentSortKey,
  FollowupType,
  ListSortOption,
  PersonSortKey,
  PurchaseRequestSortKey,
} from "../types";

// الترتيب الافتراضي للجداول المقسّمة في الخادم، وهو ترتيب القوائم الكاملة نفسه.
export const PEOPLE_DEFAULT_SORT: ListSortOption<PersonSortKey> = {
  value: "updated",
  title: "آخر تحديث",
  key: "updated_at",
  order: "desc",
};
// مشترك بين طلبات الإيجار والشراء (مفاتيح الشراء جزء من مفاتيح الإيجار).
export const REQUESTS_DEFAULT_SORT: ListSortOption<PurchaseRequestSortKey> = {
  value: "updated",
  title: "آخر تحديث",
  key: "updated_at",
  order: "desc",
};
export const DOCUMENTS_DEFAULT_SORT: ListSortOption<DocumentSortKey> = {
  value: "newest",
  title: "الأحدث",
  key: "uploaded_at",
  order: "desc",
};

/** عدد الأشخاص في قائمة الاختيار المبحوثة في الخادم (PersonPicker). */
export const PERSON_PICKER_SIZE = 20;

export function personStatusLabel(value: string) {
  return (
    (
      { active: "نشط", inactive: "غير نشط", archived: "مؤرشف" } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}

/** أنواع المتابعة كما يقبلها الخادم، للعروض والإيجارات معاً. */
export const FOLLOWUP_TYPES: Array<{
  title: string;
  value: FollowupType;
  icon: string;
}> = [
  { title: "اتصال هاتفي", value: "phone_call", icon: "mdi-phone" },
  { title: "اجتماع", value: "meeting", icon: "mdi-account-group" },
  { title: "معاينة", value: "visit", icon: "mdi-home-search" },
  { title: "تفاوض", value: "negotiation", icon: "mdi-handshake" },
  { title: "أخرى", value: "other", icon: "mdi-note-text-outline" },
];

export function followupTypeLabel(value: string) {
  return FOLLOWUP_TYPES.find((item) => item.value === value)?.title ?? value;
}
export function followupTypeIcon(value: string) {
  return (
    FOLLOWUP_TYPES.find((item) => item.value === value)?.icon ??
    "mdi-note-text-outline"
  );
}

/** حالات طلبات الشراء والإيجار (الخادم: open / matched / closed / archived). */
export const REQUEST_STATUSES = [
  { title: "مفتوح", value: "open" },
  { title: "تمت المطابقة", value: "matched" },
  { title: "مغلق", value: "closed" },
];

export function requestStatusLabel(value: string) {
  if (value === "archived") return "مؤرشف";
  return REQUEST_STATUSES.find((item) => item.value === value)?.title ?? value;
}

/** لون شريحة حالة الطلب: المفتوح يحتاج عملاً، والبقية استقرّت. */
export function requestStatusColor(value: string) {
  return value === "open" ? "primary" : undefined;
}
