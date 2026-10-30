import type {
  AgreementLeaseDraft,
  LeaseActivatePayload,
  LeaseDetail,
  LeaseFilters,
  LeasePayload,
  LeaseRecord,
  LeaseSchedule,
  LeaseScheduleTerms,
  LeaseRenewPayload,
  LeaseSortKey,
  LeaseTerminatePayload,
  OverdueInstallmentRecord,
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

/** Installments past their day and not fully paid, oldest first. */
export function listOverdueInstallments(
  filters: { person_id?: number; lease_id?: number },
  page: { page: number; page_size: number },
) {
  return request<PagedResult<OverdueInstallmentRecord>>(
    `/leases/installments/overdue${buildQuery({ ...filters, ...page })}`,
  );
}

export function terminateLease(id: number, payload: LeaseTerminatePayload) {
  return request<LeaseDetail>(`/leases/${id}/terminate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** The new lease, from the day after this one ends. */
export function renewLease(id: number, payload: LeaseRenewPayload) {
  return request<LeaseDetail>(`/leases/${id}/renew`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
