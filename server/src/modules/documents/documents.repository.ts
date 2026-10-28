import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  documentTypes,
  identityDocuments,
  people,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  pageOffset,
  sortNullsLast,
  totalRowsColumn,
  type SortOrder,
} from "../../shared/utils/paging.js";
import { saveManagedFile } from "./documents.storage.js";
import type {
  DocumentFilters,
  DocumentPageQuery,
  DocumentSortKey,
  DocumentTypePayload,
  IdentityDocumentPayload,
  IdentityDocumentUpdate,
} from "./documents.schema.js";
import {
  withRecordCodeLock,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";

function documentApi(
  row: Record<string, unknown>,
  personName?: string | null,
  typeName?: string | null,
  computedStatus?: string,
) {
  return {
    ...toApiObject(row),
    person_name: personName ?? null,
    document_type_name: typeName ?? null,
    computed_status:
      computedStatus ??
      (row.status === "active" &&
      row.expiresAt instanceof Date &&
      row.expiresAt < new Date()
        ? "expired"
        : row.status),
  };
}

/**
 * الحالة المحسوبة في قاعدة البيانات، بنفس قاعدة documentApi: النشط الذي مضى
 * تاريخ انتهائه "expired". تُقرأ مع الصفوف كي تطابق الحالةُ المعروضة الفلترَ.
 */
const computedStatus = sql<string>`case
  when ${identityDocuments.status} = 'active' and ${identityDocuments.expiresAt} < now() then 'expired'
  else ${identityDocuments.status}
end`;

/** شروط الفلاتر المشتركة بين القائمة الكاملة والقائمة المقسّمة. */
function documentConditions(filters: DocumentFilters) {
  const where: SQL[] = [];
  if (filters.person_id)
    where.push(eq(identityDocuments.personId, filters.person_id));
  if (filters.agreement_id)
    where.push(eq(identityDocuments.agreementId, filters.agreement_id));
  if (filters.document_type_id)
    where.push(eq(identityDocuments.documentTypeId, filters.document_type_id));
  // شروط صريحة بدل مقارنة computedStatus كي يبقى فهرس الحالة صالحاً.
  if (filters.status === "expired")
    where.push(
      eq(identityDocuments.status, "active"),
      lt(identityDocuments.expiresAt, sql`now()`),
    );
  else if (filters.status === "active")
    where.push(
      eq(identityDocuments.status, "active"),
      or(
        isNull(identityDocuments.expiresAt),
        gte(identityDocuments.expiresAt, sql`now()`),
      )!,
    );
  else if (filters.status)
    where.push(eq(identityDocuments.status, filters.status));
  return where.length ? and(...where) : undefined;
}

export async function listDocumentTypes() {
  return (
    await db
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.isActive, true))
      .orderBy(asc(documentTypes.name))
  ).map((row) => toApiObject(row));
}

export async function createDocumentType(payload: DocumentTypePayload) {
  const [row] = await db
    .insert(documentTypes)
    .values({
      key: payload.key,
      name: payload.name,
      transactionScope: payload.transaction_scope,
      isRequired: payload.is_required,
      isActive: payload.is_active,
    })
    .returning();
  return toApiObject(row);
}

async function generateCode(tx: Transaction) {
  const [last] = await tx
    .select({ code: identityDocuments.code })
    .from(identityDocuments)
    .orderBy(desc(identityDocuments.id))
    .limit(1);
  return `DOC-${String((last?.code ? Number(last.code.split("-")[1] ?? 0) : 0) + 1).padStart(4, "0")}`;
}

export async function listIdentityDocuments(filters: DocumentFilters) {
  const rows = await db
    .select({
      document: identityDocuments,
      personName: people.fullName,
      typeName: documentTypes.name,
      computedStatus,
    })
    .from(identityDocuments)
    .innerJoin(people, eq(identityDocuments.personId, people.id))
    .leftJoin(
      documentTypes,
      eq(identityDocuments.documentTypeId, documentTypes.id),
    )
    .where(documentConditions(filters))
    .orderBy(desc(identityDocuments.uploadedAt), desc(identityDocuments.id));
  return rows.map((row) =>
    documentApi(row.document, row.personName, row.typeName, row.computedStatus),
  );
}

const DOCUMENT_SORT_COLUMNS: Record<DocumentSortKey, AnyPgColumn | SQL> = {
  uploaded_at: identityDocuments.uploadedAt,
  expires_at: identityDocuments.expiresAt,
  code: identityDocuments.code,
  person_name: people.fullName,
  document_type_name: documentTypes.name,
  document_name: identityDocuments.documentName,
  document_number: identityDocuments.documentNumber,
  computed_status: computedStatus,
};

/** فرز ثانوي ثابت بين الصفحات، والترتيب الافتراضي (الأحدث رفعاً) عند التساوي. */
function documentOrder(sortKey: DocumentSortKey, order: SortOrder): SQL[] {
  if (sortKey === "uploaded_at")
    return [
      sortNullsLast(identityDocuments.uploadedAt, order),
      order === "asc" ? asc(identityDocuments.id) : desc(identityDocuments.id),
    ];
  return [
    sortNullsLast(DOCUMENT_SORT_COLUMNS[sortKey], order),
    desc(identityDocuments.uploadedAt),
    desc(identityDocuments.id),
  ];
}

