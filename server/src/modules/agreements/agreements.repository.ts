import fs from "node:fs";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  withRecordCodeLock,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import {
  agreementExports,
  agreementParties,
  agreementRevisions,
  agreements,
  officeProfiles,
  people,
  properties,
  rentals,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  pageOffset,
  sortNullsLast,
  totalRowsColumn,
} from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import {
  PARTY_ROLE_LABELS,
  TEMPLATES,
  emptyTerms,
  findIssues,
  pickCompany,
  pickListing,
  pickParty,
  resolveValues,
  rolesOf,
  type AgreementContext,
  type AgreementTerms,
  type ContractDocument,
  type ContractIssue,
  type PartyRole,
  type TemplateKey,
} from "../../shared/contract-document/index.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  contentTypeForFile,
  resolveManagedFile,
} from "../documents/documents.storage.js";
import { templateForNewContract } from "./agreement-templates.repository.js";
import {
  termsSchema,
  type AgreementPageQuery,
  type AgreementSortKey,
  type SaveAgreementPayload,
} from "./agreements.schema.js";

type Executor = typeof db | Transaction;
type AgreementRow = typeof agreements.$inferSelect;
export type AgreementStatus = "draft" | "review" | "issued" | "cancelled";

const DRAFT_CONFLICT =
  "حُفظت هذه المسودة من نافذة أو جهاز آخر بعد فتحها هنا. أعد فتح العقد لترى آخر نسخة.";

