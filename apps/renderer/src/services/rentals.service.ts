import type { RentalFilters, RentalForm, RentalImage, RentalRecord } from "../types";
import { API_BASE, getToken, request } from "./api.service";
function query(filters: Partial<RentalFilters>) { const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value !== "" && value !== undefined && value !== null) params.set(key, String(value)); }); const text = params.toString(); return text ? `?${text}` : ""; }
export function listRentals(filters: Partial<RentalFilters> = {}) { return request<RentalRecord[]>(`/rentals${query(filters)}`); }
export function getRental(id: number) { return request<RentalRecord>(`/rentals/${id}`); }
export function createRental(payload: Partial<RentalForm>) { return request<RentalRecord>("/rentals", { method: "POST", body: JSON.stringify(payload) }); }
export function updateRental(id: number, payload: Partial<RentalForm>) { return request<RentalRecord>(`/rentals/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteRental(id: number) { return request<{ deleted: boolean; rental: RentalRecord }>(`/rentals/${id}`, { method: "DELETE" }); }
export function archiveRental(id: number) { return request<RentalRecord>(`/rentals/${id}/archive`, { method: "PATCH" }); }
export function restoreRental(id: number) { return request<RentalRecord>(`/rentals/${id}/restore`, { method: "PATCH" }); }
export function listRentalImages(id: number) { return request<RentalImage[]>(`/rentals/${id}/images`); }
export function uploadRentalImages(id: number, images: Array<{ data: string; original_name?: string }>) { return request<RentalImage[]>(`/rentals/${id}/images`, { method: "POST", body: JSON.stringify({ images }) }); }
export function setPrimaryRentalImage(id: number, imageId: number) { return request<RentalImage[]>(`/rentals/${id}/images/${imageId}/primary`, { method: "PATCH" }); }
export function reorderRentalImages(id: number, ids: number[]) { return request<RentalImage[]>(`/rentals/${id}/images/order`, { method: "PUT", body: JSON.stringify({ ids }) }); }
export function deleteRentalImage(id: number, imageId: number) { return request<{ deleted: boolean }>(`/rentals/${id}/images/${imageId}`, { method: "DELETE" }); }
export function rentalImageUrl(id: number, imageId: number) { return `${API_BASE}/rentals/${id}/images/${imageId}/file?token=${encodeURIComponent(getToken())}`; }
export function listRentalFavorites() { return request<RentalRecord[]>("/rental-favorites"); }
export function listRentalFavoriteIds() { return request<{ ids: number[] }>("/rental-favorites/ids"); }
export function addRentalFavorite(id: number) { return request<{ ok: boolean }>(`/rental-favorites/${id}`, { method: "POST" }); }
export function removeRentalFavorite(id: number) { return request<{ ok: boolean }>(`/rental-favorites/${id}`, { method: "DELETE" }); }
