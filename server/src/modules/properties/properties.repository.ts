import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  favoriteProperties,
  properties,
  propertyImages,
  type NewProperty,
  type Property,
} from "../../infrastructure/database/schema.js";
import {
  PROPERTY_TYPE_PREFIX,
  STATUS_LABELS,
  STATUSES,
  type PropertyType,
} from "../../shared/constants/domain.js";
import { calculateTotalPrice } from "../../shared/utils/pricing.js";
import { toApiObject, toApiObjects } from "../../shared/utils/case.js";
import { DuplicatePlotError } from "../../shared/errors.js";
import { getLocationNames } from "../locations/locations.repository.js";
import { deleteOwnerImageFiles } from "../images/images.service.js";
import {
  listEntityAudit,
  recordAudit,
  recordAudits,
} from "../audit/audit.service.js";
import {
  type PropertyFilters,
  type PropertyPageQuery,
  type PropertyPayload,
  type PropertySortKey,
} from "./properties.schema.js";
import {
  areaInSquareMeters,
  pageOffset,
  sortNullsLast,
  totalRowsColumn,
  type SortOrder,
} from "../../shared/utils/paging.js";
import { postgresError } from "../../shared/utils/postgres-errors.js";
import {
  containsPattern,
  searchTextContains,
  searchTokens,
} from "../../shared/utils/search.js";
import {
  withRecordCodeLock,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";

const ENTITY = "property";
const PLOT_UNIQUE_INDEX = "uq_properties_plot_identity";

/** تطبيع جزء من هوية القطعة: trim + توحيد المسافات الداخلية + توحيد null/'' . */
function normalizeKeyPart(value?: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

type PlotValues = Pick<
  NewProperty,
  "governorate" | "district" | "neighborhood" | "plotNumber" | "plotLetter"
>;

// Same expression as uq_properties_plot_identity. The sql tag reads the
// cooked template, where '\s' would reach PostgreSQL as a plain 's'.
const norm = (column: AnyPgColumn) =>
  sql`regexp_replace(btrim(coalesce(${column}, '')), '\\s+', ' ', 'g')`;

// The index covers only listings with a plot number; stating its predicate
// lets the planner use it instead of scanning every listing.
const hasPlotNumber = sql`${properties.plotNumber} is not null and btrim(${properties.plotNumber}) <> ''`;

/** هوية القطعة المطبّعة كمفتاح نصي، أو null إن لم يوجد رقم قطعة. */
export function plotIdentityKey(values: PlotValues): string | null {
  const plotNumber = normalizeKeyPart(values.plotNumber);
  if (!plotNumber) return null;
  return JSON.stringify([
    normalizeKeyPart(values.governorate),
    normalizeKeyPart(values.district),
    normalizeKeyPart(values.neighborhood),
    plotNumber,
    normalizeKeyPart(values.plotLetter),
  ]);
}

/**
 * أسماء مالكي القطع المسجَّلة مسبقاً المطابقة لأي من هذه القطع، مفهرسة
 * بـ plotIdentityKey، باستعلام واحد مهما كان عددها (للاستيراد).
 */
export async function findPlotOwners(
  tx: Transaction,
  rows: PlotValues[],
): Promise<Map<string, string>> {
  const keys = [
    ...new Set(rows.map(plotIdentityKey).filter((key) => key !== null)),
  ];
  const owners = new Map<string, string>();
  if (keys.length === 0) return owners;

  const result = await tx.execute<{ key: string; owner_name: string }>(sql`
    select k.key, ${properties.ownerName} as owner_name
    from json_array_elements_text(${JSON.stringify(keys)}::json) as k(key)
    join ${properties}
      on ${norm(properties.governorate)} = k.key::json->>0
     and ${norm(properties.district)} = k.key::json->>1
     and ${norm(properties.neighborhood)} = k.key::json->>2
     and ${norm(properties.plotNumber)} = k.key::json->>3
     and ${norm(properties.plotLetter)} = k.key::json->>4
     and ${hasPlotNumber}`);
  for (const row of result.rows)
    if (!owners.has(row.key)) owners.set(row.key, row.owner_name);
  return owners;
}

/**
 * يرجع اسم مالك العرض المسجَّل مسبقاً إن وُجدت قطعة مطابقة، وإلا null.
 * المطابقة على القيم المطبّعة لـ (المحافظة، المنطقة، الحي، رقم القطعة، حرف القطعة).
 * يتم تخطّي الفحص إذا لم يوجد رقم قطعة. excludeId يستثني السجل الحالي عند التعديل.
 */
async function findDuplicatePlotOwner(
  values: PlotValues,
  excludeId?: number,
): Promise<string | null> {
  const plotNumber = normalizeKeyPart(values.plotNumber);
  if (!plotNumber) return null;

  const conditions = [
    sql`${norm(properties.governorate)} = ${normalizeKeyPart(values.governorate)}`,
    sql`${norm(properties.district)} = ${normalizeKeyPart(values.district)}`,
    sql`${norm(properties.neighborhood)} = ${normalizeKeyPart(values.neighborhood)}`,
    sql`${norm(properties.plotNumber)} = ${plotNumber}`,
    sql`${norm(properties.plotLetter)} = ${normalizeKeyPart(values.plotLetter)}`,
    hasPlotNumber,
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
  const pgError = postgresError(error);
  return (
    pgError?.code === "23505" &&
    (pgError.constraint ?? "").includes(PLOT_UNIQUE_INDEX)
  );
}

// عمود البحث (هجرة 0003، غير معرّف في schema.ts): أرقام هاتف المالك، ثم كل
// الحقول النصية والأرقام (المساحة/الأسعار) بأحرف صغيرة، تفصلها مسافات.
const SEARCH_TEXT = sql`${properties}."search_text"`;

/**
 * يبني شرط البحث لكلمة واحدة: يطابق أي حقل نصي، أو الأرقام (المساحة/الأسعار)،
 * أو الهاتف بعد إزالة الفواصل، أو حالة العقار بالعربية. كله على search_text
 * وفهرسه الثلاثي ما عدا الحالة.
 */
function buildSearchClause(term: string): SQL {
  const parts: SQL[] = [searchTextContains(SEARCH_TEXT, term)];

  // الهاتف: أرقام الكلمة وحدها ضمن أرقام الهاتف (يعمل مع المسافات/الفواصل).
  // تلك الأرقام أول ما في search_text حتى أول مسافة؛ وكلمة من أرقام فقط
  // تطابقها المقارنة السابقة أصلاً. التعبير المنتظم وحده لا يعطي الفهرس
  // ثلاثيات مفيدة (يبدأ بـ [0-9]*)، فيُقرن بـ LIKE على الأرقام نفسها، وهو
  // لازم منه فلا يغيّر النتيجة.
  const digits = term.replace(/\D/g, "");
  if (digits && digits !== term) {
    parts.push(
      and(
        searchTextContains(SEARCH_TEXT, digits),
        sql`${SEARCH_TEXT} ~ ${`^[0-9]*${digits}`}`,
      )!,
    );
  }

  // حالة العقار بالعربية (متاح/محجوز/...).
  const matchedStatuses = STATUSES.filter((status) => {
    const label = STATUS_LABELS[status] ?? "";
    return label.includes(term) || term.includes(label);
  });
  if (matchedStatuses.length) {
    parts.push(inArray(properties.status, [...matchedStatuses]));
  }

  return parts.length === 1 ? parts[0] : or(...parts)!;
}

/** شروط الفلاتر والبحث المشتركة بين القائمة الكاملة والقائمة المقسّمة. */
function propertyConditions(
  filters: Omit<PropertyFilters, "limit" | "offset">,
): SQL[] {
  const where: SQL[] = [];

  if (!filters.status && filters.include_archived !== "true") {
    where.push(ne(properties.status, "archived"));
  }

  if (typeof filters.owner_person_id === "number") {
    where.push(eq(properties.ownerPersonId, filters.owner_person_id));
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
    where.push(ilike(properties.district, containsPattern(filters.district)));
  }

  // رقم القطعة: يعمل سواء وُجد حرف القطعة أو لا (عمودان منفصلان).
  if (filters.plot_number) {
    where.push(
      ilike(properties.plotNumber, containsPattern(filters.plot_number)),
    );
  }

  if (filters.plot_letter) {
    where.push(
      ilike(properties.plotLetter, containsPattern(filters.plot_letter)),
    );
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

  // بحث شامل: كل كلمة يجب أن تطابق حقلاً ما (AND بين الكلمات، OR عبر الحقول).
  // يقبل q أو search، عربي/إنجليزي، جزء من كلمة/رقم، غير حسّاس لحالة الأحرف.
  for (const token of searchTokens(filters.q ?? filters.search)) {
    where.push(buildSearchClause(token));
  }

  return where;
}

export async function listProperties(filters: PropertyFilters) {
  const where = propertyConditions(filters);
  let query = db
    .select()
    .from(properties)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(properties.createdAt), desc(properties.id))
    .$dynamic();

  // pagination اختياري من قاعدة البيانات (يعمل مع البحث والفلاتر).
  if (typeof filters.limit === "number") {
    query = query.limit(filters.limit).offset(filters.offset ?? 0);
  }

  const result = await query;
  return toApiObjects(result, "properties");
}

const PROPERTY_SORT_COLUMNS: Record<
  Exclude<PropertySortKey, "area">,
  AnyPgColumn
> = {
  created_at: properties.createdAt,
  updated_at: properties.updatedAt,
  name: properties.name,
  code: properties.code,
  property_type: properties.propertyType,
  district: properties.district,
  owner_name: properties.ownerName,
  total_price: properties.totalPrice,
  status: properties.status,
};

/**
 * ترتيب الصفحة مع فرز ثانوي ثابت كي لا يتكرر صف أو يختفي بين الصفحات. يطابق
 * الفرز السابق في الواجهة: المساحة بالـ م² ثم id تصاعدياً (compareByAreaM2)،
 * وبقية المفاتيح بالترتيب الافتراضي (الأحدث أولاً) عند التساوي.
 */
function propertyOrder(sortKey: PropertySortKey, order: SortOrder): SQL[] {
  if (sortKey === "area") {
    return [
      sortNullsLast(
        areaInSquareMeters(properties.areaValue, properties.areaUnit),
        order,
      ),
      asc(properties.id),
    ];
  }
  if (sortKey === "created_at") {
    return [
      sortNullsLast(properties.createdAt, order),
      order === "asc" ? asc(properties.id) : desc(properties.id),
    ];
  }
  return [
    sortNullsLast(PROPERTY_SORT_COLUMNS[sortKey], order),
    desc(properties.createdAt),
    desc(properties.id),
  ];
}

export async function listPropertiesPage(
  query: PropertyPageQuery,
  userId?: number,
) {
  const where = propertyConditions(query);
  if (query.favorites_only === "true") {
    where.push(
      userId === undefined
        ? sql`false`
        : exists(
            db
              .select({ id: favoriteProperties.propertyId })
              .from(favoriteProperties)
              .where(
                and(
                  eq(favoriteProperties.userId, userId),
                  eq(favoriteProperties.propertyId, properties.id),
                ),
              ),
          ),
    );
  }
  const condition = where.length ? and(...where) : undefined;

  const rows = await db
    .select({ property: properties, total: totalRowsColumn() })
    .from(properties)
    .where(condition)
    .orderBy(...propertyOrder(query.sort_by, query.sort_order))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));

  // صفحة بعد النهاية لا صفوف فيها تحمل العدد، فيُعدّ منفصلاً.
  const total =
    rows[0]?.total ??
    (query.page > 1 ? await db.$count(properties, condition) : 0);

  return {
    items: toApiObjects(
      rows.map((row) => row.property),
      "properties",
    ),
    total,
    page: query.page,
    page_size: query.page_size,
  };
}

export async function getProperty(id: number) {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  return property ? toApiObject(property, "properties") : null;
}

export async function createProperty(
  payload: PropertyPayload,
  userId?: number,
) {
  const values = await normalizePayload(payload);

  const duplicateOwner = await findDuplicatePlotOwner(values);
  if (duplicateOwner !== null) {
    throw new DuplicatePlotError(duplicateOwner);
  }

  const property = await (async () => {
    try {
      return await withRecordCodeLock("properties", async (tx) => {
        const code = await generatePropertyCode(tx, payload.property_type);
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

  const result = toApiObject(property, "properties");
  await recordAudit({
    entityType: ENTITY,
    entityId: property.id,
    action: "created",
    newValue: result,
    userId,
  });
  return result;
}

/**
 * يُدرج عروضاً جديدة بالترتيب المعطى، بدفعات من 100 صف، داخل معاملة تحمل
 * قفل رموز العروض (withRecordCodeLock("properties")). لا يفحص التكرار ولا
 * يكتب سجل التغييرات (recordPropertiesCreated بعد انتهاء المعاملة).
 */
export async function insertProperties(
  tx: Transaction,
  rows: Array<Omit<NewProperty, "code">>,
) {
  const typeOf = (row: Omit<NewProperty, "code">) =>
    row.propertyType as PropertyType;
  const nextCode = await propertyCodeAllocator(tx, rows.map(typeOf));
  const coded = rows.map((row) => ({ ...row, code: nextCode(typeOf(row)) }));
  const created: Property[] = [];
  // Drizzle builds a statement synchronously, about 0.1 ms per row here (55
  // ms for 500 rows), so a smaller batch keeps other requests moving.
  for (let start = 0; start < coded.length; start += 100) {
    created.push(
      ...(await tx
        .insert(properties)
        .values(coded.slice(start, start + 100))
        .returning()),
    );
  }
  return created;
}

/** حدث "أُنشئ" لكل عرض أدرجه insertProperties، كما يكتبه createProperty. */
export async function recordPropertiesCreated(
  created: Property[],
  userId?: number,
) {
  // 500 at a time, so building thousands of entries does not hold up
  // other requests.
  for (let start = 0; start < created.length; start += 500) {
    await recordAudits(
      created.slice(start, start + 500).map((property) => ({
        entityType: ENTITY,
        entityId: property.id,
        action: "created" as const,
        newValue: toApiObject(property, "properties"),
        userId,
      })),
    );
  }
}

export async function updateProperty(
  id: number,
  payload: PropertyPayload,
  userId?: number,
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
  const after = toApiObject(property, "properties");

  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: "updated",
    oldValue: before,
    newValue: after,
    userId,
  });

  if (String(before.total_price) !== String(after.total_price)) {
    await recordAudit({
      entityType: ENTITY,
      entityId: id,
      action: "price_changed",
      oldValue: { total_price: before.total_price },
      newValue: { total_price: after.total_price },
      userId,
    });
  }

  if (before.status !== after.status) {
    await recordAudit({
      entityType: ENTITY,
      entityId: id,
      action: "status_changed",
      oldValue: { status: before.status },
      newValue: { status: after.status },
      userId,
    });
  }

  return after;
}

/**
 * يحذف العقار (تحذف القاعدة صفوف صوره ومتابعاته معه) ثم ملفات صوره
 * ومصغّراتها بعد نجاح الحذف، فلا تبقى على القرص بلا صف.
 */
export async function deleteProperty(id: number, userId?: number) {
  const deleted = await db.transaction(async (tx) => {
    // يقفل الصف أولاً فينتظر أي رفع صور جارٍ، ولا تفوت القائمة صورة أُضيفت.
    const [locked] = await tx
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, id))
      .for("update");
    if (!locked) return null;
    const images = await tx
      .select({ filePath: propertyImages.filePath })
      .from(propertyImages)
      .where(eq(propertyImages.propertyId, id));
    const [row] = await tx
      .delete(properties)
      .where(eq(properties.id, id))
      .returning();
    return row ? { row, images } : null;
  });
  if (!deleted) return null;
  const property = deleted.row;
  deleteOwnerImageFiles(
    "",
    id,
    deleted.images.map((image) => image.filePath),
  );

  const result = toApiObject(property, "properties");
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: "deleted",
    oldValue: result,
    userId,
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

  const result = toApiObject(property, "properties");
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: "archived",
    userId,
  });
  return result;
}

