import type {
  AssigneeRecord,
  CommissionDetail,
  CommissionFilters,
  CommissionPayload,
  CommissionRecord,
  CommissionSortKey,
  CommissionSplitRecord,
  PageQuery,
  PagedResult,
} from "../types";
import { request } from "./api.service";

function buildQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.toString() ? `?${query}` : "";
}

export function listCommissionsPage(
  filters: CommissionFilters,
  page: PageQuery<CommissionSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<CommissionRecord>>(
    `/commissions/paged${buildQuery({ ...filters, ...page })}`,
    { signal },
  );
}

export function getCommission(id: number) {
  return request<CommissionDetail>(`/commissions/${id}`);
}

/** Employees' shares not yet paid in full. */
export function listPayableSplits(userId?: number) {
  return request<CommissionSplitRecord[]>(
    `/commissions/payable${buildQuery({ user_id: userId })}`,
  );
}

/** The active employees a share can go to. */
export function listCommissionStaff() {
  return request<AssigneeRecord[]>("/commissions/staff");
}

export function recordCommission(payload: CommissionPayload) {
  return request<CommissionDetail>("/commissions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelCommission(
  id: number,
  input: { cancel_date?: string; reason: string },
) {
  return request<CommissionDetail>(`/commissions/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
