import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { customers, documents, documentTypes, type NewDocument } from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import { saveManagedFile } from "./documents.storage.js";
import type { DocumentFilters, DocumentPayload, DocumentTypePayload, DocumentUpdate } from "./documents.schema.js";

function documentApi(row: Record<string, unknown>, customerName?: string | null, typeName?: string | null) { return { ...toApiObject(row), customer_name: customerName ?? null, document_type_name: typeName ?? null, computed_status: row.status === "active" && row.expiresAt instanceof Date && row.expiresAt < new Date() ? "expired" : row.status }; }
export async function listDocumentTypes() { return (await db.select().from(documentTypes).where(eq(documentTypes.isActive, true)).orderBy(asc(documentTypes.name))).map((row) => toApiObject(row)); }
export async function createDocumentType(payload: DocumentTypePayload) { const [row] = await db.insert(documentTypes).values({ key: payload.key, name: payload.name, transactionScope: payload.transaction_scope, isRequired: payload.is_required, isActive: payload.is_active }).returning(); return toApiObject(row); }
async function generateCode() { const [last] = await db.select({ code: documents.code }).from(documents).orderBy(desc(documents.id)).limit(1); return `DOC-${String((last?.code ? Number(last.code.split("-")[1] ?? 0) : 0) + 1).padStart(4, "0")}`; }
export async function listDocuments(filters: DocumentFilters) {
  const where = []; if (filters.customer_id) where.push(eq(documents.customerId, filters.customer_id)); if (filters.document_type_id) where.push(eq(documents.documentTypeId, filters.document_type_id)); if (filters.status && filters.status !== "expired") where.push(eq(documents.status, filters.status));
  const rows = await db.select({ document: documents, customerName: customers.fullName, typeName: documentTypes.name }).from(documents).innerJoin(customers, eq(documents.customerId, customers.id)).leftJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id)).where(where.length ? and(...where) : undefined).orderBy(desc(documents.uploadedAt), desc(documents.id));
  return rows.map((row) => documentApi(row.document, row.customerName, row.typeName)).filter((row) => !filters.status || row.computed_status === filters.status);
}
export async function getDocument(id: number) { const [row] = await db.select({ document: documents, customerName: customers.fullName, typeName: documentTypes.name }).from(documents).innerJoin(customers, eq(documents.customerId, customers.id)).leftJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id)).where(eq(documents.id, id)).limit(1); return row ? documentApi(row.document, row.customerName, row.typeName) : null; }
export async function createDocument(payload: DocumentPayload) { const stored = saveManagedFile(`customers/${payload.customer_id}`, payload.data, payload.original_name, payload.file_type); const [row] = await db.insert(documents).values({ code: await generateCode(), customerId: payload.customer_id, documentTypeId: payload.document_type_id ?? null, documentName: payload.document_name, filePath: stored.filePath, fileType: payload.file_type, fileSize: stored.fileSize, expiresAt: payload.expires_at ?? null, notes: payload.notes, status: "active" }).returning(); return getDocument(row.id); }
export async function updateDocument(id: number, payload: DocumentUpdate) { const [row] = await db.update(documents).set({ documentTypeId: payload.document_type_id ?? null, documentName: payload.document_name, expiresAt: payload.expires_at ?? null, status: payload.status, notes: payload.notes, updatedAt: new Date() }).where(eq(documents.id, id)).returning(); return row ? getDocument(row.id) : null; }
export async function getDocumentRequirements(customerId: number) {
  const required = await db.select().from(documentTypes).where(and(eq(documentTypes.isRequired, true), eq(documentTypes.isActive, true))).orderBy(asc(documentTypes.name));
  const uploaded = await db.select({ document: documents, typeName: documentTypes.name }).from(documents).leftJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id)).where(and(eq(documents.customerId, customerId), eq(documents.status, "active")));
  const uploadedByType = new Map(uploaded.filter((row) => row.document.documentTypeId).map((row) => [row.document.documentTypeId, row]));
  const expired = uploaded.filter((row) => row.document.expiresAt && row.document.expiresAt < new Date()).map((row) => documentApi(row.document, null, row.typeName));
  const missing = required.filter((type) => !uploadedByType.has(type.id)).map((type) => toApiObject(type));
  return { required: required.map((type) => toApiObject(type)), uploaded: uploaded.map((row) => documentApi(row.document, null, row.typeName)), missing, expired };
}
