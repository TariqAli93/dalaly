import { and, desc, eq, gte, ilike, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { rentals, type NewRental } from "../../infrastructure/database/schema.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import { getDistrictName, getGovernorateName, getNeighborhoodName } from "../locations/locations.repository.js";
import { listEntityAudit, recordAudit } from "../audit/audit.service.js";
import { type RentalFilters, type RentalPayload } from "./rentals.schema.js";

const ENTITY = "rental";
const SEARCHABLE_COLUMNS = [
  rentals.code, rentals.name, rentals.propertyType, rentals.rentPeriod, rentals.areaUnit,
  rentals.governorate, rentals.district, rentals.neighborhood, rentals.addressDetails,
  rentals.ownerName, rentals.ownerPhone, rentals.ownerNotes, rentals.otherDetails, rentals.notes
];

function parseAmenities(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function searchClause(term: string): SQL {
  const like = `%${term}%`;
  return or(...SEARCHABLE_COLUMNS.map((column) => ilike(column, like)), sql`cast(${rentals.rentPrice} as text) ilike ${like}`, sql`cast(${rentals.areaValue} as text) ilike ${like}`)!;
}

export async function listRentals(filters: RentalFilters) {
  const where: SQL[] = filters.status ? [] : [ne(rentals.status, "archived")];
  if (filters.status) where.push(eq(rentals.status, filters.status));
  if (filters.property_type) where.push(eq(rentals.propertyType, filters.property_type));
  if (filters.rent_period) where.push(eq(rentals.rentPeriod, filters.rent_period));
  if (typeof filters.rent_price_min === "number") where.push(gte(rentals.rentPrice, String(filters.rent_price_min)));
  if (typeof filters.rent_price_max === "number") where.push(lte(rentals.rentPrice, String(filters.rent_price_max)));
  if (typeof filters.area_min === "number") where.push(gte(rentals.areaValue, String(filters.area_min)));
  if (typeof filters.area_max === "number") where.push(lte(rentals.areaValue, String(filters.area_max)));
  if (typeof filters.rooms_count === "number") where.push(gte(rentals.roomsCount, filters.rooms_count));
  if (typeof filters.bathrooms_count === "number") where.push(gte(rentals.bathroomsCount, filters.bathrooms_count));
  if (typeof filters.floors_count === "number") where.push(gte(rentals.floorsCount, filters.floors_count));
  if (typeof filters.governorate_id === "number") where.push(eq(rentals.governorateId, filters.governorate_id));
  if (typeof filters.district_id === "number") where.push(eq(rentals.districtId, filters.district_id));
  if (typeof filters.neighborhood_id === "number") where.push(eq(rentals.neighborhoodId, filters.neighborhood_id));
  if (filters.negotiable) where.push(eq(rentals.isNegotiable, filters.negotiable === "true"));
  const amenities = parseAmenities(filters.amenities);
  if (amenities) where.push(sql`${rentals.amenities} @> ${JSON.stringify(amenities)}::jsonb`);
  const search = (filters.q ?? "").trim();
  if (search) for (const token of search.split(/\s+/).filter(Boolean)) where.push(searchClause(token));
  let query = db.select().from(rentals).where(and(...where)).orderBy(desc(rentals.createdAt), desc(rentals.id)).$dynamic();
  if (typeof filters.limit === "number") query = query.limit(filters.limit).offset(filters.offset ?? 0);
  return toApiObjects(await query, "rentals");
}

export async function getRental(id: number) {
  const [rental] = await db.select().from(rentals).where(eq(rentals.id, id)).limit(1);
  return rental ? toApiObject(rental, "rentals") : null;
}

async function normalizePayload(payload: RentalPayload): Promise<Omit<NewRental, "code">> {
  const governorate = payload.governorate_id ? await getGovernorateName(payload.governorate_id) : payload.governorate ?? null;
  const district = payload.district_id ? await getDistrictName(payload.district_id) : payload.district ?? null;
  const neighborhood = payload.neighborhood_id ? await getNeighborhoodName(payload.neighborhood_id) : payload.neighborhood ?? null;
  return {
    name: payload.name ?? null,
    propertyType: payload.property_type,
    rentPrice: String(payload.rent_price),
    rentPeriod: payload.rent_period,
    areaValue: String(payload.area_value),
    areaUnit: payload.area_unit,
    floorsCount: payload.floors_count ?? null,
    roomsCount: payload.rooms_count ?? null,
    bathroomsCount: payload.bathrooms_count ?? null,
    amenities: payload.amenities,
    otherDetails: payload.other_details,
    governorateId: payload.governorate_id ?? null,
    districtId: payload.district_id ?? null,
    neighborhoodId: payload.neighborhood_id ?? null,
    governorate, district, neighborhood,
    addressDetails: payload.address_details,
    ownerCustomerId: payload.owner_customer_id ?? null,
    ownerName: payload.owner_name,
    ownerPhone: payload.owner_phone,
    ownerNotes: payload.owner_notes,
    status: payload.status,
    isNegotiable: payload.is_negotiable,
    notes: payload.notes,
  };
}

async function generateRentalCode() {
  const [last] = await db.select({ code: rentals.code }).from(rentals).where(ilike(rentals.code, "R-%")).orderBy(desc(rentals.id)).limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `R-${String(next).padStart(4, "0")}`;
}

export async function createRental(payload: RentalPayload, userId?: number) {
  const [row] = await db.insert(rentals).values({ ...(await normalizePayload(payload)), code: await generateRentalCode() }).returning();
  const result = toApiObject(row, "rentals");
  await recordAudit({ entityType: ENTITY, entityId: row.id, action: "created", newValue: result, userId });
  return result;
}

export async function updateRental(id: number, payload: RentalPayload, userId?: number) {
  const before = await getRental(id);
  if (!before) return null;
  const [row] = await db.update(rentals).set({ ...(await normalizePayload(payload)), updatedAt: new Date() }).where(eq(rentals.id, id)).returning();
  if (!row) return null;
  const result = toApiObject(row, "rentals");
  await recordAudit({ entityType: ENTITY, entityId: id, action: "updated", oldValue: before, newValue: result, userId });
  return result;
}

export async function deleteRental(id: number, userId?: number) {
  const [row] = await db.delete(rentals).where(eq(rentals.id, id)).returning();
  if (!row) return null;
  const result = toApiObject(row, "rentals");
  await recordAudit({ entityType: ENTITY, entityId: id, action: "deleted", oldValue: result, userId });
  return result;
}

export async function archiveRental(id: number, userId?: number) {
  const now = new Date();
  const [row] = await db.update(rentals).set({ status: "archived", archivedAt: now, updatedAt: now }).where(eq(rentals.id, id)).returning();
  if (!row) return null;
  const result = toApiObject(row, "rentals");
  await recordAudit({ entityType: ENTITY, entityId: id, action: "archived", userId });
  return result;
}

export async function restoreRental(id: number, userId?: number) {
  const [row] = await db.update(rentals).set({ status: "available", archivedAt: null, updatedAt: new Date() }).where(eq(rentals.id, id)).returning();
  if (!row) return null;
  const result = toApiObject(row, "rentals");
  await recordAudit({ entityType: ENTITY, entityId: id, action: "restored", userId });
  return result;
}

export function getRentalAudit(id: number) { return listEntityAudit(ENTITY, id); }
