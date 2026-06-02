import type { District, Governorate, LocationsResponse } from "../types";
import { request } from "./api.service";

export function getLocations() {
  return request<LocationsResponse>("/locations");
}

export function createGovernorate(payload: { name: string; is_active?: boolean }) {
  return request<Governorate>("/locations/governorates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateGovernorate(
  id: number,
  payload: { name: string; is_active: boolean },
) {
  return request<Governorate>(`/locations/governorates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteGovernorate(id: number) {
  return request<{ deleted: boolean }>(`/locations/governorates/${id}`, {
    method: "DELETE",
  });
}

export function createDistrict(payload: {
  governorate_id: number;
  name: string;
  is_active?: boolean;
}) {
  return request<District>("/locations/districts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDistrict(
  id: number,
  payload: { name: string; is_active: boolean },
) {
  return request<District>(`/locations/districts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteDistrict(id: number) {
  return request<{ deleted: boolean }>(`/locations/districts/${id}`, {
    method: "DELETE",
  });
}
