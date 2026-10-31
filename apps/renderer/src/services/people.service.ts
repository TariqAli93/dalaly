import type {
  PageQuery,
  PagedResult,
  PersonDetailRecord,
  PersonDuplicate,
  PersonRecord,
  PersonSortKey,
  PersonTimeline,
} from "../types";
import { request } from "./api.service";
import { queryString } from "../utils/query";

/** صفحة واحدة مع العدد الكلي، لجدول الأشخاص. */
export function listPeoplePage(
  filters: {
    q?: string;
    status?: PersonRecord["status"];
    role?: string;
    assigned?: "me" | "unassigned" | number;
  },
  page: PageQuery<PersonSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<PersonRecord>>(
    `/people/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
}
export function getPerson(id: number) {
  return request<PersonDetailRecord>(`/people/${id}`);
}
/** The customer's tasks and interactions, with last contact and next due. */
export function getPersonTimeline(id: number) {
  return request<PersonTimeline>(`/people/${id}/timeline`);
}
/** Customers who already have one of these numbers or this national ID. */
export function findDuplicatePeople(query: {
  phone?: string;
  phone_secondary?: string;
  national_id?: string;
  exclude_id?: number;
}) {
  return request<PersonDuplicate[]>(`/people/duplicates${queryString(query)}`);
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
