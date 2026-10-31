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
import { queryString } from "../utils/query";

export function listDealsPage(
  filters: DealFilters,
  page: PageQuery<DealSortKey>,
  signal?: AbortSignal,
) {
  return request<DealPage>(
    `/deals/paged${queryString({ ...filters, ...page })}`,
    {
      signal,
    },
  );
}

/** Counts and exact totals per stage and currency. */
export function getDealPipeline(filters: DealFilters = {}) {
  return request<DealPipeline>(`/deals/pipeline${queryString({ ...filters })}`);
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

/**
 * Drafts the deal's contract from `template` (its parties, listing, price
 * and commission filled in) and links it; returns the deal and the draft.
 */
export function prepareDealAgreement(id: number, template: string) {
  return request<{ deal: DealDetail; agreement_id: number }>(
    `/deals/${id}/agreement`,
    { method: "POST", body: JSON.stringify({ template_key: template }) },
  );
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
