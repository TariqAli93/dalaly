import type { PropertyRecord } from "../types";
import { request } from "./api.service";

export function listFavorites() {
  return request<PropertyRecord[]>("/favorites");
}

export function listFavoriteIds() {
  return request<{ ids: number[] }>("/favorites/ids");
}

export function addFavorite(propertyId: number) {
  return request<{ ok: boolean }>(`/favorites/${propertyId}`, { method: "POST" });
}

export function removeFavorite(propertyId: number) {
  return request<{ ok: boolean }>(`/favorites/${propertyId}`, {
    method: "DELETE",
  });
}
