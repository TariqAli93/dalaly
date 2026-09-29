import type { PersonRecord } from "../types";
import { request } from "./api.service";

export function listPeople(filters: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return request<PersonRecord[]>(
    `/people${query.toString() ? `?${query}` : ""}`,
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
