import type { PropertyImage } from "../types";
import { mediaUrl, request } from "./api.service";

export function listImages(propertyId: number) {
  return request<PropertyImage[]>(`/properties/${propertyId}/images`);
}

export function uploadImages(
  propertyId: number,
  images: Array<{
    data: string;
    original_name?: string;
    thumbnail?: string | null;
  }>,
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
  return mediaUrl(`/properties/${propertyId}/images/${imageId}/file`);
}

/** رابط مصغّرة الصورة (موجودة متى قال primary_image.thumbnail ذلك). */
export function thumbnailUrl(propertyId: number, imageId: number) {
  return mediaUrl(`/properties/${propertyId}/images/${imageId}/thumbnail`);
}

export function saveThumbnail(
  propertyId: number,
  imageId: number,
  data: string,
) {
  return request<{ thumbnail: boolean }>(
    `/properties/${propertyId}/images/${imageId}/thumbnail`,
    { method: "PUT", body: JSON.stringify({ data }) },
  );
}
