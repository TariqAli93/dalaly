import { and, desc, eq, gte, ilike, lte, ne, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { properties, type NewProperty } from "../../infrastructure/database/schema.js";
import {
  PROPERTY_TYPE_PREFIX,
  type PropertyType
} from "../../shared/constants/domain.js";
import { calculateTotalPrice } from "../../shared/utils/pricing.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import {
  type PropertyFilters,
  type PropertyPayload
} from "./properties.schema.js";

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
        ilike(properties.ownerName, q),
        ilike(properties.ownerPhone, q)
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

export async function createProperty(payload: PropertyPayload) {
  const property = await db.transaction(async (tx) => {
    const code = await generatePropertyCode(payload.property_type);
    const [created] = await tx
      .insert(properties)
      .values({ ...normalizePayload(payload), code })
      .returning();
    return created;
  });

  return toApiObject(property);
}

export async function updateProperty(id: number, payload: PropertyPayload) {
  const [property] = await db
    .update(properties)
    .set({ ...normalizePayload(payload), updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning();

  return property ? toApiObject(property) : null;
}

export async function deleteProperty(id: number) {
  const [property] = await db
    .delete(properties)
    .where(eq(properties.id, id))
    .returning();
  return property ? toApiObject(property) : null;
}

export async function archiveProperty(id: number) {
  const now = new Date();
  const [property] = await db
    .update(properties)
    .set({ status: "archived", archivedAt: now, updatedAt: now })
    .where(eq(properties.id, id))
    .returning();

  return property ? toApiObject(property) : null;
}

export async function restoreProperty(id: number) {
  const [property] = await db
    .update(properties)
    .set({ status: "available", archivedAt: null, updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning();

  return property ? toApiObject(property) : null;
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

function normalizePayload(payload: PropertyPayload): Omit<NewProperty, "code"> {
  const total_price = calculateTotalPrice(payload);

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
    governorate: payload.governorate,
    city: payload.city,
    district: payload.district,
    addressDetails: payload.address_details,
    ownerName: payload.owner_name,
    ownerPhone: payload.owner_phone,
    ownerNotes: payload.owner_notes,
    status: payload.status,
    notes: payload.notes
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
