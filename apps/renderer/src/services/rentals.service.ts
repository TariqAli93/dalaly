import type {
  AuditLogRecord,
  PageQuery,
  PagedResult,
  RentalFilters,
  RentalForm,
  RentalImage,
  RentalRecord,
  RentalSortKey,
} from "../types";
import { mediaUrl, request } from "./api.service";
import { queryString } from "../utils/query";

/** إيجارات مالك مسجَّل (ملف الزبون)، ومعها المؤرشفة عند الطلب. */
type OwnerFilters = {
  owner_person_id?: number | null;
  include_archived?: "true" | "false";
};

/** صفحة واحدة مع العدد الكلي، لجدول الإيجارات. */
export function listRentalsPage(
  filters: Partial<RentalFilters> & OwnerFilters,
  page: PageQuery<RentalSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<RentalRecord>>(
    `/rentals/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
}
export function getRental(id: number) {
  return request<RentalRecord>(`/rentals/${id}`);
}
export function getRentalAudit(id: number) {
  return request<AuditLogRecord[]>(`/rentals/${id}/audit`);
}
export function createRental(payload: Partial<RentalForm>) {
  return request<RentalRecord>("/rentals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateRental(id: number, payload: Partial<RentalForm>) {
  return request<RentalRecord>(`/rentals/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function deleteRental(id: number) {
  return request<{ deleted: boolean; rental: RentalRecord }>(`/rentals/${id}`, {
    method: "DELETE",
  });
}
export function archiveRental(id: number) {
  return request<RentalRecord>(`/rentals/${id}/archive`, { method: "PATCH" });
}
export function restoreRental(id: number) {
  return request<RentalRecord>(`/rentals/${id}/restore`, { method: "PATCH" });
}
export function listRentalImages(id: number) {
  return request<RentalImage[]>(`/rentals/${id}/images`);
}
export function uploadRentalImages(
  id: number,
  images: Array<{
    data: string;
    original_name?: string;
    thumbnail?: string | null;
  }>,
) {
  return request<RentalImage[]>(`/rentals/${id}/images`, {
    method: "POST",
    body: JSON.stringify({ images }),
  });
}
export function setPrimaryRentalImage(id: number, imageId: number) {
  return request<RentalImage[]>(`/rentals/${id}/images/${imageId}/primary`, {
    method: "PATCH",
  });
}
export function reorderRentalImages(id: number, ids: number[]) {
  return request<RentalImage[]>(`/rentals/${id}/images/order`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}
export function deleteRentalImage(id: number, imageId: number) {
  return request<{ deleted: boolean }>(`/rentals/${id}/images/${imageId}`, {
    method: "DELETE",
  });
}
export function rentalImageUrl(id: number, imageId: number) {
  return mediaUrl(`/rentals/${id}/images/${imageId}/file`);
}
export function rentalThumbnailUrl(id: number, imageId: number) {
  return mediaUrl(`/rentals/${id}/images/${imageId}/thumbnail`);
}
export function saveRentalThumbnail(id: number, imageId: number, data: string) {
  return request<{ thumbnail: boolean }>(
    `/rentals/${id}/images/${imageId}/thumbnail`,
    { method: "PUT", body: JSON.stringify({ data }) },
  );
}
export function listRentalFavorites() {
  return request<RentalRecord[]>("/rental-favorites");
}
export function listRentalFavoriteIds() {
  return request<{ ids: number[] }>("/rental-favorites/ids");
}
export function addRentalFavorite(id: number) {
  return request<{ ok: boolean }>(`/rental-favorites/${id}`, {
    method: "POST",
  });
}
export function removeRentalFavorite(id: number) {
  return request<{ ok: boolean }>(`/rental-favorites/${id}`, {
    method: "DELETE",
  });
}
