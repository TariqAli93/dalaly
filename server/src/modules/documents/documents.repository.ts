import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  documentTypes,
  identityDocuments,
  people,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import { saveManagedFile } from "./documents.storage.js";
import type {
  DocumentFilters,
  DocumentTypePayload,
  IdentityDocumentPayload,
  IdentityDocumentUpdate,
} from "./documents.schema.js";

function documentApi(row: Record<string, unknown>, personName?: string | null, typeName?: string | null) {
  return {
    ...toApiObject(row),
    person_name: personName ?? null,
    document_type_name: typeName ?? null,
    computed_status:
      row.status === "active" && row.expiresAt instanceof Date && row.expiresAt < new Date()
        ? "expired"
        : row.status,
  };
}

export async function listDocumentTypes() {
  return (await db.select().from(documentTypes).where(eq(documentTypes.isActive, true)).orderBy(asc(documentTypes.name))).map((row) => toApiObject(row));
}

export async function createDocumentType(payload: DocumentTypePayload) {
  const [row] = await db.insert(documentTypes).values({
    key: payload.key,
    name: payload.name,
    transactionScope: payload.transaction_scope,
    isRequired: payload.is_required,
    isActive: payload.is_active,
  }).returning();
  return toApiObject(row);
}

async function generateCode() {
  const [last] = await db.select({ code: identityDocuments.code }).from(identityDocuments).orderBy(desc(identityDocuments.id)).limit(1);
  return `DOC-${String((last?.code ? Number(last.code.split("-")[1] ?? 0) : 0) + 1).padStart(4, "0")}`;
}

export async function listIdentityDocuments(filters: DocumentFilters) {
  const where = [];
  if (filters.person_id) where.push(eq(identityDocuments.personId, filters.person_id));
  if (filters.document_type_id) where.push(eq(identityDocuments.documentTypeId, filters.document_type_id));
  if (filters.status && filters.status !== "expired") where.push(eq(identityDocuments.status, filters.status));
  const rows = await db.select({ document: identityDocuments, personName: people.fullName, typeName: documentTypes.name })
    .from(identityDocuments)
    .innerJoin(people, eq(identityDocuments.personId, people.id))
    .leftJoin(documentTypes, eq(identityDocuments.documentTypeId, documentTypes.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(identityDocuments.uploadedAt), desc(identityDocuments.id));
  return rows.map((row) => documentApi(row.document, row.personName, row.typeName)).filter((row) => !filters.status || row.computed_status === filters.status);
}

export async function getIdentityDocument(id: number) {
  const [row] = await db.select({ document: identityDocuments, personName: people.fullName, typeName: documentTypes.name })
    .from(identityDocuments)
    .innerJoin(people, eq(identityDocuments.personId, people.id))
    .leftJoin(documentTypes, eq(identityDocuments.documentTypeId, documentTypes.id))
    .where(eq(identityDocuments.id, id)).limit(1);
  return row ? documentApi(row.document, row.personName, row.typeName) : null;
}

export async function createIdentityDocument(payload: IdentityDocumentPayload) {
  const stored = saveManagedFile(`people/${payload.person_id}`, payload.data, payload.original_name, payload.file_type);
  const [row] = await db.insert(identityDocuments).values({
    code: await generateCode(),
    personId: payload.person_id,
    documentTypeId: payload.document_type_id ?? null,
    documentName: payload.document_name,
    documentNumber: payload.document_number,
    filePath: stored.filePath,
    fileType: payload.file_type,
    fileSize: stored.fileSize,
    expiresAt: payload.expires_at ?? null,
    notes: payload.notes,
    status: "active",
  }).returning();
  return getIdentityDocument(row.id);
}

export async function updateIdentityDocument(id: number, payload: IdentityDocumentUpdate) {
  const [row] = await db.update(identityDocuments).set({
    documentTypeId: payload.document_type_id ?? null,
    documentName: payload.document_name,
    documentNumber: payload.document_number,
    expiresAt: payload.expires_at ?? null,
    status: payload.status,
    notes: payload.notes,
    updatedAt: new Date(),
  }).where(eq(identityDocuments.id, id)).returning();
  return row ? getIdentityDocument(row.id) : null;
}

export async function getPersonDocumentRequirements(personId: number, scope: "sale" | "rent" = "sale") {
  const required = await db.select().from(documentTypes).where(and(eq(documentTypes.isRequired, true), eq(documentTypes.isActive, true), eq(documentTypes.transactionScope, scope))).orderBy(asc(documentTypes.name));
  const uploaded = await db.select({ document: identityDocuments, typeName: documentTypes.name }).from(identityDocuments)
    .leftJoin(documentTypes, eq(identityDocuments.documentTypeId, documentTypes.id))
    .where(and(eq(identityDocuments.personId, personId), eq(identityDocuments.status, "active")));
  const validUploaded = uploaded.filter((row) => !row.document.expiresAt || row.document.expiresAt > new Date());
  const uploadedByType = new Map(validUploaded.filter((row) => row.document.documentTypeId).map((row) => [row.document.documentTypeId, row]));
  const missing = required.filter((type) => !uploadedByType.has(type.id)).map((type) => toApiObject(type));
  return {
    required: required.map((type) => toApiObject(type)),
    uploaded: uploaded.map((row) => documentApi(row.document, null, row.typeName)),
    missing,
    expired: uploaded.filter((row) => row.document.expiresAt && row.document.expiresAt <= new Date()).map((row) => documentApi(row.document, null, row.typeName)),
  };
}
