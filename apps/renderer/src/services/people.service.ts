import type {
  PageQuery,
  PagedResult,
  PersonRecord,
  PersonSortKey,
} from "../types";
import { request } from "./api.service";

function buildQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.toString() ? `?${query}` : "";
}

/** كل الأشخاص، لقوائم الاختيار (مالك العرض، عميل الطلب، تصفية المستمسكات). */
export function listPeople(filters: Record<string, string | undefined> = {}) {
  return request<PersonRecord[]>(`/people${buildQuery(filters)}`);
}

/** صفحة واحدة مع العدد الكلي، لجدول الأشخاص. */
export function listPeoplePage(
  filters: { q?: string; status?: PersonRecord["status"] },
  page: PageQuery<PersonSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<PersonRecord>>(
    `/people/paged${buildQuery({ ...filters, ...page })}`,
    { signal },
  );
}
export function getPerson(id: number) {
  return request<PersonRecord>(`/people/${id}`);
}
export function createPerson(payload: unknown) {
  return request<PersonRecord>("/people", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updatePerson(id: number, payload: unknown) {
  return request<PersonRecord>(`/people/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function archivePerson(id: number) {
  return request<PersonRecord>(`/people/${id}/archive`, { method: "PATCH" });
}
export function restorePerson(id: number) {
  return request<PersonRecord>(`/people/${id}/restore`, { method: "PATCH" });
}
