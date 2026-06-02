import { and, desc, eq, gte, ilike, lte, ne, or, sql } from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import { properties, type NewProperty } from "../../infrastructure/database/schema.js";
import {
  PROPERTY_TYPE_PREFIX,
  type PropertyType
} from "../../shared/constants/domain.js";
import { calculateTotalPrice } from "../../shared/utils/pricing.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import { DuplicatePlotError } from "../../shared/errors.js";
import {
  getDistrictName,
  getGovernorateName,
  getNeighborhoodName
} from "../locations/locations.repository.js";
import { listEntityAudit, recordAudit } from "../audit/audit.service.js";
import {
  type PropertyFilters,
  type PropertyPayload
} from "./properties.schema.js";

const ENTITY = "property";
const PLOT_UNIQUE_INDEX = "uq_properties_plot_identity";

/** تطبيع جزء من هوية القطعة: trim + توحيد المسافات الداخلية + توحيد null/'' . */
function normalizeKeyPart(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * يرجع اسم مالك العرض المسجَّل مسبقاً إن وُجدت قطعة مطابقة، وإلا null.
 * المطابقة على القيم المطبّعة لـ (المحافظة، المنطقة، الحي، رقم القطعة، حرف القطعة).
 * يتم تخطّي الفحص إذا لم يوجد رقم قطعة. excludeId يستثني السجل الحالي عند التعديل.
 */
async function findDuplicatePlotOwner(
  values: Pick<
    NewProperty,
    "governorate" | "district" | "neighborhood" | "plotNumber" | "plotLetter"
  >,
  excludeId?: number
): Promise<string | null> {
  const plotNumber = normalizeKeyPart(values.plotNumber);
  if (!plotNumber) return null;

  const norm = (column: AnyPgColumn) =>
    sql`regexp_replace(btrim(coalesce(${column}, '')), '\s+', ' ', 'g')`;

  const conditions = [
    sql`${norm(properties.governorate)} = ${normalizeKeyPart(values.governorate)}`,
    sql`${norm(properties.district)} = ${normalizeKeyPart(values.district)}`,
    sql`${norm(properties.neighborhood)} = ${normalizeKeyPart(values.neighborhood)}`,
    sql`${norm(properties.plotNumber)} = ${plotNumber}`,
    sql`${norm(properties.plotLetter)} = ${normalizeKeyPart(values.plotLetter)}`
  ];
  if (excludeId !== undefined) {
    conditions.push(ne(properties.id, excludeId));
  }

  const [row] = await db
    .select({ ownerName: properties.ownerName })
    .from(properties)
    .where(and(...conditions))
    .limit(1);
  return row?.ownerName ?? null;
}

/** هل الخطأ ناتج عن انتهاك فهرس تفرّد القطعة (طبقة الأمان)؟ */
function isUniquePlotViolation(error: unknown): boolean {
  const pgError = error as { code?: string; constraint?: string } | null;
  return (
    pgError?.code === "23505" &&
    (pgError?.constraint ?? "").includes(PLOT_UNIQUE_INDEX)
  );
}

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

  if (typeof filters.neighborhood_id === "number") {
    where.push(eq(properties.neighborhoodId, filters.neighborhood_id));
  }

  if (filters.district) {
    where.push(ilike(properties.district, `%${filters.district}%`));
  }

  // رقم القطعة: يعمل سواء وُجد حرف القطعة أو لا (عمودان منفصلان).
  if (filters.plot_number) {
    where.push(ilike(properties.plotNumber, `%${filters.plot_number}%`));
  }

  if (filters.plot_letter) {
    where.push(ilike(properties.plotLetter, `%${filters.plot_letter}%`));
  }

  if (typeof filters.area_min === "number") {
    where.push(gte(properties.areaValue, String(filters.area_min)));
  }

  if (typeof filters.area_max === "number") {
    where.push(lte(properties.areaValue, String(filters.area_max)));
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
        ilike(properties.neighborhood, q),
        ilike(properties.governorateText, q),
        ilike(properties.districtText, q),
        ilike(properties.neighborhoodText, q),
        ilike(properties.addressDetails, q),
        ilike(properties.ownerName, q),
        ilike(properties.ownerPhone, q),
        ilike(properties.notes, q),
        ilike(properties.nazal, q),
        ilike(properties.plotNumber, q),
        ilike(properties.plotLetter, q),
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

  const duplicateOwner = await findDuplicatePlotOwner(values);
  if (duplicateOwner !== null) {
    throw new DuplicatePlotError(duplicateOwner);
  }

  const property = await (async () => {
    try {
      return await db.transaction(async (tx) => {
        const code = await generatePropertyCode(payload.property_type);
        const [created] = await tx
          .insert(properties)
          .values({ ...values, code })
          .returning();
        return created;
      });
    } catch (error) {
      // طبقة أمان: لو فات الفحص بسبب تسابق، حوّل انتهاك الفهرس إلى 409.
      if (isUniquePlotViolation(error)) {
        throw new DuplicatePlotError(await findDuplicatePlotOwner(values));
      }
      throw error;
    }
  })();

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

  // فحص التكرار مع استثناء السجل الحالي نفسه.
  const duplicateOwner = await findDuplicatePlotOwner(values, id);
  if (duplicateOwner !== null) {
    throw new DuplicatePlotError(duplicateOwner);
  }

  const property = await (async () => {
    try {
      const [updated] = await db
        .update(properties)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(properties.id, id))
        .returning();
      return updated;
    } catch (error) {
      if (isUniquePlotViolation(error)) {
        throw new DuplicatePlotError(await findDuplicatePlotOwner(values, id));
      }
      throw error;
    }
  })();

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

  // حلّ اسم المحافظة/المنطقة/الحي: من القائمة (id) أو نص يدوي.
  const governorateName = payload.governorate_id
    ? await getGovernorateName(payload.governorate_id)
    : payload.governorate_text ?? payload.governorate ?? null;
  const districtName = payload.district_id
    ? await getDistrictName(payload.district_id)
    : payload.district_text ?? payload.district ?? null;
  const neighborhoodName = payload.neighborhood_id
    ? await getNeighborhoodName(payload.neighborhood_id)
    : payload.neighborhood_text ?? null;

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
    district: districtName,
    neighborhood: neighborhoodName,
    // ملاحظة: عمود city القديم لا يُكتب هنا إطلاقاً للحفاظ على بياناته السابقة.
    governorateId: payload.governorate_id ?? null,
    districtId: payload.district_id ?? null,
    neighborhoodId: payload.neighborhood_id ?? null,
    governorateText: payload.governorate_id
      ? null
      : payload.governorate_text ?? payload.governorate ?? null,
    districtText: payload.district_id
      ? null
      : payload.district_text ?? payload.district ?? null,
    neighborhoodText: payload.neighborhood_id
      ? null
      : payload.neighborhood_text ?? null,
    addressDetails: payload.address_details,
    ownerName: payload.owner_name,
    ownerPhone: payload.owner_phone,
    ownerNotes: payload.owner_notes,
    status: payload.status,
    notes: payload.notes,
    nazal: payload.nazal,
    plotNumber: payload.plot_number,
    plotLetter: payload.plot_letter,
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