export async function restoreProperty(id: number, userId?: number) {
  const [property] = await db
    .update(properties)
    .set({ status: "available", archivedAt: null, updatedAt: new Date() })
    .where(eq(properties.id, id))
    .returning();
  if (!property) return null;

  const result = toApiObject(property, "properties");
  await recordAudit({
    entityType: ENTITY,
    entityId: id,
    action: "restored",
    userId,
  });
  return result;
}

export function getPropertyAudit(id: number) {
  return listEntityAudit(ENTITY, id);
}

async function generatePropertyCode(
  tx: Transaction,
  propertyType: PropertyType,
) {
  const nextCode = await propertyCodeAllocator(tx, [propertyType]);
  return nextCode(propertyType);
}

/**
 * يوزّع رموز عروض جديدة بالتتابع، ويقرأ آخر رمز لكل بادئة مرة واحدة. يُستدعى
 * داخل withRecordCodeLock("properties")، وتُدرج العروض بترتيب توزيع رموزها.
 */
export async function propertyCodeAllocator(
  tx: Transaction,
  propertyTypes: PropertyType[],
) {
  const prefixOf = (type: PropertyType) => PROPERTY_TYPE_PREFIX[type] ?? "P";
  const lastNumbers = new Map<string, number>();
  for (const prefix of new Set(propertyTypes.map(prefixOf))) {
    const [lastProperty] = await tx
      .select({ code: properties.code })
      .from(properties)
      .where(ilike(properties.code, `${prefix}-%`))
      .orderBy(desc(properties.id))
      .limit(1);
    const lastCode = lastProperty?.code;
    lastNumbers.set(prefix, lastCode ? Number(lastCode.split("-")[1] ?? 0) : 0);
  }

  return (propertyType: PropertyType) => {
    const prefix = prefixOf(propertyType);
    const nextNumber = (lastNumbers.get(prefix) ?? 0) + 1;
    lastNumbers.set(prefix, nextNumber);
    return `${prefix}-${String(nextNumber).padStart(4, "0")}`;
  };
}

