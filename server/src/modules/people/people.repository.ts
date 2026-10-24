import { and, asc, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  people,
  type NewPerson,
} from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
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
    updatedAt: new Date(),
  };
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
function personConditions(filters: PersonFilters) {
  const where: SQL[] = [];
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

export async function listPeople(filters: PersonFilters) {
  return toApiObjects(
    await db
      .select()
      .from(people)
      .where(personConditions(filters))
      .orderBy(desc(people.updatedAt), desc(people.id)),
  );
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

export async function listPeoplePage(query: PersonPageQuery) {
  const condition = personConditions(query);
  const rows = await db
    .select({ person: people, total: totalRowsColumn() })
    .from(people)
    .where(condition)
    .orderBy(...personOrder(query.sort_by, query.sort_order))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  // صفحة بعد النهاية لا صفوف فيها تحمل العدد، فيُعدّ منفصلاً.
  const total =
    rows[0]?.total ?? (query.page > 1 ? await db.$count(people, condition) : 0);
  return {
    items: toApiObjects(rows.map((row) => row.person)),
    total,
    page: query.page,
    page_size: query.page_size,
  };
}

export async function getPerson(id: number) {
  const [row] = await db
    .select()
    .from(people)
    .where(eq(people.id, id))
    .limit(1);
  return row ? toApiObject(row) : null;
}

export async function createPerson(payload: PersonPayload) {
  const [row] = await withRecordCodeLock("people", async (tx) =>
    tx
      .insert(people)
      .values({ ...normalize(payload), code: await generateCode(tx) })
      .returning(),
  );
  return toApiObject(row);
}

export async function updatePerson(id: number, payload: PersonPayload) {
  const [row] = await db
    .update(people)
    .set(normalize(payload))
    .where(eq(people.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function archivePerson(id: number) {
  const [row] = await db
    .update(people)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(people.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function restorePerson(id: number) {
  const [row] = await db
    .update(people)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(people.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}
