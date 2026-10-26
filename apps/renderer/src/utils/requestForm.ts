import { PROPERTY_TYPES, RENTAL_PROPERTY_TYPES } from "../constants/domain";
import { splitAmenityKeys } from "./amenities";
import type { PurchaseRequestRecord, RentalRequestRecord } from "../types";

/** طلب شراء أو إيجار: نوع الطلب يحدّد الخدمة والحقول (نوع الإيجار). */
export type RequestMode = "rental" | "purchase";
export type RequestRecord = RentalRequestRecord | PurchaseRequestRecord;

export type RequestForm = {
  person_id: number | null;
  property_type: string;
  rent_period: string;
  budget_min: string | number | null;
  budget_max: string | number | null;
  area_unit: string | null;
  area_min: string | number | null;
  area_max: string | number | null;
  floors_count: number | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  governorate_id: number | null;
  district_id: number | null;
  neighborhood_id: number | null;
  governorate: string;
  district: string;
  neighborhood: string;
  /** مفاتيح AMENITY_OPTIONS، وهي ما تقارنه المطابقة بالعروض. */
  amenity_keys: string[];
  /** مميزات قديمة كُتبت نصاً حراً؛ تُحفظ كما هي حتى يزيلها المستخدم. */
  other_amenities: string[];
  other_requirements: string;
  status: string;
  notes: string;
};

export const requestLabel = (mode: RequestMode) =>
  mode === "rental" ? "طلب إيجار" : "طلب شراء";
export const requestListPath = (mode: RequestMode) =>
  mode === "rental" ? "/rental-requests" : "/purchase-requests";
export const requestPath = (mode: RequestMode, id: number) =>
  `${requestListPath(mode)}/${id}`;

/** أنواع العقار المسموحة لكل نوع طلب (الإيجار بمفاتيح، الشراء بأسماء). */
export function requestPropertyTypes(mode: RequestMode) {
  return mode === "rental"
    ? RENTAL_PROPERTY_TYPES
    : PROPERTY_TYPES.map((value) => ({ title: value, value }));
}
export function requestPropertyTypeLabel(mode: RequestMode, value: string) {
  if (mode !== "rental") return value;
  return (
    RENTAL_PROPERTY_TYPES.find((item) => item.value === value)?.title ?? value
  );
}

export function emptyRequestForm(
  mode: RequestMode,
  personId: number | null = null,
): RequestForm {
  return {
    person_id: personId,
    property_type: mode === "rental" ? "apartment" : PROPERTY_TYPES[0]!,
    rent_period: "monthly",
    budget_min: null,
    budget_max: null,
    area_unit: "متر",
    area_min: null,
    area_max: null,
    floors_count: null,
    rooms_count: null,
    bathrooms_count: null,
    governorate_id: null,
    district_id: null,
    neighborhood_id: null,
    governorate: "",
    district: "",
    neighborhood: "",
    amenity_keys: [],
    other_amenities: [],
    other_requirements: "",
    status: "open",
    notes: "",
  };
}

// numeric يصل بخانتين عشريتين («600000.00»)، والأصفار ضجيج في الحقل.
const numberText = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ""
    ? null
    : String(Number(value));

export function requestToForm(item: RequestRecord): RequestForm {
  const { known, other } = splitAmenityKeys(item.amenities);
  return {
    person_id: item.person_id,
    property_type: item.property_type,
    rent_period:
      "rent_period" in item ? (item.rent_period ?? "monthly") : "monthly",
    budget_min: numberText(item.budget_min),
    budget_max: numberText(item.budget_max),
    area_unit: item.area_unit ?? "متر",
    area_min: numberText(item.area_min),
    area_max: numberText(item.area_max),
    floors_count: item.floors_count,
    rooms_count: item.rooms_count,
    bathrooms_count: item.bathrooms_count,
    governorate_id: item.governorate_id,
    district_id: item.district_id,
    neighborhood_id: item.neighborhood_id,
    governorate: item.governorate ?? "",
    district: item.district ?? "",
    neighborhood: item.neighborhood ?? "",
    amenity_keys: known,
    other_amenities: other,
    other_requirements: item.other_requirements ?? "",
    status: item.status,
    notes: item.notes ?? "",
  };
}

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** جسم الطلب كما يقبله الخادم؛ طلب الشراء بلا نوع الإيجار. */
export function requestPayload(form: RequestForm, mode: RequestMode) {
  const { amenity_keys, other_amenities, ...fields } = form;
  const base = {
    ...fields,
    budget_min: numberOrNull(form.budget_min),
    budget_max: numberOrNull(form.budget_max),
    area_min: numberOrNull(form.area_min),
    area_max: numberOrNull(form.area_max),
    amenities: Object.fromEntries(
      [...other_amenities, ...amenity_keys].map((key) => [key, true]),
    ),
  };
  if (mode === "rental") return base;
  const { rent_period: _rentPeriod, ...purchase } = base;
  return purchase;
}