async function normalizePayload(
  payload: PropertyPayload,
): Promise<Omit<NewProperty, "code">> {
  return propertyValues(payload, await getLocationNames(payload));
}

/**
 * قيم أعمدة العرض من الطلب، بعد جلب أسماء المواقع المختارة من القوائم
 * (getLocationNames لعرض واحد، getLocationNamesByIds للاستيراد).
 */
export function propertyValues(
  payload: PropertyPayload,
  names: Awaited<ReturnType<typeof getLocationNames>>,
): Omit<NewProperty, "code"> {
  const total_price = calculateTotalPrice(payload);

  // حلّ اسم المحافظة/المنطقة/الحي: من القائمة (id) أو نص يدوي.
  const governorateName = payload.governorate_id
    ? names.governorate
    : (payload.governorate_text ?? payload.governorate ?? null);
  const districtName = payload.district_id
    ? names.district
    : (payload.district_text ?? payload.district ?? null);
  const neighborhoodName = payload.neighborhood_id
    ? names.neighborhood
    : (payload.neighborhood_text ?? null);

  return {
    name: payload.name ?? null,
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
      : (payload.governorate_text ?? payload.governorate ?? null),
    districtText: payload.district_id
      ? null
      : (payload.district_text ?? payload.district ?? null),
    neighborhoodText: payload.neighborhood_id
      ? null
      : (payload.neighborhood_text ?? null),
    addressDetails: payload.address_details,
    latitude: payload.latitude,
    longitude: payload.longitude,
    locationLink: payload.location_link,
    ownerPersonId: payload.owner_person_id ?? null,
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
    isNegotiable: payload.is_negotiable ?? false,
    amenities: payload.amenities,
  };
}

function addEqualFilter(
  where: ReturnType<typeof eq>[],
  column: Parameters<typeof eq>[0],
  value?: string,
) {
  if (!value) {
    return;
  }

  where.push(eq(column, value));
}
