import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  people,
  users,
  type NewPerson,
  type Person,
} from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  pageOffset,
  sortNullsLast,
  totalRowsColumn,
  type SortOrder,
} from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import type {
  PersonFilters,
  PersonPageQuery,
  PersonPayload,
  PersonSortKey,
} from "./people.schema.js";
import {
  withRecordCodeLock,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import { listEntityAudit, recordAudit } from "../audit/audit.service.js";
import { assertTaskLinks } from "../tasks/tasks.links.js";

const ENTITY = "person";

function normalize(payload: PersonPayload): Omit<NewPerson, "code"> {
  return {
    fullName: payload.full_name,
    phonePrimary: payload.phone_primary,
    phoneSecondary: payload.phone_secondary,
    email: payload.email,
    address: payload.address,
    nationalId: payload.national_id,
    governorate: payload.governorate,
    district: payload.district,
    neighborhood: payload.neighborhood,
    alley: payload.alley,
    houseNumber: payload.house_number,
    residenceCardNumber: payload.residence_card_number,

    personType: payload.person_type,
    status: payload.status,
    notes: payload.notes,
    ...(payload.roles === undefined ? {} : { roles: payload.roles }),
    ...(payload.source === undefined ? {} : { source: payload.source }),
    ...(payload.assigned_user_id === undefined
      ? {}
      : { assignedUserId: payload.assigned_user_id }),
    updatedAt: new Date(),
  };
}

/** A person as the API returns them, with their employee's name. */
function personApi(
  person: Person,
  assignedUserName: string | null,
): Record<string, unknown> & { assigned_user_name: string | null } {
  return { ...toApiObject(person), assigned_user_name: assignedUserName };
}

/** people joined to the employee who looks after them. */
function selectPeople() {
  return db
    .select({ person: people, assignedUserName: users.displayName })
    .from(people)
    .leftJoin(users, eq(people.assignedUserId, users.id));
}

async function generateCode(tx: Transaction) {
  const [last] = await tx
    .select({ code: people.code })
    .from(people)
    .orderBy(desc(people.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `P-${String(next).padStart(4, "0")}`;
}

/** شروط الفلاتر والبحث المشتركة بين القائمة الكاملة والقائمة المقسّمة. */
function personConditions(filters: PersonFilters, userId?: number) {
  const where: SQL[] = [];
  if (filters.role)
    where.push(sql`${people.roles} @> ARRAY[${filters.role}]::text[]`);
  if (filters.assigned === "me")
    where.push(eq(people.assignedUserId, userId ?? 0));
  else if (filters.assigned === "unassigned")
    where.push(sql`${people.assignedUserId} IS NULL`);
  else if (typeof filters.assigned === "number")
    where.push(eq(people.assignedUserId, filters.assigned));
  if (filters.person_type)
    where.push(eq(people.personType, filters.person_type));
  if (filters.status) where.push(eq(people.status, filters.status));
  else where.push(ne(people.status, "archived"));
  const q = filters.q?.trim();
  if (q) {
    const pattern = containsPattern(q);
    where.push(
      or(
        ilike(people.code, pattern),
        ilike(people.fullName, pattern),
        ilike(people.phonePrimary, pattern),
        ilike(people.email, pattern),
        ilike(people.nationalId, pattern),
      )!,
    );
  }
  return and(...where);
}

export async function listPeople(filters: PersonFilters, userId?: number) {
  const rows = await selectPeople()
    .where(personConditions(filters, userId))
    .orderBy(desc(people.updatedAt), desc(people.id));
  return rows.map((row) => personApi(row.person, row.assignedUserName));
}

const PERSON_SORT_COLUMNS: Record<PersonSortKey, AnyPgColumn> = {
  updated_at: people.updatedAt,
  created_at: people.createdAt,
  full_name: people.fullName,
  code: people.code,
  phone_primary: people.phonePrimary,
  person_type: people.personType,
  status: people.status,
};

/**
 * فرز ثانوي ثابت كي لا يتكرر صف بين الصفحات: الوقت ثم id بنفس الاتجاه، وبقية
 * المفاتيح بالترتيب الافتراضي للدليل (آخر تحديث أولاً) عند التساوي.
 */
function personOrder(sortKey: PersonSortKey, order: SortOrder): SQL[] {
  if (sortKey === "updated_at" || sortKey === "created_at")
    return [
      sortNullsLast(PERSON_SORT_COLUMNS[sortKey], order),
      order === "asc" ? asc(people.id) : desc(people.id),
    ];
  return [
    sortNullsLast(PERSON_SORT_COLUMNS[sortKey], order),
    desc(people.updatedAt),
    desc(people.id),
  ];
}

export async function listPeoplePage(query: PersonPageQuery, userId?: number) {
  const condition = personConditions(query, userId);
  const rows = await db
    .select({
      person: people,
      assignedUserName: users.displayName,
      total: totalRowsColumn(),
    })
    .from(people)
    .leftJoin(users, eq(people.assignedUserId, users.id))
    .where(condition)
    .orderBy(...personOrder(query.sort_by, query.sort_order))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  // صفحة بعد النهاية لا صفوف فيها تحمل العدد، فيُعدّ منفصلاً.
  const total =
    rows[0]?.total ?? (query.page > 1 ? await db.$count(people, condition) : 0);
  return {
    items: rows.map((row) => personApi(row.person, row.assignedUserName)),
    total,
    page: query.page,
    page_size: query.page_size,
  };
}

export async function getPerson(id: number) {
  const [row] = await selectPeople().where(eq(people.id, id)).limit(1);
  return row ? personApi(row.person, row.assignedUserName) : null;
}

/**
 * The roles a customer has from the records themselves: owner of a listing,
 * buyer or tenant with a request, a party to a contract.
 */
export async function impliedRoles(id: number) {
  const [row] = (
    await db.execute(sql`SELECT
      EXISTS (SELECT 1 FROM properties WHERE owner_person_id = ${id})
        OR EXISTS (SELECT 1 FROM rentals WHERE owner_person_id = ${id}) AS owner,
      EXISTS (SELECT 1 FROM purchase_requests WHERE person_id = ${id}) AS buyer,
      EXISTS (SELECT 1 FROM rental_requests WHERE person_id = ${id}) AS tenant,
      ARRAY(SELECT DISTINCT role FROM agreement_parties WHERE person_id = ${id} ORDER BY role) AS contract_roles`)
  ).rows as Array<{
    owner: boolean;
    buyer: boolean;
    tenant: boolean;
    contract_roles: string[];
  }>;
  const roles = new Set<string>(row?.contract_roles ?? []);
  if (row?.owner) roles.add("owner");
  if (row?.buyer) roles.add("buyer");
  if (row?.tenant) roles.add("tenant");
  return [...roles].sort();
}

/** One customer for their record page: with the roles their records imply. */
export async function getPersonDetail(id: number) {
  const person = await getPerson(id);
  return person ? { ...person, implied_roles: await impliedRoles(id) } : null;
}

export async function createPerson(payload: PersonPayload, userId?: number) {
  await assertTaskLinks(payload);
  const [row] = await withRecordCodeLock("people", async (tx) =>
    tx
      .insert(people)
      .values({ ...normalize(payload), code: await generateCode(tx) })
      .returning(),
  );
  const result = (await getPerson(row.id))!;
  await recordAudit({
    entityType: ENTITY,
    entityId: row.id,
    action: "created",
    newValue: result,
    userId,
  });
  return result;
}

export async function updatePerson(
  id: number,
  payload: PersonPayload,
  userId?: number,
) {
  const before = await getPerson(id);
  if (!before) return null;
  await assertTaskLinks(payload);
  const [row] = await db
    .update(people)
    .set(normalize(payload))
    .where(eq(people.id, id))
    .returning({ id: people.id });
  if (!row) return null;
  const result = (await getPerson(id))!;
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: before.status !== result.status ? "status_changed" : "updated",
    oldValue: before,
    newValue: result,
    userId,
  });
  return result;
}

async function setPersonStatus(
  id: number,
  status: "active" | "archived",
  userId?: number,
) {
  const [row] = await db
    .update(people)
    .set({ status, updatedAt: new Date() })
    .where(eq(people.id, id))
    .returning({ id: people.id });
  if (!row) return null;
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: status === "archived" ? "archived" : "restored",
    userId,
  });
  return getPerson(id);
}