export async function listIdentityDocumentsPage(query: DocumentPageQuery) {
  const condition = documentConditions(query);
  const rows = await db
    .select({
      document: identityDocuments,
      personName: people.fullName,
      typeName: documentTypes.name,
      computedStatus,
      total: totalRowsColumn(),
    })
    .from(identityDocuments)
    .innerJoin(people, eq(identityDocuments.personId, people.id))
    .leftJoin(
      documentTypes,
      eq(identityDocuments.documentTypeId, documentTypes.id),
    )
    .where(condition)
    .orderBy(...documentOrder(query.sort_by, query.sort_order))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  // صفحة بعد النهاية لا صفوف فيها تحمل العدد، فيُعدّ منفصلاً (person_id إلزامي
  // والنوع ربط اختياري، فالربط لا يغيّر العدد).
  const total =
    rows[0]?.total ??
    (query.page > 1 ? await db.$count(identityDocuments, condition) : 0);
  return {
    items: rows.map((row) =>
      documentApi(
        row.document,
        row.personName,
        row.typeName,
        row.computedStatus,
      ),
    ),
    total,
    page: query.page,
    page_size: query.page_size,
  };
}

export async function getIdentityDocument(id: number) {
  const [row] = await db
    .select({
      document: identityDocuments,
      personName: people.fullName,
      typeName: documentTypes.name,
    })
    .from(identityDocuments)
    .innerJoin(people, eq(identityDocuments.personId, people.id))
    .leftJoin(
      documentTypes,
      eq(identityDocuments.documentTypeId, documentTypes.id),
    )
    .where(eq(identityDocuments.id, id))
    .limit(1);
  return row ? documentApi(row.document, row.personName, row.typeName) : null;
}

export async function createIdentityDocument(payload: IdentityDocumentPayload) {
  const stored = saveManagedFile(
    `people/${payload.person_id}`,
    payload.data,
    payload.original_name,
    payload.file_type,
  );
  const [row] = await withRecordCodeLock("identity_documents", async (tx) =>
    tx
      .insert(identityDocuments)
      .values({
        code: await generateCode(tx),
        personId: payload.person_id,
        agreementId: payload.agreement_id ?? null,
        documentTypeId: payload.document_type_id ?? null,
        documentName: payload.document_name,
        documentNumber: payload.document_number,
        documentSide: payload.document_side,
        filePath: stored.filePath,
        fileType: payload.file_type,
        fileSize: stored.fileSize,
        expiresAt: payload.expires_at ?? null,
        notes: payload.notes,
        status: "active",
      })
      .returning(),
  );
  return getIdentityDocument(row.id);
}

export async function updateIdentityDocument(
  id: number,
  payload: IdentityDocumentUpdate,
) {
  const [row] = await db
    .update(identityDocuments)
    .set({
      documentTypeId: payload.document_type_id ?? null,
      documentName: payload.document_name,
      documentNumber: payload.document_number,
      documentSide: payload.document_side,
      expiresAt: payload.expires_at ?? null,
      status: payload.status,
      notes: payload.notes,
      updatedAt: new Date(),
    })
    .where(eq(identityDocuments.id, id))
    .returning();
  return row ? getIdentityDocument(row.id) : null;
}

export async function getPersonDocumentRequirements(
  personId: number,
  scope: "sale" | "rent" = "sale",
) {
  const required = await db
    .select()
    .from(documentTypes)
    .where(
      and(
        eq(documentTypes.isRequired, true),
        eq(documentTypes.isActive, true),
        or(
          eq(documentTypes.transactionScope, "general"),
          eq(documentTypes.transactionScope, scope),
        ),
      ),
    )
    .orderBy(asc(documentTypes.name));
  const uploaded = await db
    .select({ document: identityDocuments, typeName: documentTypes.name })
    .from(identityDocuments)
    .leftJoin(
      documentTypes,
      eq(identityDocuments.documentTypeId, documentTypes.id),
    )
    .where(
      and(
        eq(identityDocuments.personId, personId),
        eq(identityDocuments.status, "active"),
      ),
    );
  const validUploaded = uploaded.filter(
    (row) => !row.document.expiresAt || row.document.expiresAt > new Date(),
  );
  const uploadedByType = new Map(
    validUploaded
      .filter((row) => row.document.documentTypeId)
      .map((row) => [row.document.documentTypeId, row]),
  );
  const missing = required
    .filter((type) => !uploadedByType.has(type.id))
    .map((type) => toApiObject(type));
  return {
    required: required.map((type) => toApiObject(type)),
    uploaded: uploaded.map((row) =>
      documentApi(row.document, null, row.typeName),
    ),
    missing,
    expired: uploaded
      .filter(
        (row) => row.document.expiresAt && row.document.expiresAt <= new Date(),
      )
      .map((row) => documentApi(row.document, null, row.typeName)),
  };
}
