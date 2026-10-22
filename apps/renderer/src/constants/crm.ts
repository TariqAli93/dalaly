import type {
  DocumentSortKey,
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
