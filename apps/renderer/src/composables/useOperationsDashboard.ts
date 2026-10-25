import { ref, shallowRef } from "vue";
import {
  fetchOperationsMatching,
  fetchOperationsOverview,
} from "../services/dashboard.service";
import { getErrorMessage } from "../services/api.service";
import type {
  DashboardMatching,
  DashboardOverview,
  OperationsKind,
} from "../types";

/** مدد الركود التي يقبلها الخادم (dashboard.schema.ts). */
export const STALE_DAY_OPTIONS = [14, 30, 60, 90] as const;
const MATCH_PAGE_SIZE = 8;

/**
 * حالة لوحة العمليات على مستوى الوحدة: تبقى بين زيارات اللوحة، فتظهر آخر
 * بيانات فوراً ثم تُحدَّث. كل طلب يُلغي سابقه، ولا يكتب نتيجته إلا الأحدث.
 */
const overview = shallowRef<DashboardOverview | null>(null);
const overviewError = ref<string | null>(null);
const overviewLoading = ref(false);
const matching = shallowRef<DashboardMatching | null>(null);
const matchingError = ref<string | null>(null);
const matchingLoading = ref(false);
const loadedAt = ref<Date | null>(null);

const kind = ref<"all" | OperationsKind>("all");
const q = ref("");
const page = ref(1);
const staleDays = ref<number>(30);

let overviewController: AbortController | null = null;
let matchingController: AbortController | null = null;

async function loadOverview() {
  overviewController?.abort();
  const controller = new AbortController();
  overviewController = controller;
  overviewLoading.value = true;
  try {
    const data = await fetchOperationsOverview(
      staleDays.value,
      controller.signal,
    );
    if (controller !== overviewController) return;
    overview.value = data;
    overviewError.value = null;
    loadedAt.value = new Date();
  } catch (cause) {
    if (controller.signal.aborted) return;
    overviewError.value = getErrorMessage(cause);
  } finally {
    if (controller === overviewController) overviewLoading.value = false;
  }
}

async function loadMatching() {
  matchingController?.abort();
  const controller = new AbortController();
  matchingController = controller;
  matchingLoading.value = true;
  try {
    const data = await fetchOperationsMatching(
      {
        kind: kind.value,
        q: q.value ?? "",
        page: page.value,
        page_size: MATCH_PAGE_SIZE,
      },
      controller.signal,
    );
    if (controller !== matchingController) return;
    matching.value = data;
    matchingError.value = null;
    loadedAt.value = new Date();
  } catch (cause) {
    if (controller.signal.aborted) return;
    matchingError.value = getErrorMessage(cause);
  } finally {
    if (controller === matchingController) matchingLoading.value = false;
  }
}

async function loadAll() {
  await Promise.all([loadMatching(), loadOverview()]);
}

function cancel() {
  overviewController?.abort();
  matchingController?.abort();
  overviewLoading.value = false;
  matchingLoading.value = false;
}

export function useOperationsDashboard() {
  return {
    overview,
    overviewError,
    overviewLoading,
    matching,
    matchingError,
    matchingLoading,
    loadedAt,
    kind,
    q,
    page,
    staleDays,
    loadOverview,
    loadMatching,
    loadAll,
    cancel,
  };
}
