export type SortOrder = "asc" | "desc";

/** صفحة من قائمة مقسّمة (GET /<domain>/paged). */
export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

/** حقول الصفحة والترتيب المرسلة مع طلب قائمة مقسّمة. */
export type PageQuery<K extends string> = {
  page: number;
  page_size: number;
  sort_by: K;
  sort_order: SortOrder;
  favorites_only?: "true";
};

/** عنصر sort-by في v-data-table-server (المفتاح هو مفتاح ترتيب في الخادم). */
export type TableSortItem = { key: string; order?: boolean | SortOrder };

/** خيار في قائمة "ترتيب" بشريط النتائج. */
export type ListSortOption<K extends string> = {
  value: string;
  title: string;
  key: K;
  order: SortOrder;
};
