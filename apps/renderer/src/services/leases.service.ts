import type {
  AgreementLeaseDraft,
  LeaseActivatePayload,
  LeaseDetail,
  LeaseFilters,
  LeasePayload,
  LeaseRecord,
  LeaseSchedule,
  LeaseScheduleTerms,
  LeaseSortKey,
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

export function listLeasesPage(
  filters: LeaseFilters,
  page: PageQuery<LeaseSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<LeaseRecord>>(
    `/leases/paged${buildQuery({ ...filters, ...page })}`,
    { signal },
  );
}

export function getLease(id: number) {
  return request<LeaseDetail>(`/leases/${id}`);
}

/** What activating this rent contract would put in force. */
export function getAgreementLease(agreementId: number) {
  return request<AgreementLeaseDraft>(`/leases/agreement/${agreementId}`);
}

/** The schedule these terms give, before a lease is entered by hand. */
export function previewSchedule(terms: LeaseScheduleTerms) {
  return request<LeaseSchedule>("/leases/schedule", {
    method: "POST",
    body: JSON.stringify(terms),
  });
}

export function createLease(payload: LeasePayload) {
  return request<LeaseDetail>("/leases", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function activateLease(payload: LeaseActivatePayload) {
  return request<LeaseDetail>("/leases/activate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelLease(id: number, reason: string) {
  return request<LeaseDetail>(`/leases/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
