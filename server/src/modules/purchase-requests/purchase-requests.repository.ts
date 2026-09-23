import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  customers,
  purchaseRequests,
  type NewPurchaseRequest,
} from "../../infrastructure/database/schema.js";
import {
  getDistrictName,
  getGovernorateName,
  getNeighborhoodName,
} from "../locations/locations.repository.js";
import { toApiObject } from "../../shared/utils/case.js";
import type {
  PurchaseRequestFilters,
  PurchaseRequestPayload,
} from "./purchase-requests.schema.js";

function apiRow(
  request: Record<string, unknown>,
  customerName: string | null,
  customerCode: string | null,
) {
  return {
    ...toApiObject(request),
    customer_name: customerName,
    customer_code: customerCode,
  };
}
async function normalize(
  payload: PurchaseRequestPayload,
): Promise<Omit<NewPurchaseRequest, "code">> {
  return {
    customerId: payload.customer_id,
    propertyType: payload.property_type,
    budgetMin: payload.budget_min == null ? null : String(payload.budget_min),
    budgetMax: payload.budget_max == null ? null : String(payload.budget_max),
    areaUnit: payload.area_unit,
    areaMin: payload.area_min == null ? null : String(payload.area_min),
    areaMax: payload.area_max == null ? null : String(payload.area_max),
    roomsCount: payload.rooms_count ?? null,
    bathroomsCount: payload.bathrooms_count ?? null,
    floorsCount: payload.floors_count ?? null,
    governorateId: payload.governorate_id ?? null,
    districtId: payload.district_id ?? null,
    neighborhoodId: payload.neighborhood_id ?? null,
    governorate: payload.governorate_id
      ? await getGovernorateName(payload.governorate_id)
      : payload.governorate,
    district: payload.district_id
      ? await getDistrictName(payload.district_id)
      : payload.district,
    neighborhood: payload.neighborhood_id
      ? await getNeighborhoodName(payload.neighborhood_id)
      : payload.neighborhood,
    amenities: payload.amenities,
    otherRequirements: payload.other_requirements,
    status: payload.status,
    notes: payload.notes,
    updatedAt: new Date(),
  };
}
async function generateCode() {
  const [last] = await db
    .select({ code: purchaseRequests.code })
    .from(purchaseRequests)
    .orderBy(desc(purchaseRequests.id))
    .limit(1);
  return `PR-${String((last?.code ? Number(last.code.split("-")[1] ?? 0) : 0) + 1).padStart(4, "0")}`;
}
export async function listPurchaseRequests(filters: PurchaseRequestFilters) {
  const where = [];
  if (filters.customer_id)
    where.push(eq(purchaseRequests.customerId, filters.customer_id));
  if (filters.property_type)
    where.push(eq(purchaseRequests.propertyType, filters.property_type));
  if (filters.status) where.push(eq(purchaseRequests.status, filters.status));
  else where.push(ne(purchaseRequests.status, "archived"));
  if (filters.governorate_id)
    where.push(eq(purchaseRequests.governorateId, filters.governorate_id));
  if (filters.district_id)
    where.push(eq(purchaseRequests.districtId, filters.district_id));
  if (filters.q)
    where.push(
      or(
        ilike(purchaseRequests.code, `%${filters.q}%`),
        ilike(purchaseRequests.otherRequirements, `%${filters.q}%`),
        ilike(purchaseRequests.notes, `%${filters.q}%`),
      ),
    );
  const rows = await db
    .select({
      request: purchaseRequests,
      customerName: customers.fullName,
      customerCode: customers.code,
    })
    .from(purchaseRequests)
    .innerJoin(customers, eq(purchaseRequests.customerId, customers.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(purchaseRequests.updatedAt), desc(purchaseRequests.id));
  return rows.map((row) =>
    apiRow(row.request, row.customerName, row.customerCode),
  );
}
export async function getPurchaseRequest(id: number) {
  const [row] = await db
    .select({
      request: purchaseRequests,
      customerName: customers.fullName,
      customerCode: customers.code,
    })
    .from(purchaseRequests)
    .innerJoin(customers, eq(purchaseRequests.customerId, customers.id))
    .where(eq(purchaseRequests.id, id))
    .limit(1);
  return row ? apiRow(row.request, row.customerName, row.customerCode) : null;
}
export async function createPurchaseRequest(payload: PurchaseRequestPayload) {
  const [row] = await db
    .insert(purchaseRequests)
    .values({ ...(await normalize(payload)), code: await generateCode() })
    .returning();
  return getPurchaseRequest(row.id);
}
export async function updatePurchaseRequest(
  id: number,
  payload: PurchaseRequestPayload,
) {
  const [row] = await db
    .update(purchaseRequests)
    .set(await normalize(payload))
    .where(eq(purchaseRequests.id, id))
    .returning();
  return row ? getPurchaseRequest(row.id) : null;
}
