import { and, desc, eq, gte, ilike, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { properties, type NewProperty } from "../../infrastructure/database/schema.js";
import {
  PROPERTY_TYPE_PREFIX,
  type PropertyType
} from "../../shared/constants/domain.js";
import { calculateTotalPrice } from "../../shared/utils/pricing.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import {
  getDistrictName,
  getGovernorateName
} from "../locations/locations.repository.js";
import { listEntityAudit, recordAudit } from "../audit/audit.service.js";
import {
  type PropertyFilters,
  type PropertyPayload
} from "./properties.schema.js";

const ENTITY = "property";

export async function listProperties(filters: PropertyFilters) {
  const where = [];

  if (!filters.status) {
    where.push(ne(properties.status, "archived"));
  }

  addEqualFilter(where, properties.propertyType, filters.property_type);
  addEqualFilter(where, properties.legalType, filters.legal_type);
  addEqualFilter(where, properties.areaUnit, filters.area_unit);
  addEqualFilter(where, properties.pricingMethod, filters.pricing_method);
  addEqualFilter(where, properties.status, filters.status);

  if (typeof filters.governorate_id === "number") {
    where.push(eq(properties.governorateId, filters.governorate_id));
  }

  if (typeof filters.district_id === "number") {
    where.push(eq(properties.districtId, filters.district_id));
  }

  if (filters.district) {
    where.push(ilike(properties.district, `%${filters.district}%`));
  }

  if (typeof filters.price_min === "number") {
    where.push(gte(properties.totalPrice, String(filters.price_min)));
  }

  if (typeof filters.price_max === "number") {
    where.push(lte(properties.totalPrice, String(filters.price_max)));
  }

  if (filters.q) {
    const q = `%${filters.q}%`;
    where.push(
      or(
        ilike(properties.code, q),
        ilike(properties.propertyType, q),
        ilike(properties.legalType, q),
        ilike(properties.governorate, q),
        ilike(properties.city, q),
        ilike(properties.district, q),
        ilike(properties.governorateText, q),
        ilike(properties.districtText, q),
        ilike(properties.addressDetails, q),
        ilike(properties.ownerName, q),
        ilike(properties.ownerPhone, q),
        ilike(properties.notes, q),
        ilike(properties.plotNumber, q),
        ilike(properties.subdistrictName, q),
        ilike(properties.mahalla, q),
        ilike(properties.alley, q),
        ilike(properties.nearestLandmark, q),
        ilike(properties.frontage, q),
        ilike(properties.streetWidth, q),
        sql`cast(${properties.areaValue} as text) ilike ${q}`
      )
    );
  }

  const result = await db
    .select()
    .from(properties)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(properties.createdAt), desc(properties.id));

  return toApiObjects(result);
}

export async function getProperty(id: number) {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  return property ? toApiObject(property) : null;
}

export async function createProperty(payload: PropertyPayload, userId?: number) {
  const values = await normalizePayload(payload);
  const property = await db.transaction(async (tx) => {
    const code = await generatePropertyCode(payload.property_type);
    const [created] = await tx
      .insert(properties)
      .values({ ...values, code })
      .returning();
    return created;
  });

  const result = toApiObject(property);
  await recordAudit({
    entityType: ENTITY,
    entityId: property.id,
    action: "created",
    newValue: result,
    userId
  });
  return result;
}

export async function updateProperty(
  id: number,
  payload: PropertyPayload,
  userId?: number
) {
  const before = await getProperty(id);
  if (!before) return null;

  const values = await normalizePayload(payload);
  const [property] = await db
    .update(properties)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning();

  if (!property) return null;
  const after = toApiObject(property);

  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: "updated",
    oldValue: before,
    newValue: after,
    userId
  });

  if (String(before.total_price) !== String(after.total_price)) {
    await recordAudit({
      entityType: ENTITY,
      entityId: id,
      action: "price_changed",
      oldValue: { total_price: before.total_price },
      newValue: { total_price: after.total_price },
      userId
    });
  }

  if (before.status !== after.status) {
    await recordAudit({
      entityType: ENTITY,
      entityId: id,
      action: "status_changed",
      oldValue: { status: before.status },
      newValue: { status: after.status },
      userId
    });
  }

  return after;
}