async function generateCode(tx: Transaction) {
  const [last] = await tx
    .select({ code: agreements.code })
    .from(agreements)
    .orderBy(desc(agreements.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `CT-${String(next).padStart(4, "0")}`;
}

function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Terms a new contract starts with: today's date and the usual wording. */
function initialTerms(template: TemplateKey): AgreementTerms {
  const terms = emptyTerms(today());
  if (TEMPLATES[template].kind === "rent") {
    terms.payment_due = "مقدماً في بداية كل مدة";
    terms.notice_days = 30;
  } else {
    terms.payment_terms = "نقداً عند توقيع هذا العقد";
  }
  return terms;
}

export function readTerms(value: unknown): AgreementTerms {
  const parsed = termsSchema.safeParse(value ?? {});
  return (parsed.success ? parsed.data : emptyTerms()) as AgreementTerms;
}

async function lockedAgreement(tx: Transaction, id: number) {
  const [row] = await tx
    .select()
    .from(agreements)
    .where(eq(agreements.id, id))
    .limit(1)
    .for("update");
  if (!row) throw new DomainError(404, "العقد غير موجود.");
  return row;
}

function requireStatus(
  row: AgreementRow,
  allowed: AgreementStatus[],
  message: string,
) {
  if (!allowed.includes(row.status as AgreementStatus))
    throw new DomainError(409, message, "INVALID_STATUS");
}

// ─── Context: the linked records a contract shows ──────────────────────

/** The office logo as a data: URL, for an issued revision to keep. */
export async function officeLogoData(executor: Executor = db) {
  const [office] = await executor
    .select({ logo: officeProfiles.logoFilePath })
    .from(officeProfiles)
    .where(eq(officeProfiles.id, 1))
    .limit(1);
  if (!office?.logo) return null;
  try {
    const absolute = resolveManagedFile(office.logo);
    const data = await fs.promises.readFile(absolute);
    const type = contentTypeForFile(office.logo);
    if (!type.startsWith("image/") || data.length > 2_000_000) return null;
    return `data:${type};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Current data of the linked customers, listing and office (drafts). */
export async function liveContext(
  row: Pick<AgreementRow, "id" | "propertyId" | "rentalId">,
  executor: Executor = db,
): Promise<AgreementContext> {
  const partyRows = await executor
    .select({ role: agreementParties.role, person: people })
    .from(agreementParties)
    .innerJoin(people, eq(agreementParties.personId, people.id))
    .where(eq(agreementParties.agreementId, row.id));
  const parties: AgreementContext["parties"] = {};
  for (const party of partyRows)
    parties[party.role as PartyRole] = pickParty(toApiObject(party.person));

  let listing: AgreementContext["listing"] = null;
  if (row.propertyId) {
    const [property] = await executor
      .select()
      .from(properties)
      .where(eq(properties.id, row.propertyId))
      .limit(1);
    if (property)
      listing = pickListing("property", toApiObject(property, "properties"));
  } else if (row.rentalId) {
    const [rental] = await executor
      .select()
      .from(rentals)
      .where(eq(rentals.id, row.rentalId))
      .limit(1);
    if (rental) listing = pickListing("rental", toApiObject(rental, "rentals"));
  }

  const [office] = await executor
    .select()
    .from(officeProfiles)
    .where(eq(officeProfiles.id, 1))
    .limit(1);
  return {
    parties,
    listing,
    company: office ? pickCompany(toApiObject(office)) : null,
  };
}

// ─── Reading ───────────────────────────────────────────────────────────

/** The first or second party's name, whichever roles the template has. */
const partyName = (position: "first" | "second") => {
  const [sale, rent] =
    position === "first" ? ["seller", "landlord"] : ["buyer", "tenant"];
  return sql<string | null>`(
    select ${people.fullName} from ${agreementParties}
    join ${people} on ${people.id} = ${agreementParties.personId}
    where ${agreementParties.agreementId} = ${agreements.id}
      and ${agreementParties.role} = (case when ${agreements.templateKey} in ('sale', 'installment_sale')
        then ${sql.raw(`'${sale}'`)} else ${sql.raw(`'${rent}'`)} end)
    limit 1)`;
};
const contractDate = sql<
  string | null
>`(${agreements.terms} ->> 'contract_date')`;
const listingCode = sql<
  string | null
>`coalesce(${properties.code}, ${rentals.code})`;
const listingName = sql<
  string | null
>`coalesce(${properties.name}, ${rentals.name})`;
const listingType = sql<
  string | null
>`coalesce(${properties.propertyType}, ${rentals.propertyType})`;

const SORT_COLUMNS: Record<AgreementSortKey, SQL | AnyPgColumn> = {
  updated_at: agreements.updatedAt,
  created_at: agreements.createdAt,
  code: agreements.code,
  status: agreements.status,
  contract_date: contractDate,
};

function listConditions(query: AgreementPageQuery) {
  const where: SQL[] = [];
  if (query.status) where.push(eq(agreements.status, query.status));
  if (query.template_key)
    where.push(eq(agreements.templateKey, query.template_key));
  if (query.property_id)
    where.push(eq(agreements.propertyId, query.property_id));
  if (query.rental_id) where.push(eq(agreements.rentalId, query.rental_id));
  if (query.person_id)
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(agreementParties)
          .where(
            and(
              eq(agreementParties.agreementId, agreements.id),
              eq(agreementParties.personId, query.person_id),
            ),
          ),
      ),
    );
  const q = query.q?.trim();
  if (q) {
    const pattern = containsPattern(q);
    where.push(
      or(
        ilike(agreements.code, pattern),
        ilike(properties.code, pattern),
        ilike(rentals.code, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(agreementParties)
            .innerJoin(people, eq(people.id, agreementParties.personId))
            .where(
              and(
                eq(agreementParties.agreementId, agreements.id),
                or(
                  ilike(people.fullName, pattern),
                  ilike(people.phonePrimary, pattern),
                  ilike(people.nationalId, pattern),
                ),
              ),
            ),
        ),
      )!,
    );
  }
  return where.length ? and(...where) : undefined;
}

export async function listAgreementsPage(query: AgreementPageQuery) {
  const condition = listConditions(query);
  const order = [
    sortNullsLast(SORT_COLUMNS[query.sort_by], query.sort_order),
    query.sort_order === "asc" ? asc(agreements.id) : desc(agreements.id),
  ];
  const rows = await db
    .select({
      id: agreements.id,
      code: agreements.code,
      template_key: agreements.templateKey,
      status: agreements.status,
      current_revision: agreements.currentRevision,
      first_party_name: partyName("first"),
      second_party_name: partyName("second"),
      listing_code: listingCode,
      listing_name: listingName,
      listing_type: listingType,
      contract_date: contractDate,
      updated_at: agreements.updatedAt,
      created_at: agreements.createdAt,
      total: totalRowsColumn(),
    })
    .from(agreements)
    .leftJoin(properties, eq(properties.id, agreements.propertyId))
    .leftJoin(rentals, eq(rentals.id, agreements.rentalId))
    .where(condition)
    .orderBy(...order)
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  const total =
    rows[0]?.total ??
    (query.page > 1
      ? Number(
          (
            await db
              .select({ count: sql<number>`count(*)`.mapWith(Number) })
              .from(agreements)
              .leftJoin(properties, eq(properties.id, agreements.propertyId))
              .leftJoin(rentals, eq(rentals.id, agreements.rentalId))
              .where(condition)
          )[0]?.count ?? 0,
        )
      : 0);
  return {
    items: rows.map(({ total: _total, ...row }) => ({
      ...row,
      title:
        TEMPLATES[row.template_key as TemplateKey]?.title ?? row.template_key,
    })),
    total,
    page: query.page,
    page_size: query.page_size,
  };
}

async function revisionsOf(agreementId: number) {
  return db
    .select({
      revision: agreementRevisions.revision,
      reason: agreementRevisions.reason,
      issued_at: agreementRevisions.issuedAt,
      issued_by_name: users.displayName,
    })
    .from(agreementRevisions)
    .leftJoin(users, eq(users.id, agreementRevisions.issuedBy))
    .where(eq(agreementRevisions.agreementId, agreementId))
    .orderBy(desc(agreementRevisions.revision));
}

async function exportsOf(agreementId: number) {
  return db
    .select({
      id: agreementExports.id,
      revision: agreementExports.revision,
      format: agreementExports.format,
      file_name: agreementExports.fileName,
      created_at: agreementExports.createdAt,
      created_by_name: users.displayName,
    })
    .from(agreementExports)
    .leftJoin(users, eq(users.id, agreementExports.createdBy))
    .where(eq(agreementExports.agreementId, agreementId))
    .orderBy(desc(agreementExports.createdAt), desc(agreementExports.id))
    .limit(30);
}

export async function getRevisionRow(agreementId: number, revision: number) {
  const [row] = await db
    .select()
    .from(agreementRevisions)
    .where(
      and(
        eq(agreementRevisions.agreementId, agreementId),
        eq(agreementRevisions.revision, revision),
      ),
    )
    .limit(1);
  if (!row) throw new DomainError(404, "هذه المراجعة من العقد غير موجودة.");
  return row;
}

export async function getAgreementRow(id: number) {
  const [row] = await db
    .select()
    .from(agreements)
    .where(eq(agreements.id, id))
    .limit(1);
  if (!row) throw new DomainError(404, "العقد غير موجود.");
  return row;
}

/**
 * One contract with what its pages need. `context` is live for a draft or a
 * contract under review, and the issued revision's for the others, so an
 * issued contract always shows the data it was issued with.
 */
export async function getAgreement(id: number) {
  const row = await getAgreementRow(id);
  const partyRows = await db
    .select({
      role: agreementParties.role,
      person_id: agreementParties.personId,
      code: people.code,
      full_name: people.fullName,
      phone_primary: people.phonePrimary,
    })
    .from(agreementParties)
    .innerJoin(people, eq(people.id, agreementParties.personId))
    .where(eq(agreementParties.agreementId, id));
  const editable = row.status === "draft" || row.status === "review";
  const [revisions, exportRows, context] = await Promise.all([
    revisionsOf(id),
    exportsOf(id),
    editable || !row.currentRevision
      ? liveContext(row)
      : getRevisionRow(id, row.currentRevision).then(
          (revision) => revision.context as AgreementContext,
        ),
  ]);
  const listing = context.listing;
  return {
    id: row.id,
    code: row.code,
    template_key: row.templateKey,
    title: TEMPLATES[row.templateKey as TemplateKey].title,
    kind: TEMPLATES[row.templateKey as TemplateKey].kind,
    status: row.status,
    property_id: row.propertyId,
    rental_id: row.rentalId,
    terms: readTerms(row.terms),
    document: row.document as ContractDocument,
    template_version: row.templateVersion,
    draft_rev: row.draftRev,
    current_revision: row.currentRevision,
    issued_at: row.issuedAt,
    cancelled_at: row.cancelledAt,
    cancel_reason: row.cancelReason,
    amend_reason: row.amendReason,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    parties: partyRows,
    listing_label: listing
      ? [listing.code, listing.name].filter(Boolean).join(" · ")
      : null,
    context,
    revisions,
    exports: exportRows,
  };
}

export async function getRevision(agreementId: number, revision: number) {
  const row = await getRevisionRow(agreementId, revision);
  return {
    revision: row.revision,
    template_key: row.templateKey,
    document: row.document as ContractDocument,
    terms: readTerms(row.terms),
    context: row.context as AgreementContext,
    values: row.values as Record<string, string>,
    logo: row.logo,
    reason: row.reason,
    issued_at: row.issuedAt,
  };
}

// ─── Writing ───────────────────────────────────────────────────────────

export async function createAgreement(template: TemplateKey, userId: number) {
  const created = await withRecordCodeLock("agreements", async (tx) => {
    const { definition, version } = await templateForNewContract(template, tx);
    const [row] = await tx
      .insert(agreements)
      .values({
        code: await generateCode(tx),
        templateKey: template,
        terms: initialTerms(template),
        document: definition,
        templateVersion: version,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    return row!;
  });
  await recordAudit({
    entityType: "agreement",
    entityId: created.id,
    action: "created",
    newValue: { code: created.code, template },
    userId,
  });
  return created;
}

/** A new draft with the same document, terms, parties and listing. */
export async function duplicateAgreement(id: number, userId: number) {
  const source = await getAgreementRow(id);
  const parties = await db
    .select({
      role: agreementParties.role,
      personId: agreementParties.personId,
    })
    .from(agreementParties)
    .where(eq(agreementParties.agreementId, id));
  const created = await withRecordCodeLock("agreements", async (tx) => {
    const [row] = await tx
      .insert(agreements)
      .values({
        code: await generateCode(tx),
        templateKey: source.templateKey,
        terms: { ...readTerms(source.terms), contract_date: today() },
        document: source.document,
        templateVersion: source.templateVersion,
        propertyId: source.propertyId,
        rentalId: source.rentalId,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();
    if (parties.length)
      await tx
        .insert(agreementParties)
        .values(parties.map((party) => ({ ...party, agreementId: row!.id })));
    return row!;
  });
  await recordAudit({
    entityType: "agreement",
    entityId: created.id,
    action: "created",
    newValue: { code: created.code, duplicated_from: source.code },
    userId,
  });
  return created;
}

async function assertListing(
  tx: Transaction,
  template: TemplateKey,
  propertyId: number | null | undefined,
  rentalId: number | null | undefined,
) {
  const kind = TEMPLATES[template].kind;
  if (kind === "sale" && rentalId)
    throw new DomainError(400, "عقد البيع يرتبط بعرض بيع لا بعرض إيجار.");
  if (kind === "rent" && propertyId)
    throw new DomainError(400, "عقد الإيجار يرتبط بعرض إيجار لا بعرض بيع.");
  if (propertyId) {
    const [found] = await tx
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    if (!found) throw new DomainError(400, "العقار المختار غير موجود.");
  }
  if (rentalId) {
    const [found] = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.id, rentalId))
      .limit(1);
    if (!found) throw new DomainError(400, "عرض الإيجار المختار غير موجود.");
  }
}

/**
 * Saves a draft. The save names the draft_rev it edited; if another window
 * saved in between, nothing is written (409), so no edit is lost silently.
 */
export async function saveDraft(
  id: number,
  payload: SaveAgreementPayload,
  userId: number,
) {
  return db.transaction(async (tx) => {
    const row = await lockedAgreement(tx, id);
    requireStatus(
      row,
      ["draft"],
      row.status === "review"
        ? "العقد قيد المراجعة. أعده إلى مسودة لتعديله."
        : "لا يمكن تعديل عقد صادر أو ملغى. افتح مراجعة جديدة لتصحيحه.",
    );
    if (row.draftRev !== payload.base_rev)
      throw new DomainError(409, DRAFT_CONFLICT, "DRAFT_CONFLICT");
    const template = row.templateKey as TemplateKey;
    const set: Partial<typeof agreements.$inferInsert> = {
      draftRev: row.draftRev + 1,
      updatedBy: userId,
      updatedAt: new Date(),
    };
    if (payload.document) set.document = payload.document;
    if (payload.terms) set.terms = payload.terms;
    if (payload.property_id !== undefined || payload.rental_id !== undefined) {
      const propertyId =
        payload.property_id !== undefined
          ? payload.property_id
          : row.propertyId;
      const rentalId =
        payload.rental_id !== undefined ? payload.rental_id : row.rentalId;
      await assertListing(tx, template, propertyId, rentalId);
      set.propertyId = propertyId;
      set.rentalId = rentalId;
    }
    if (payload.parties) {
      const allowed = rolesOf(template);
      for (const party of payload.parties)
        if (!allowed.includes(party.role))
          throw new DomainError(
            400,
            `دور «${PARTY_ROLE_LABELS[party.role]}» لا يخص هذا النوع من العقود.`,
          );
      const ids = [...new Set(payload.parties.map((party) => party.person_id))];
      if (ids.length) {
        const found = await tx
          .select({ id: people.id })
          .from(people)
          .where(inArray(people.id, ids));
        if (found.length !== ids.length)
          throw new DomainError(400, "أحد الزبائن المختارين غير موجود.");
      }
      if (
        payload.parties.length === 2 &&
        payload.parties[0]!.person_id === payload.parties[1]!.person_id
      )
        throw new DomainError(400, "لا يكون الزبون نفسه طرفي العقد.");
      await tx
        .delete(agreementParties)
        .where(eq(agreementParties.agreementId, id));
      if (payload.parties.length)
        await tx.insert(agreementParties).values(
          payload.parties.map((party) => ({
            agreementId: id,
            role: party.role,
            personId: party.person_id,
          })),
        );
    }
    const [updated] = await tx
      .update(agreements)
      .set(set)
      .where(and(eq(agreements.id, id), eq(agreements.status, "draft")))
      .returning({
        draftRev: agreements.draftRev,
        updatedAt: agreements.updatedAt,
      });
    return { draft_rev: updated!.draftRev, updated_at: updated!.updatedAt };
  });
}

async function setStatus(
  id: number,
  userId: number,
  from: AgreementStatus[],
  message: string,
  change: (row: AgreementRow) => Partial<typeof agreements.$inferInsert>,
  baseRev?: number,
) {
  const result = await db.transaction(async (tx) => {
    const row = await lockedAgreement(tx, id);
    requireStatus(row, from, message);
    if (baseRev !== undefined && row.draftRev !== baseRev)
      throw new DomainError(409, DRAFT_CONFLICT, "DRAFT_CONFLICT");
    const [updated] = await tx
      .update(agreements)
      .set({
        ...change(row),
        draftRev: row.draftRev + 1,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(agreements.id, id))
      .returning();
    return { before: row, after: updated! };
  });
  await recordAudit({
    entityType: "agreement",
    entityId: id,
    action: "status_changed",
    oldValue: { status: result.before.status },
    newValue: {
      status: result.after.status,
      revision: result.after.currentRevision,
      reason:
        result.after.cancelReason ?? result.after.amendReason ?? undefined,
    },
    userId,
  });
  return result.after;
}

export function submitForReview(id: number, baseRev: number, userId: number) {
  return setStatus(
    id,
    userId,
    ["draft"],
    "لا يُرسل للمراجعة إلا عقد في حالة المسودة.",
    () => ({ status: "review" }),
    baseRev,
  );
}

export function returnToDraft(id: number, baseRev: number, userId: number) {
  return setStatus(
    id,
    userId,
    ["review"],
    "العقد ليس قيد المراجعة.",
    () => ({ status: "draft" }),
    baseRev,
  );
}

/** Reopens an issued contract as the draft of its next revision. */
export function amendAgreement(id: number, reason: string, userId: number) {
  return setStatus(
    id,
    userId,
    ["issued"],
    "لا تُفتح مراجعة إلا لعقد صادر.",
    () => ({ status: "draft", amendReason: reason }),
  );
}

export function cancelAgreement(id: number, reason: string, userId: number) {
  return setStatus(
    id,
    userId,
    ["draft", "review", "issued"],
    "العقد ملغى مسبقاً.",
    () => ({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancelReason: reason,
    }),
  );
}

/** Only a draft that was never issued can be deleted. */
export async function deleteDraft(id: number, userId: number) {
  const deleted = await db.transaction(async (tx) => {
    const row = await lockedAgreement(tx, id);
    if (row.status !== "draft" || row.currentRevision > 0)
      throw new DomainError(
        409,
        "لا يُحذف إلا عقد مسودة لم يصدر قط. ألغِ العقد الصادر بدل حذفه.",
        "INVALID_STATUS",
      );
    await tx.delete(agreements).where(eq(agreements.id, id));
    return row;
  });
  await recordAudit({
    entityType: "agreement",
    entityId: id,
    action: "deleted",
    oldValue: { code: deleted.code },
    userId,
  });
}

export type IssueResult =
  { ok: true; revision: number } | { ok: false; issues: ContractIssue[] };

/**
 * Issues a draft (or a contract under review) in one transaction: re-reads
 * the linked records, refuses while anything is missing, and stores the
 * revision with everything it shows. Later edits to the customers, the
 * listing, the office or the template never change it.
 */
export async function issueAgreement(
  id: number,
  baseRev: number,
  userId: number,
): Promise<IssueResult> {
  const result = await db.transaction(
    async (tx): Promise<IssueResult & { before?: AgreementRow }> => {
      const row = await lockedAgreement(tx, id);
      requireStatus(row, ["draft", "review"], "العقد صادر أو ملغى مسبقاً.");
      if (row.draftRev !== baseRev)
        throw new DomainError(409, DRAFT_CONFLICT, "DRAFT_CONFLICT");
      const template = row.templateKey as TemplateKey;
      const document = row.document as ContractDocument;
      const terms = readTerms(row.terms);
      const context = await liveContext(row, tx);
      const revision = row.currentRevision + 1;
      const values = resolveValues(
        { template, number: row.code, revision },
        context,
        terms,
      );
      const issues = findIssues(template, document, context, terms, values);
      if (issues.length) return { ok: false, issues };
      await tx.insert(agreementRevisions).values({
        agreementId: id,
        revision,
        templateKey: template,
        document,
        terms,
        context,
        values,
        logo: await officeLogoData(tx),
        reason: row.amendReason,
        issuedBy: userId,
      });
      await tx
        .update(agreements)
        .set({
          status: "issued",
          currentRevision: revision,
          issuedAt: new Date(),
          issuedBy: userId,
          amendReason: null,
          draftRev: row.draftRev + 1,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(agreements.id, id));
      return { ok: true, revision, before: row };
    },
  );
  if (result.ok)
    await recordAudit({
      entityType: "agreement",
      entityId: id,
      action: "status_changed",
      oldValue: { status: result.before?.status },
      newValue: { status: "issued", revision: result.revision },
      userId,
    });
  return result.ok ? { ok: true, revision: result.revision } : result;
}

export async function recordExport(
  id: number,
  input: {
    format: "pdf" | "docx" | "print";
    revision: number | null;
    file_name: string | null;
  },
  userId: number,
) {
  await getAgreementRow(id);
  if (input.revision !== null) await getRevisionRow(id, input.revision);
  const [row] = await db
    .insert(agreementExports)
    .values({
      agreementId: id,
      revision: input.revision,
      format: input.format,
      fileName: input.file_name,
      createdBy: userId,
    })
    .returning();
  return {
    id: row!.id,
    revision: row!.revision,
    format: row!.format,
    file_name: row!.fileName,
    created_at: row!.createdAt,
  };
}
