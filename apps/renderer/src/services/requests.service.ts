import type { MatchResult, PurchaseRequestRecord, RentalRequestRecord } from "../types";
import { request } from "./api.service";
function query(filters: Record<string, string | number | null | undefined>) { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== "" && value !== null && value !== undefined) params.set(key, String(value)); }); const text = params.toString(); return text ? `?${text}` : ""; }
export function listRentalRequests(filters: Record<string, unknown> = {}) { return request<RentalRequestRecord[]>(`/rental-requests${query(filters as Record<string, string | number | null | undefined>)}`); }
export function createRentalRequest(payload: unknown) { return request<RentalRequestRecord>("/rental-requests", { method: "POST", body: JSON.stringify(payload) }); }
export function updateRentalRequest(id: number, payload: unknown) { return request<RentalRequestRecord>(`/rental-requests/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function listPurchaseRequests(filters: Record<string, unknown> = {}) { return request<PurchaseRequestRecord[]>(`/purchase-requests${query(filters as Record<string, string | number | null | undefined>)}`); }
export function createPurchaseRequest(payload: unknown) { return request<PurchaseRequestRecord>("/purchase-requests", { method: "POST", body: JSON.stringify(payload) }); }
export function updatePurchaseRequest(id: number, payload: unknown) { return request<PurchaseRequestRecord>(`/purchase-requests/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function rentalOfferMatches(id: number) { return request<{ count: number; matches: Array<MatchResult> }>(`/matching/rental-requests/${id}/offers`); }
export function rentalRequestMatches(id: number) { return request<{ count: number; matches: Array<MatchResult> }>(`/matching/rentals/${id}/requests`); }
export function purchaseOfferMatches(id: number) { return request<{ count: number; matches: Array<MatchResult> }>(`/matching/purchase-requests/${id}/offers`); }
export function purchaseRequestMatches(id: number) { return request<{ count: number; matches: Array<MatchResult> }>(`/matching/properties/${id}/purchase-requests`); }
