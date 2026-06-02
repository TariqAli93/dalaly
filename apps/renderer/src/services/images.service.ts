import type { PropertyImage } from "../types";
import { API_BASE, getToken, request } from "./api.service";

export function listImages(propertyId: number) {
  return request<PropertyImage[]>(`/properties/${propertyId}/images`);
}

export function uploadImages(
  propertyId: number,
  images: Array<{ data: string; original_name?: string }>,
) {
  return request<PropertyImage[]>(`/properties/${propertyId}/images`, {
    method: "POST",
    body: JSON.stringify({ images }),
  });
}

export function setPrimaryImage(propertyId: number, imageId: number) {
  return request<PropertyImage[]>(
    `/properties/${propertyId}/images/${imageId}/primary`,
    { method: "PATCH" },
  );
}

export function reorderImages(propertyId: number, ids: number[]) {
  return request<PropertyImage[]>(`/properties/${propertyId}/images/order`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}

export function deleteImage(propertyId: number, imageId: number) {
  return request<{ deleted: boolean }>(
    `/properties/${propertyId}/images/${imageId}`,
    { method: "DELETE" },
  );
}

/** رابط ملف الصورة مع التوكن في query (لأن <img> لا يرسل ترويسة Authorization). */
export function imageFileUrl(propertyId: number, imageId: number) {
  return `${API_BASE}/properties/${propertyId}/images/${imageId}/file?token=${encodeURIComponent(getToken())}`;
}
