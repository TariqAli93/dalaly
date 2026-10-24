import type {
  DashboardMatching,
  DashboardMatchingQuery,
  DashboardOverview,
} from "../types";
import { request } from "./api.service";

/** مؤشرات اللوحة التشغيلية: المواعيد والمعاينات والعروض الراكدة والأرقام. */
export function fetchOperationsOverview(
  staleDays: number,
  signal?: AbortSignal,
) {
  return request<DashboardOverview>(
    `/dashboard/overview?stale_days=${staleDays}`,
    { signal },
  );
}

/** الطلبات المفتوحة ومطابقاتها: صفحة من المطابقات، والزبائن، وطلبات بلا مطابقة. */
export function fetchOperationsMatching(
  query: DashboardMatchingQuery,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    kind: query.kind,
    page: String(query.page),
    page_size: String(query.page_size),
  });
  if (query.q.trim()) params.set("q", query.q.trim());
  return request<DashboardMatching>(`/dashboard/matching?${params}`, {
    signal,
  });
}
