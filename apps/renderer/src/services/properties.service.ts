import type {
  AuditLogRecord,
  PropertyFilters,
  PropertyForm,
  PropertyRecord,
} from "../types";
import { request } from "./api.service";

function buildQuery(filters: Partial<PropertyFilters>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listProperties(filters: Partial<PropertyFilters> = {}) {
  return request<PropertyRecord[]>(`/properties${buildQuery(filters)}`);
}

export function getProperty(id: number) {
  return request<PropertyRecord>(`/properties/${id}`);
}

export function getPropertyAudit(id: number) {
  return request<AuditLogRecord[]>(`/properties/${id}/audit`);
}

export function createProperty(payload: Partial<PropertyForm>) {
  return request<PropertyRecord>("/properties", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProperty(id: number, payload: Partial<PropertyForm>) {
  return request<PropertyRecord>(`/properties/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteProperty(id: number) {
  return request<{ deleted: boolean; property: PropertyRecord }>(
    `/properties/${id}`,
    { method: "DELETE" },
  );
}

export function archiveProperty(id: number) {
  return request<PropertyRecord>(`/properties/${id}/archive`, {
    method: "PATCH",
  });
}

export function restoreProperty(id: number) {
  return request<PropertyRecord>(`/properties/${id}/restore`, {
    method: "PATCH",
  });
}
