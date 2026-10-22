import type { ListSortOption, PersonSortKey } from "../types";

// الترتيب الافتراضي للجداول المقسّمة في الخادم، وهو ترتيب القوائم الكاملة نفسه.
export const PEOPLE_DEFAULT_SORT: ListSortOption<PersonSortKey> = {
  value: "updated",
  title: "آخر تحديث",
  key: "updated_at",
  order: "desc",
};

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
