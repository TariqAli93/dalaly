import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  districts,
  governorates,
  neighborhoods,
  properties
} from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import {
  type DistrictPayload,
  type DistrictUpdatePayload,
  type GovernoratePayload,
  type NeighborhoodPayload,
  type NeighborhoodUpdatePayload
} from "./locations.schema.js";

export async function getLocations() {
  const [governorateRows, districtRows, neighborhoodRows] = await Promise.all([
    db.select().from(governorates).orderBy(asc(governorates.name)),
    db.select().from(districts).orderBy(asc(districts.name)),
    db.select().from(neighborhoods).orderBy(asc(neighborhoods.name))
  ]);

  return {
    governorates: toApiObjects(governorateRows),
    districts: toApiObjects(districtRows),
    neighborhoods: toApiObjects(neighborhoodRows)
  };
}

export async function createGovernorate(payload: GovernoratePayload) {
  const [row] = await db
    .insert(governorates)
    .values({ name: payload.name, isActive: payload.is_active })
    .returning();
  return toApiObject(row);
}

export async function updateGovernorate(id: number, payload: GovernoratePayload) {
  const [row] = await db
    .update(governorates)
    .set({ name: payload.name, isActive: payload.is_active, updatedAt: new Date() })
    .where(eq(governorates.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function deleteGovernorate(id: number) {
  const linked = await countPropertiesByGovernorate(id);
  if (linked > 0) {
    throw new Error("لا يمكن حذف محافظة مرتبطة بعقارات.");
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
      isActive: payload.is_active
    })
    .returning();
  return toApiObject(row);
}

export async function updateDistrict(id: number, payload: DistrictUpdatePayload) {
  const [row] = await db
    .update(districts)
    .set({ name: payload.name, isActive: payload.is_active, updatedAt: new Date() })
    .where(eq(districts.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function deleteDistrict(id: number) {
  const linked = await countPropertiesByDistrict(id);
  if (linked > 0) {
    throw new Error("لا يمكن حذف منطقة مرتبطة بعقارات.");
  }

  const [row] = await db.delete(districts).where(eq(districts.id, id)).returning();
  return row ? toApiObject(row) : null;
}

export async function createNeighborhood(payload: NeighborhoodPayload) {
  const [row] = await db
    .insert(neighborhoods)
    .values({
      districtId: payload.district_id,
      name: payload.name,
      isActive: payload.is_active
    })
    .returning();
  return toApiObject(row);
}

export async function updateNeighborhood(
  id: number,
  payload: NeighborhoodUpdatePayload
) {
  const [row] = await db
    .update(neighborhoods)
    .set({ name: payload.name, isActive: payload.is_active, updatedAt: new Date() })
    .where(eq(neighborhoods.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function deleteNeighborhood(id: number) {
  const linked = await countPropertiesByNeighborhood(id);
  if (linked > 0) {
    throw new Error("لا يمكن حذف حي مرتبط بعقارات.");
  }

  const [row] = await db
    .delete(neighborhoods)
    .where(eq(neighborhoods.id, id))
    .returning();
  return row ? toApiObject(row) : null;
}

export async function getGovernorateName(id: number) {
  const [row] = await db
    .select({ name: governorates.name })
    .from(governorates)
    .where(eq(governorates.id, id))
    .limit(1);
  return row?.name ?? null;
}

export async function getDistrictName(id: number) {
  const [row] = await db
    .select({ name: districts.name })
    .from(districts)
    .where(eq(districts.id, id))
    .limit(1);
  return row?.name ?? null;
}

export async function getNeighborhoodName(id: number) {
  const [row] = await db
    .select({ name: neighborhoods.name })
    .from(neighborhoods)
    .where(eq(neighborhoods.id, id))
    .limit(1);
  return row?.name ?? null;
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

// تستخدمها وحدة المواقع لاحقاً عند الحاجة لمنع التكرار داخل المحافظة.
export async function districtExists(governorateId: number, name: string) {
  const [row] = await db
    .select({ id: districts.id })
    .from(districts)
    .where(and(eq(districts.governorateId, governorateId), eq(districts.name, name)))
    .limit(1);
  return Boolean(row);
}

// تمنع تكرار الحي داخل نفس المنطقة عند الحاجة.
export async function neighborhoodExists(districtId: number, name: string) {
  const [row] = await db
    .select({ id: neighborhoods.id })
    .from(neighborhoods)
    .where(
      and(eq(neighborhoods.districtId, districtId), eq(neighborhoods.name, name))
    )
    .limit(1);
  return Boolean(row);
}
