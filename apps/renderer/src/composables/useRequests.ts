import { ref, type Ref } from "vue";
import { REQUESTS_DEFAULT_SORT } from "../constants/crm";
import * as requests from "../services/requests.service";
import { createPagedList } from "./usePagedList";
import type {
  PageQuery,
  PurchaseRequestSortKey,
  RentalRequestSortKey,
} from "../types";
import type { RequestMode, RequestRecord } from "../utils/requestForm";

export type RequestFilters = {
  q: string;
  status: string;
  property_type: string;
  governorate_id: number | null;
  district_id: number | null;
};

export const emptyRequestFilters = (): RequestFilters => ({
  q: "",
  status: "",
  property_type: "",
  governorate_id: null,
  district_id: null,
});

function createRequestList(mode: RequestMode) {
  const filters: Ref<RequestFilters> = ref(emptyRequestFilters());
  let requested = "";
  // مفاتيح أعمدة الجدول هي مفاتيح الترتيب؛ عمود نوع الإيجار لا يظهر في
  // طلبات الشراء، فلا يصل مفتاحه إليها.
  const list = createPagedList<RequestRecord, RentalRequestSortKey>(
    (page, signal) => {
      requested = JSON.stringify(filters.value);
      const query = {
        ...filters.value,
        status: filters.value.status || undefined,
        property_type: filters.value.property_type || undefined,
      };
      return mode === "rental"
        ? requests.listRentalRequestsPage(query, page, signal)
        : requests.listPurchaseRequestsPage(
            query,
            page as PageQuery<PurchaseRequestSortKey>,
            signal,
          );
    },
    REQUESTS_DEFAULT_SORT,
  );
  return {
    filters,
    list,
    /** بعد توقّف الكتابة: لا يعيد طلب فلاتر أُرسلت قبله. */
    apply() {
      if (JSON.stringify(filters.value) !== requested)
        return list.loadFirstPage();
    },
    clear() {
      filters.value = emptyRequestFilters();
      return list.loadFirstPage();
    },
  };
}

// قائمة لكل نوع، على مستوى الوحدة: الفلاتر والصفحة والترتيب تبقى بين الزيارات.
const lists = new Map<RequestMode, ReturnType<typeof createRequestList>>();

export function useRequests(mode: RequestMode) {
  let state = lists.get(mode);
  if (!state) {
    state = createRequestList(mode);
    lists.set(mode, state);
  }
  return state;
}
