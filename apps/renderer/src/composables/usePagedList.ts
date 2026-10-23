import { ref, type Ref } from "vue";
import { DEFAULT_LIST_PAGE_SIZE } from "../constants/domain";
import { getErrorMessage } from "../services/api.service";
import type {
  ListSortOption,
  PageQuery,
  PagedResult,
  SortOrder,
  TableSortItem,
} from "../types";
import { useSnackbar } from "./useSnackbar";

type FetchPage<T, K extends string> = (
  page: PageQuery<K>,
  signal: AbortSignal,
) => Promise<PagedResult<T>>;

type PagedListOptions = {
  /** بدل الإشعار العام، لصفحة تعرض الخطأ في مكان الجدول. */
  onError?: (message: string) => void;
};

/**
 * قائمة مقسّمة من الخادم: الصفحة الحالية وعددها الكلي وحالة الصفحة والترتيب
 * (مربوطة مباشرة بـ v-data-table-server). كل تحميل يُلغي الطلب الذي قبله، ولا
 * يكتب النتيجة إلا أحدث طلب، فلا يطغى بحث قديم بطيء على بحث أحدث منه.
 */
export function createPagedList<T, K extends string>(
  fetchPage: FetchPage<T, K>,
  defaultSort: ListSortOption<K>,
  options: PagedListOptions = {},
) {
  const items = ref([]) as Ref<T[]>;
  const total = ref(0);
  const loading = ref(false);
  const page = ref(1);
  const pageSize = ref(DEFAULT_LIST_PAGE_SIZE);
  // فارغ = الترتيب الافتراضي؛ الجدول يمسح الترتيب عند النقرة الثالثة.
  const sortBy = ref<TableSortItem[]>([]);
  const favoritesOnly = ref(false);

  let controller: AbortController | null = null;
  let loadedOptions = "";
  const tableOptions = () =>
    JSON.stringify([page.value, pageSize.value, sortBy.value]);

  function query(): PageQuery<K> {
    // مفاتيح أعمدة الجدول القابلة للترتيب هي مفاتيح الترتيب في الخادم.
    const sort = sortBy.value[0];
    const order: SortOrder = sort?.order === "asc" ? "asc" : "desc";
    return {
      page: page.value,
      page_size: pageSize.value,
      sort_by: sort ? (sort.key as K) : defaultSort.key,
      sort_order: sort ? order : defaultSort.order,
      ...(favoritesOnly.value ? { favorites_only: "true" as const } : {}),
    };
  }

  /** يعيد تحميل الصفحة الحالية (بعد أرشفة أو حذف أو تحديث). */
  async function reload() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    loadedOptions = tableOptions();
    loading.value = true;
    try {
      const result = await fetchPage(query(), current.signal);
      if (current.signal.aborted) return;
      // صفحة بعد النهاية (حُذف آخر صف فيها): انتقل إلى آخر صفحة موجودة.
      if (!result.items.length && result.total > 0 && page.value > 1) {
        page.value = Math.ceil(result.total / pageSize.value);
        void reload();
        return;
      }
      items.value = result.items;
      total.value = result.total;
    } catch (error) {
      if (current.signal.aborted) return;
      const message = getErrorMessage(error);
      if (options.onError) options.onError(message);
      else useSnackbar().notifyError(message);
    } finally {
      if (controller === current) {
        controller = null;
        loading.value = false;
      }
    }
  }

  /** فلاتر جديدة أو ترتيب جديد: من الصفحة الأولى. */
  function loadFirstPage() {
    page.value = 1;
    return reload();
  }

  /**
   * لـ update:options في الجدول: يُطلق أيضاً عند ظهور الجدول، فلا يحمّل إلا إذا
   * تغيّرت الصفحة أو حجمها أو الترتيب عن آخر طلب.
   */
  function onTableOptions() {
    if (tableOptions() !== loadedOptions) void reload();
  }

  function setSort(option: ListSortOption<K>) {
    sortBy.value = [{ key: option.key, order: option.order }];
    return loadFirstPage();
  }

  /** خيار "ترتيب" المطابق للترتيب الحالي، إن وُجد. */
  function currentSortValue(options: ListSortOption<K>[]) {
    const sort = query();
    return (
      options.find(
        (option) =>
          option.key === sort.sort_by && option.order === sort.sort_order,
      )?.value ?? null
    );
  }

  function setFavoritesOnly(value: boolean) {
    favoritesOnly.value = value;
    return loadFirstPage();
  }

  function cancel() {
    controller?.abort();
    controller = null;
    loading.value = false;
  }

  return {
    items,
    total,
    loading,
    page,
    pageSize,
    sortBy,
    favoritesOnly,
    reload,
    loadFirstPage,
    onTableOptions,
    setSort,
    currentSortValue,
    setFavoritesOnly,
    cancel,
  };
}
