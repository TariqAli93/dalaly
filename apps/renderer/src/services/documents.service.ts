import type {
  DocumentRecord,
  DocumentSortKey,
  DocumentTypeRecord,
  PageQuery,
  PagedResult,
} from "../types";
import { API_BASE, getToken, request } from "./api.service";

function buildQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  return query.toString() ? `?${query}` : "";
}

export function listDocumentTypes() {
  return request<DocumentTypeRecord[]>("/documents/types");
}
export function listDocuments(
  filters: Record<string, string | number | undefined> = {},
) {
  return request<DocumentRecord[]>(`/documents${buildQuery(filters)}`);
}
/** صفحة واحدة مع العدد الكلي، لجدول المستمسكات. */
export function listDocumentsPage(
  filters: { person_id?: number; document_type_id?: number; status?: string },
  page: PageQuery<DocumentSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<DocumentRecord>>(
    `/documents/paged${buildQuery({ ...filters, ...page })}`,
    { signal },
  );
}
export function uploadDocument(payload: unknown) {
  return request<DocumentRecord>("/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateDocument(id: number, payload: unknown) {
  return request<DocumentRecord>(`/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function requirements(
  personId: number,
  scope: "sale" | "rent" = "sale",
) {
  return request<{
    required: DocumentTypeRecord[];
    uploaded: DocumentRecord[];
    missing: DocumentTypeRecord[];
    expired: DocumentRecord[];
  }>(`/documents/people/${personId}/requirements?scope=${scope}`);
}
export function addPersonDocument(personId: number, payload: unknown) {
  return request<DocumentRecord>(`/documents/people/${personId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function fileUrl(id: number) {
  return `${API_BASE}/documents/${id}/file?token=${encodeURIComponent(getToken())}`;
}
