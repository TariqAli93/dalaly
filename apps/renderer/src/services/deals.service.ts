import type {
  DealDetail,
  DealFilters,
  DealOfferRecord,
  DealPage,
  DealPayload,
  DealPipeline,
  DealRecord,
  DealSortKey,
  DealStage,
  PageQuery,
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

export function listDealsPage(
  filters: DealFilters,
  page: PageQuery<DealSortKey>,
  signal?: AbortSignal,
) {
  return request<DealPage>(
    `/deals/paged${buildQuery({ ...filters, ...page })}`,
    {
      signal,
    },
  );
}

/** Counts and exact totals per stage and currency. */
export function getDealPipeline(filters: DealFilters = {}) {
  return request<DealPipeline>(`/deals/pipeline${buildQuery({ ...filters })}`);
}

export function getDeal(id: number) {
  return request<DealDetail>(`/deals/${id}`);
}

export function createDeal(payload: DealPayload) {
  return request<DealRecord>("/deals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDeal(id: number, payload: DealPayload) {
  return request<DealRecord>(`/deals/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Moves the deal; the server checks the move and records it. */
export function moveDealStage(
  id: number,
  stage: DealStage,
  input: { reason?: string | null; lost_reason?: string | null } = {},
) {
  return request<DealDetail>(`/deals/${id}/stage`, {
    method: "POST",
    body: JSON.stringify({ stage, ...input }),
  });
}

export function addDealOffer(
  id: number,
  offer: { party: "client" | "owner"; amount: string; notes?: string | null },
) {
  return request<DealOfferRecord>(`/deals/${id}/offers`, {
    method: "POST",
    body: JSON.stringify(offer),
  });
}

export function setDealOfferStatus(
  id: number,
  offerId: number,
  status: "countered" | "accepted" | "rejected" | "withdrawn",
) {
  return request<DealDetail>(`/deals/${id}/offers/${offerId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
