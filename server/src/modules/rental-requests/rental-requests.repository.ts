import { and, asc, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  rentalRequests,
  people,
  type NewRentalRequest,
} from "../../infrastructure/database/schema.js";
import { getLocationNames } from "../locations/locations.repository.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  pageOffset,
  sortNullsLast,
  totalRowsColumn,
  type SortOrder,
} from "../../shared/utils/paging.js";
import type {
  RentalRequestFilters,
  RentalRequestPageQuery,
  RentalRequestPayload,
  RentalRequestSortKey,
} from "./rental-requests.schema.js";
import {
  withRecordCodeLock,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";

function apiRow(
  request: Record<string, unknown>,
  customerName: string | null,
  customerCode: string | null,
) {
  return {
    ...toApiObject(request),
    person_name: customerName,
    person_code: customerCode,
  };
}

async function normalize(
  payload: RentalRequestPayload,
): Promise<Omit<NewRentalRequest, "code">> {
  const names = await getLocationNames(payload);
  return {
    personId: payload.person_id,
    propertyType: payload.property_type,
    rentPeriod: payload.rent_period ?? null,
    budgetMin:
      payload.budget_min === null || payload.budget_min === undefined
        ? null
        : String(payload.budget_min),
    budgetMax:
      payload.budget_max === null || payload.budget_max === undefined
        ? null
        : String(payload.budget_max),
    areaUnit: payload.area_unit,
    areaMin:
      payload.area_min === null || payload.area_min === undefined
        ? null
        : String(payload.area_min),
    areaMax:
      payload.area_max === null || payload.area_max === undefined
        ? null
        : String(payload.area_max),
    floorsCount: payload.floors_count ?? null,
    roomsCount: payload.rooms_count ?? null,
    bathroomsCount: payload.bathrooms_count ?? null,
    governorateId: payload.governorate_id ?? null,
    districtId: payload.district_id ?? null,
    neighborhoodId: payload.neighborhood_id ?? null,
    governorate: payload.governorate_id
      ? names.governorate
      : payload.governorate,
    district: payload.district_id ? names.district : payload.district,
    neighborhood: payload.neighborhood_id
      ? names.neighborhood
      : payload.neighborhood,
    amenities: payload.amenities,
    otherRequirements: payload.other_requirements,
    status: payload.status,
    notes: payload.notes,
    updatedAt: new Date(),
  };
}

async function generateCode(tx: Transaction) {
  const [last] = await tx
    .select({ code: rentalRequests.code })
    .from(rentalRequests)
    .orderBy(desc(rentalRequests.id))
    .limit(1);
  return `RR-${String((last?.code ? Number(last.code.split("-")[1] ?? 0) : 0) + 1).padStart(4, "0")}`;
}

/** شروط الفلاتر والبحث المشتركة بين القائمة الكاملة والقائمة المقسّمة. */
function rentalRequestConditions(filters: RentalRequestFilters) {
  const where: SQL[] = [];
  if (filters.person_id)
    where.push(eq(rentalRequests.personId, filters.person_id));
  if (filters.property_type)
    where.push(eq(rentalRequests.propertyType, filters.property_type));
  if (filters.rent_period)
    where.push(eq(rentalRequests.rentPeriod, filters.rent_period));
  if (filters.status) where.push(eq(rentalRequests.status, filters.status));
  else where.push(ne(rentalRequests.status, "archived"));
  if (filters.governorate_id)
    where.push(eq(rentalRequests.governorateId, filters.governorate_id));
  if (filters.district_id)
    where.push(eq(rentalRequests.districtId, filters.district_id));
  if (filters.q)
    where.push(
      or(
        ilike(rentalRequests.code, `%${filters.q}%`),
        ilike(rentalRequests.otherRequirements, `%${filters.q}%`),
        ilike(rentalRequests.notes, `%${filters.q}%`),
      )!,
    );
  return and(...where);
}

export async function listRentalRequests(filters: RentalRequestFilters) {
  const rows = await db
    .select({
      request: rentalRequests,
      personName: people.fullName,
      personCode: people.code,
    })
    .from(rentalRequests)
    .innerJoin(people, eq(rentalRequests.personId, people.id))
    .where(rentalRequestConditions(filters))
    .orderBy(desc(rentalRequests.updatedAt), desc(rentalRequests.id));
  return rows.map((row) => apiRow(row.request, row.personName, row.personCode));
}

const RENTAL_REQUEST_SORT_COLUMNS: Record<RentalRequestSortKey, AnyPgColumn> = {
  updated_at: rentalRequests.updatedAt,
  created_at: rentalRequests.createdAt,
  code: rentalRequests.code,
  person_name: people.fullName,
  property_type: rentalRequests.propertyType,
  rent_period: rentalRequests.rentPeriod,
  budget_max: rentalRequests.budgetMax,
  district: rentalRequests.district,
  status: rentalRequests.status,
};

/** فرز ثانوي ثابت بين الصفحات، والترتيب الافتراضي (آخر تحديث) عند التساوي. */
function rentalRequestOrder(
  sortKey: RentalRequestSortKey,
  order: SortOrder,
): SQL[] {
  if (sortKey === "updated_at" || sortKey === "created_at")
    return [
      sortNullsLast(RENTAL_REQUEST_SORT_COLUMNS[sortKey], order),
      order === "asc" ? asc(rentalRequests.id) : desc(rentalRequests.id),
    ];
  return [
    sortNullsLast(RENTAL_REQUEST_SORT_COLUMNS[sortKey], order),
    desc(rentalRequests.updatedAt),
    desc(rentalRequests.id),
  ];
}

export async function listRentalRequestsPage(query: RentalRequestPageQuery) {
  const condition = rentalRequestConditions(query);
  const rows = await db
    .select({
      request: rentalRequests,
      personName: people.fullName,
      personCode: people.code,
      total: totalRowsColumn(),
    })
    .from(rentalRequests)
    .innerJoin(people, eq(rentalRequests.personId, people.id))
    .where(condition)
    .orderBy(...rentalRequestOrder(query.sort_by, query.sort_order))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  // صفحة بعد النهاية لا صفوف فيها تحمل العدد، فيُعدّ منفصلاً (الشروط على الطلب
  // وحده؛ الربط بالشخص لا يُسقط صفاً لأن person_id إلزامي).
  const total =
    rows[0]?.total ??
    (query.page > 1 ? await db.$count(rentalRequests, condition) : 0);
  return {
    items: rows.map((row) =>
      apiRow(row.request, row.personName, row.personCode),
    ),
    total,
    page: query.page,
    page_size: query.page_size,
  };
}

export async function getRentalRequest(id: number) {
  const [row] = await db
    .select({
      request: rentalRequests,
      personName: people.fullName,
      personCode: people.code,
    })
    .from(rentalRequests)
    .innerJoin(people, eq(rentalRequests.personId, people.id))
    .where(eq(rentalRequests.id, id))
    .limit(1);
  return row ? apiRow(row.request, row.personName, row.personCode) : null;
}

export async function createRentalRequest(payload: RentalRequestPayload) {
  const values = await normalize(payload);
  const [row] = await withRecordCodeLock("rental_requests", async (tx) =>
    tx
      .insert(rentalRequests)
      .values({ ...values, code: await generateCode(tx) })
      .returning(),
  );
  return getRentalRequest(row.id);
}

export async function updateRentalRequest(
  id: number,
  payload: RentalRequestPayload,
) {
  const [row] = await db
    .update(rentalRequests)
    .set(await normalize(payload))
    .where(eq(rentalRequests.id, id))
    .returning();
  return row ? getRentalRequest(row.id) : null;
}
