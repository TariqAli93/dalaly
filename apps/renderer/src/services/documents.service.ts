import type { DocumentRecord, DocumentTypeRecord } from "../types";
import { API_BASE, getToken, request } from "./api.service";
export function listDocumentTypes() { return request<DocumentTypeRecord[]>("/documents/types"); }
export function listDocuments(filters: Record<string, string | number | undefined> = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return request<DocumentRecord[]>(`/documents${query.toString() ? `?${query}` : ""}`); }
export function uploadDocument(payload: unknown) { return request<DocumentRecord>("/documents", { method: "POST", body: JSON.stringify(payload) }); }
export function updateDocument(id: number, payload: unknown) { return request<DocumentRecord>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function requirements(customerId: number) { return request(`/documents/customers/${customerId}/requirements`); }
export function fileUrl(id: number) { return `${API_BASE}/documents/${id}/file?token=${encodeURIComponent(getToken())}`; }
