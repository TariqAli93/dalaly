import type {
  MatchResult,
  PageQuery,
  PagedResult,
  PurchaseRequestRecord,
  PurchaseRequestSortKey,
  RentalRequestRecord,
  RentalRequestSortKey,
} from "../types";
import { request } from "./api.service";
import { queryString } from "../utils/query";

/** فلاتر قوائم الطلبات (rental/purchaseRequestFiltersSchema في الخادم). */
export type RequestListFilters = {
  q?: string;
  status?: string;
  person_id?: number;
  property_type?: string;
  governorate_id?: number | null;
  district_id?: number | null;
};
/** صفحة واحدة مع العدد الكلي، لجدول طلبات الإيجار. */
export function listRentalRequestsPage(
  filters: RequestListFilters,
  page: PageQuery<RentalRequestSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<RentalRequestRecord>>(
    `/rental-requests/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
}
export function getRentalRequest(id: number) {
  return request<RentalRequestRecord>(`/rental-requests/${id}`);
}
export function createRentalRequest(payload: unknown) {
  return request<RentalRequestRecord>("/rental-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateRentalRequest(id: number, payload: unknown) {
  return request<RentalRequestRecord>(`/rental-requests/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
/** صفحة واحدة مع العدد الكلي، لجدول طلبات الشراء. */
export function listPurchaseRequestsPage(
  filters: RequestListFilters,
  page: PageQuery<PurchaseRequestSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<PurchaseRequestRecord>>(
    `/purchase-requests/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
}
export function getPurchaseRequest(id: number) {
  return request<PurchaseRequestRecord>(`/purchase-requests/${id}`);
}
export function createPurchaseRequest(payload: unknown) {
  return request<PurchaseRequestRecord>("/purchase-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updatePurchaseRequest(id: number, payload: unknown) {
  return request<PurchaseRequestRecord>(`/purchase-requests/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function rentalOfferMatches(id: number) {
  return request<{ count: number; matches: Array<MatchResult> }>(
    `/matching/rental-requests/${id}/offers`,
  );
}
export function rentalRequestMatches(id: number) {
  return request<{ count: number; matches: Array<MatchResult> }>(
    `/matching/rentals/${id}/requests`,
  );
}
export function purchaseOfferMatches(id: number) {
  return request<{ count: number; matches: Array<MatchResult> }>(
    `/matching/purchase-requests/${id}/offers`,
  );
}
export function purchaseRequestMatches(id: number) {
  return request<{ count: number; matches: Array<MatchResult> }>(
    `/matching/properties/${id}/purchase-requests`,
  );
}
