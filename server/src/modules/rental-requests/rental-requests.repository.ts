import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { rentalRequests, customers, type NewRentalRequest } from "../../infrastructure/database/schema.js";
import { getDistrictName, getGovernorateName, getNeighborhoodName } from "../locations/locations.repository.js";
import { toApiObject } from "../../shared/utils/case.js";
import type { RentalRequestFilters, RentalRequestPayload } from "./rental-requests.schema.js";

function apiRow(request: Record<string, unknown>, customerName: string | null, customerCode: string | null) {
  return { ...toApiObject(request), customer_name: customerName, customer_code: customerCode };
}

async function normalize(payload: RentalRequestPayload): Promise<Omit<NewRentalRequest, "code">> {
  return {
    customerId: payload.customer_id,
    propertyType: payload.property_type,
    rentPeriod: payload.rent_period ?? null,
    budgetMin: payload.budget_min === null || payload.budget_min === undefined ? null : String(payload.budget_min),
    budgetMax: payload.budget_max === null || payload.budget_max === undefined ? null : String(payload.budget_max),
    areaUnit: payload.area_unit,
    areaMin: payload.area_min === null || payload.area_min === undefined ? null : String(payload.area_min),
    areaMax: payload.area_max === null || payload.area_max === undefined ? null : String(payload.area_max),
    floorsCount: payload.floors_count ?? null,
    roomsCount: payload.rooms_count ?? null,
    bathroomsCount: payload.bathrooms_count ?? null,
    governorateId: payload.governorate_id ?? null,
    districtId: payload.district_id ?? null,
    neighborhoodId: payload.neighborhood_id ?? null,
    governorate: payload.governorate_id ? await getGovernorateName(payload.governorate_id) : payload.governorate,
    district: payload.district_id ? await getDistrictName(payload.district_id) : payload.district,
    neighborhood: payload.neighborhood_id ? await getNeighborhoodName(payload.neighborhood_id) : payload.neighborhood,
    amenities: payload.amenities,
    otherRequirements: payload.other_requirements,
    status: payload.status,
    notes: payload.notes,
    updatedAt: new Date(),
  };
}

async function generateCode() {
  const [last] = await db.select({ code: rentalRequests.code }).from(rentalRequests).orderBy(desc(rentalRequests.id)).limit(1);
  return `RR-${String((last?.code ? Number(last.code.split("-")[1] ?? 0) : 0) + 1).padStart(4, "0")}`;
}

export async function listRentalRequests(filters: RentalRequestFilters) {
  const where = [];
  if (filters.customer_id) where.push(eq(rentalRequests.customerId, filters.customer_id));
  if (filters.property_type) where.push(eq(rentalRequests.propertyType, filters.property_type));
  if (filters.rent_period) where.push(eq(rentalRequests.rentPeriod, filters.rent_period));
  if (filters.status) where.push(eq(rentalRequests.status, filters.status));
  else where.push(ne(rentalRequests.status, "archived"));
  if (filters.governorate_id) where.push(eq(rentalRequests.governorateId, filters.governorate_id));
  if (filters.district_id) where.push(eq(rentalRequests.districtId, filters.district_id));
  if (filters.q) where.push(or(ilike(rentalRequests.code, `%${filters.q}%`), ilike(rentalRequests.otherRequirements, `%${filters.q}%`), ilike(rentalRequests.notes, `%${filters.q}%`)));
  const rows = await db.select({ request: rentalRequests, customerName: customers.fullName, customerCode: customers.code }).from(rentalRequests).innerJoin(customers, eq(rentalRequests.customerId, customers.id)).where(where.length ? and(...where) : undefined).orderBy(desc(rentalRequests.updatedAt), desc(rentalRequests.id));
  return rows.map((row) => apiRow(row.request, row.customerName, row.customerCode));
}

export async function getRentalRequest(id: number) {
  const [row] = await db.select({ request: rentalRequests, customerName: customers.fullName, customerCode: customers.code }).from(rentalRequests).innerJoin(customers, eq(rentalRequests.customerId, customers.id)).where(eq(rentalRequests.id, id)).limit(1);
  return row ? apiRow(row.request, row.customerName, row.customerCode) : null;
}

export async function createRentalRequest(payload: RentalRequestPayload) {
  const [row] = await db.insert(rentalRequests).values({ ...(await normalize(payload)), code: await generateCode() }).returning();
  return getRentalRequest(row.id);
}

export async function updateRentalRequest(id: number, payload: RentalRequestPayload) {
  const [row] = await db.update(rentalRequests).set(await normalize(payload)).where(eq(rentalRequests.id, id)).returning();
  return row ? getRentalRequest(row.id) : null;
}
