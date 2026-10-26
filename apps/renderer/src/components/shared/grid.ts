/** أمر في صف جدول: أيقونة في الصف نفسه أو بند في قائمة «المزيد». */
export type RowAction = {
  key: string;
  label: string;
  icon: string;
  run: () => void;
  /** يظهر في الصف نفسه (أيقونة)؛ البقية في القائمة. */
  inline?: boolean;
  color?: string;
  /** أمر خطِر: آخر القائمة بعد فاصل، ولا يكون أيقونة في الصف. */
  danger?: boolean;
  /** لزر تبديل كالمفضلة. */
  pressed?: boolean;
};

/**
 * عمود في DataGrid. priority يحدّد ما يُخفى حين يضيق اللوح (لوحة جانبية
 * مفتوحة، تكبير 125%، أو حجم خط أكبر): 1 لا يُخفى، 2 تحت 70rem، 3 تحت 54rem.
 * المقاسات بـ rem فتتبع إعداد حجم الخط.
 */
export type GridHeader = {
  key: string;
  title: string;
  sortable?: boolean;
  align?: "start" | "end" | "center";
  width?: number | string;
  priority?: 1 | 2 | 3;
};

/** شريحة فلتر فعّال في FilterBar؛ key ما يُزال عند إغلاقها. */
export type FilterChip = { key: string; label: string };

/** ما يتيحه DataGrid لأبيه عبر ref. */
export type DataGridApi = {
  focusFirstRow: () => void;
  focusRow: (id: number) => void;
  remember: (id: number) => void;
};

// آخر صف فُتح في كل جدول (gridKey): على مستوى الوحدة فيبقى بين إعادة تركيب
// الصفحة، ويعود إليه التركيز بعد الرجوع من السجل.
export const openedRows = new Map<string, number>();
