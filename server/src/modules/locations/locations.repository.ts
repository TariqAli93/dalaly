import { asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { type Transaction } from "../../infrastructure/database/record-codes.js";
import {
  districts,
  governorates,
  neighborhoods,
  properties,
} from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import { DomainError } from "../../shared/errors.js";
import {
  type DistrictPayload,
  type DistrictUpdatePayload,
  type GovernoratePayload,
  type NeighborhoodPayload,
  type NeighborhoodUpdatePayload,
} from "./locations.schema.js";

export async function getLocations() {
  const [governorateRows, districtRows, neighborhoodRows] = await Promise.all([
    db.select().from(governorates).orderBy(asc(governorates.name)),
    db.select().from(districts).orderBy(asc(districts.name)),
    db.select().from(neighborhoods).orderBy(asc(neighborhoods.name)),
  ]);

  return {
    governorates: toApiObjects(governorateRows),
    districts: toApiObjects(districtRows),
    neighborhoods: toApiObjects(neighborhoodRows),
  };
}

export async function createGovernorate(payload: GovernoratePayload) {
  const [row] = await db
    .insert(governorates)
    .values({ name: payload.name, isActive: payload.is_active })
    .returning();
  return toApiObject(row);
}

export async function updateGovernorate(
  id: number,
  payload: GovernoratePayload,
) {
  const [row] = await db
    .update(governorates)
    .set({
      name: payload.name,
      isActive: payload.is_active,
      updatedAt: new Date(),
    })
    .where(eq(governorates.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function deleteGovernorate(id: number) {
  const linked = await countPropertiesByGovernorate(id);
  if (linked > 0) {
    throw new DomainError(400, "لا يمكن حذف محافظة مرتبطة بعقارات.");
  }

  const [row] = await db
    .delete(governorates)
    .where(eq(governorates.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function createDistrict(payload: DistrictPayload) {
  const [row] = await db
    .insert(districts)
    .values({
      governorateId: payload.governorate_id,
      name: payload.name,
      isActive: payload.is_active,
    })
    .returning();
  return toApiObject(row);
}

export async function updateDistrict(
  id: number,
  payload: DistrictUpdatePayload,
) {
  const [row] = await db
    .update(districts)
    .set({
      name: payload.name,
      isActive: payload.is_active,
      updatedAt: new Date(),
    })
    .where(eq(districts.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function deleteDistrict(id: number) {
  const linked = await countPropertiesByDistrict(id);
  if (linked > 0) {
    throw new DomainError(400, "لا يمكن حذف منطقة مرتبطة بعقارات.");
  }

  const [row] = await db
    .delete(districts)
    .where(eq(districts.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function createNeighborhood(payload: NeighborhoodPayload) {
  const [row] = await db
    .insert(neighborhoods)
    .values({
      districtId: payload.district_id,
      name: payload.name,
      isActive: payload.is_active,
    })
    .returning();
  return toApiObject(row);
}

export async function updateNeighborhood(
  id: number,
  payload: NeighborhoodUpdatePayload,
) {
  const [row] = await db
    .update(neighborhoods)
    .set({
      name: payload.name,
      isActive: payload.is_active,
      updatedAt: new Date(),
    })
    .where(eq(neighborhoods.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function deleteNeighborhood(id: number) {
  const linked = await countPropertiesByNeighborhood(id);
  if (linked > 0) {
    throw new DomainError(400, "لا يمكن حذف حي مرتبط بعقارات.");
  }

  const [row] = await db
    .delete(neighborhoods)
    .where(eq(neighborhoods.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export type LocationIds = {
  governorate_id?: number | null;
  district_id?: number | null;
  neighborhood_id?: number | null;
};

type LocationLevel = "governorate" | "district" | "neighborhood";

/**
 * أسماء المحافظات والمناطق والأحياء المختارة من القوائم لعدة سجلات، باستعلام
 * واحد مهما كان عددها. المعرّف غير الموجود لا يظهر في النتيجة.
 */
export async function getLocationNamesByIds(
  records: LocationIds[],
  database: Pick<Transaction, "execute"> = db,
) {
  const names: Record<LocationLevel, Map<number, string>> = {
    governorate: new Map(),
    district: new Map(),
    neighborhood: new Map(),
  };
  const idsOf = (pick: (record: LocationIds) => number | null | undefined) => [
    ...new Set(records.map(pick).filter((id): id is number => Boolean(id))),
  ];
  const levels = [
    ["governorate", governorates, idsOf((r) => r.governorate_id)],
    ["district", districts, idsOf((r) => r.district_id)],
    ["neighborhood", neighborhoods, idsOf((r) => r.neighborhood_id)],
  ] as const;
  const selects = levels
    .filter(([, , ids]) => ids.length > 0)
    .map(
      ([level, table, ids]) =>
        sql`select ${level}::text as level, ${table.id} as id, ${table.name} as name from ${table} where ${inArray(table.id, ids)}`,
    );
  if (selects.length === 0) return names;

  const result = await database.execute<{
    level: LocationLevel;
    id: string | number;
    name: string;
  }>(sql.join(selects, sql` union all `));
  for (const row of result.rows) names[row.level].set(Number(row.id), row.name);
  return names;
}

/** أسماء المواقع المختارة لسجل واحد (null لما لم يُختر من القوائم). */
export async function getLocationNames(
  ids: LocationIds,
  database: Pick<Transaction, "execute"> = db,
) {
  return locationNamesOf(await getLocationNamesByIds([ids], database), ids);
}

/** أسماء مواقع سجل واحد من نتيجة getLocationNamesByIds. */
export function locationNamesOf(
  names: Awaited<ReturnType<typeof getLocationNamesByIds>>,
  ids: LocationIds,
) {
  const nameOf = (level: LocationLevel, id?: number | null) =>
    id ? (names[level].get(id) ?? null) : null;
  return {
    governorate: nameOf("governorate", ids.governorate_id),
    district: nameOf("district", ids.district_id),
    neighborhood: nameOf("neighborhood", ids.neighborhood_id),
  };
}

async function countPropertiesByGovernorate(id: number) {
  const [row] = await db
    .select({ count: count() })
    .from(properties)
    .where(eq(properties.governorateId, id));
  return Number(row?.count ?? 0);
}

async function countPropertiesByDistrict(id: number) {
  const [row] = await db
    .select({ count: count() })
    .from(properties)
    .where(eq(properties.districtId, id));
  return Number(row?.count ?? 0);
}

async function countPropertiesByNeighborhood(id: number) {
  const [row] = await db
    .select({ count: count() })
    .from(properties)
    .where(eq(properties.neighborhoodId, id));
  return Number(row?.count ?? 0);
}
