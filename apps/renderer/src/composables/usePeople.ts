import { ref } from "vue";
import { PEOPLE_DEFAULT_SORT, type PersonStatusFilter } from "../constants/crm";
import * as peopleService from "../services/people.service";
import { createPagedList } from "./usePagedList";
import type { PersonRecord, PersonRole, PersonSortKey } from "../types";

// كما في القوائم الأخرى: البحث والحالة والصفحة والترتيب تبقى بين الزيارات.
const search = ref("");
const status = ref<PersonStatusFilter>("current");
const role = ref<PersonRole | null>(null);
const assigned = ref<"me" | "unassigned" | null>(null);
let requested = "";
const list = createPagedList<PersonRecord, PersonSortKey>((page, signal) => {
  requested = JSON.stringify([
    search.value,
    status.value,
    role.value,
    assigned.value,
  ]);
  return peopleService.listPeoplePage(
    {
      q: search.value ?? "",
      // «الحاليون» لا يرسل حالة، فيعيد الخادم غير المؤرشفين.
      status: status.value === "current" ? undefined : status.value,
      role: role.value ?? undefined,
      assigned: assigned.value ?? undefined,
    },
    page,
    signal,
  );
}, PEOPLE_DEFAULT_SORT);

export function usePeople() {
  return {
    search,
    status,
    role,
    assigned,
    list,
    apply() {
      if (
        JSON.stringify([
          search.value,
          status.value,
          role.value,
          assigned.value,
        ]) !== requested
      )
        return list.loadFirstPage();
    },
    clear() {
      search.value = "";
      status.value = "current";
      role.value = null;
      assigned.value = null;
      return list.loadFirstPage();
    },
  };
}