export async function deleteProperty(id: number, userId?: number) {
  const [property] = await db
    .delete(properties)
    .where(eq(properties.id, id))
    .returning();
  if (!property) return null;

  const result = toApiObject(property);
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: "deleted",
    oldValue: result,
    userId
  });
  return result;
}

export async function archiveProperty(id: number, userId?: number) {
  const now = new Date();
  const [property] = await db
    .update(properties)
    .set({ status: "archived", archivedAt: now, updatedAt: now })
    .where(eq(properties.id, id))
    .returning();
  if (!property) return null;

  const result = toApiObject(property);
  await recordAudit({ entityType: ENTITY, entityId: id, action: "archived", userId });
  return result;
}

export async function restoreProperty(id: number, userId?: number) {
  const [property] = await db
    .update(properties)
    .set({ status: "available", archivedAt: null, updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning();
  if (!property) return null;

  const result = toApiObject(property);
  await recordAudit({ entityType: ENTITY, entityId: id, action: "restored", userId });
  return result;
}

export function getPropertyAudit(id: number) {
  return listEntityAudit(ENTITY, id);
}

async function generatePropertyCode(propertyType: PropertyType) {
  const prefix = PROPERTY_TYPE_PREFIX[propertyType] ?? "P";
  const [lastProperty] = await db
    .select({ code: properties.code })
    .from(properties)
    .where(ilike(properties.code, `${prefix}-%`))
    .orderBy(desc(properties.id))
    .limit(1);

  const lastCode = lastProperty?.code;
  const nextNumber = lastCode ? Number(lastCode.split("-")[1] ?? 0) + 1 : 1;
  return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
}

async function normalizePayload(
  payload: PropertyPayload
): Promise<Omit<NewProperty, "code">> {
  const total_price = calculateTotalPrice(payload);

  // حلّ اسم المحافظة/المنطقة: من القائمة (id) أو نص يدوي.
  const governorateName = payload.governorate_id
    ? await getGovernorateName(payload.governorate_id)
    : payload.governorate_text ?? payload.governorate ?? null;
  const districtName = payload.district_id
    ? await getDistrictName(payload.district_id)
    : payload.district_text ?? payload.district ?? null;

  return {
    propertyType: payload.property_type,
    legalType: payload.legal_type,
    areaValue: String(payload.area_value),
    areaUnit: payload.area_unit,
    pricingMethod: payload.pricing_method,
    unitPrice:
      payload.pricing_method === "سعر إجمالي مباشر"
        ? null
        : String(payload.unit_price),
    totalPrice: String(total_price),
    governorate: governorateName,
    city: payload.city,
    district: districtName,
    governorateId: payload.governorate_id ?? null,
    districtId: payload.district_id ?? null,
    governorateText: payload.governorate_id
      ? null
      : payload.governorate_text ?? payload.governorate ?? null,
    districtText: payload.district_id
      ? null
      : payload.district_text ?? payload.district ?? null,
    addressDetails: payload.address_details,
    ownerName: payload.owner_name,
    ownerPhone: payload.owner_phone,
    ownerNotes: payload.owner_notes,
    status: payload.status,
    notes: payload.notes,
    plotNumber: payload.plot_number,
    subdistrictNumber: payload.subdistrict_number,
    subdistrictName: payload.subdistrict_name,
    mahalla: payload.mahalla,
    alley: payload.alley,
    houseNumber: payload.house_number,
    nearestLandmark: payload.nearest_landmark,
    streetWidth: payload.street_width,
    frontage: payload.frontage,
    roomsCount: payload.rooms_count ?? null,
    bathroomsCount: payload.bathrooms_count ?? null,
    isNegotiable: payload.is_negotiable ?? false
  };
}

function addEqualFilter(
  where: ReturnType<typeof eq>[],
  column: Parameters<typeof eq>[0],
  value?: string
) {
  if (!value) {
    return;
  }

  where.push(eq(column, value));
}
