import type {
  AuditLogRecord,
  PageQuery,
  PagedResult,
  PropertyFilters,
  PropertyForm,
  PropertyRecord,
  PropertySortKey,
} from "../types";
import { request } from "./api.service";
import { queryString } from "../utils/query";

/** صفحة واحدة مع العدد الكلي، لجدول العروض. */
export function listPropertiesPage(
  filters: Partial<PropertyFilters>,
  page: PageQuery<PropertySortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<PropertyRecord>>(
    `/properties/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
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