export async function archivePerson(id: number, userId?: number) {
  return setPersonStatus(id, "archived", userId);
}

export async function restorePerson(id: number, userId?: number) {
  return setPersonStatus(id, "active", userId);
}

export async function getPersonAudit(id: number) {
  return listEntityAudit(ENTITY, id);
}

/**
 * The comparison key of a phone number: its last ten digits, so 0770…,
 * +964 770… and 00964770… are the same number. Shorter numbers are not
 * compared (a typo or an extension would match too much).
 */
export function phoneKey(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

const phoneKeySql = (column: AnyPgColumn) =>
  // The sql tag uses the cooked string, so the regex backslash is doubled.
  sql`right(regexp_replace(coalesce(${column}, ''), '\\D', '', 'g'), 10)`;

/**
 * Customers who already have one of these phone numbers or this national
 * ID, archived ones included: a warning before saving, never a merge.
 */
export async function findDuplicatePeople(query: {
  phones: string[];
  national_id?: string;
  exclude_id?: number;
}) {
  const keys = [
    ...new Set(query.phones.map(phoneKey).filter(Boolean)),
  ] as string[];
  const nationalId = query.national_id?.trim().toLowerCase() || null;
  const matches: SQL[] = [];
  for (const key of keys)
    matches.push(
      sql`${phoneKeySql(people.phonePrimary)} = ${key}`,
      sql`${phoneKeySql(people.phoneSecondary)} = ${key}`,
    );
  if (nationalId)
    matches.push(sql`lower(trim(${people.nationalId})) = ${nationalId}`);
  if (!matches.length) return [];
  const rows = await db
    .select()
    .from(people)
    .where(
      and(
        or(...matches),
        query.exclude_id ? ne(people.id, query.exclude_id) : undefined,
      ),
    )
    .orderBy(asc(people.id))
    .limit(20);
  return rows.map((row) => {
    const matched_on: Array<"phone" | "national_id"> = [];
    const rowKeys = [phoneKey(row.phonePrimary), phoneKey(row.phoneSecondary)];
    if (keys.some((key) => rowKeys.includes(key))) matched_on.push("phone");
    if (nationalId && row.nationalId?.trim().toLowerCase() === nationalId)
      matched_on.push("national_id");
    return {
      id: row.id,
      code: row.code,
      full_name: row.fullName,
      phone_primary: row.phonePrimary,
      phone_secondary: row.phoneSecondary,
      national_id: row.nationalId,
      status: row.status,
      matched_on,
    };
  });
}
