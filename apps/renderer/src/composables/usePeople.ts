import { ref } from "vue";
import { PEOPLE_DEFAULT_SORT, type PersonStatusFilter } from "../constants/crm";
import * as peopleService from "../services/people.service";
import { createPagedList } from "./usePagedList";
import type { PersonRecord, PersonSortKey } from "../types";

// كما في القوائم الأخرى: البحث والحالة والصفحة والترتيب تبقى بين الزيارات.
const search = ref("");
const status = ref<PersonStatusFilter>("current");
let requested = "";
const list = createPagedList<PersonRecord, PersonSortKey>((page, signal) => {
  requested = JSON.stringify([search.value, status.value]);
  return peopleService.listPeoplePage(
    {
      q: search.value ?? "",
      // «الحاليون» لا يرسل حالة، فيعيد الخادم غير المؤرشفين.
      status: status.value === "current" ? undefined : status.value,
    },
    page,
    signal,
  );
}, PEOPLE_DEFAULT_SORT);

export function usePeople() {
  return {
    search,
    status,
    list,
    apply() {
      if (JSON.stringify([search.value, status.value]) !== requested)
        return list.loadFirstPage();
    },
    clear() {
      search.value = "";
      status.value = "current";
      return list.loadFirstPage();
    },
  };
}
