import { and, eq, ne } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { customers, properties, purchaseRequests, rentalRequests, rentals } from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";

export type MatchReason = { field: string; label: string; matched: boolean; detail: string };
export type MatchResult = { score: number; reasons: MatchReason[]; record: Record<string, unknown> };

function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function text(value: unknown) { return String(value ?? "").trim().toLocaleLowerCase(); }
function hasValue(value: unknown) { return value !== null && value !== undefined && value !== ""; }
function inRange(value: number | null, min: unknown, max: unknown) { if (value === null) return false; const low = number(min); const high = number(max); return (low === null || value >= low) && (high === null || value <= high); }
function rangesOverlap(aMin: unknown, aMax: unknown, bMin: unknown, bMax: unknown) {
  const left = number(aMin) ?? Number.NEGATIVE_INFINITY;
  const right = number(aMax) ?? Number.POSITIVE_INFINITY;
  const otherLeft = number(bMin) ?? Number.NEGATIVE_INFINITY;
  const otherRight = number(bMax) ?? Number.POSITIVE_INFINITY;
  return left <= otherRight && otherLeft <= right;
}
function locationReason(request: Record<string, unknown>, offer: Record<string, unknown>): MatchReason | null {
  const fields = ["governorate", "district", "neighborhood"] as const;
  const idFields = ["governorate_id", "district_id", "neighborhood_id"] as const;
  for (let index = idFields.length - 1; index >= 0; index -= 1) {
    if (!hasValue(request[idFields[index]])) continue;
    const matched = hasValue(offer[idFields[index]]) && String(request[idFields[index]]) === String(offer[idFields[index]]);
    return { field: idFields[index], label: fields[index], matched, detail: matched ? `${fields[index]} متطابقة` : `${fields[index]} مختلفة` };
  }
  for (const field of fields) {
    if (!hasValue(request[field])) continue;
    const matched = text(request[field]) === text(offer[field]);
    return { field, label: field, matched, detail: matched ? `${field} متطابقة` : `${field} مختلفة` };
  }
  return null;
}
function amenityReason(request: Record<string, unknown>, offer: Record<string, unknown>): MatchReason | null {
  const required = Object.entries((request.amenities as Record<string, unknown> | null) ?? {}).filter(([, value]) => value === true || hasValue(value));
  if (!required.length) return null;
  const available = (offer.amenities as Record<string, unknown> | null) ?? {};
  const matched = required.filter(([key, value]) => available[key] === value || (value === true && Boolean(available[key]))).length;
  return { field: "amenities", label: "المميزات", matched: matched === required.length, detail: `${matched} من ${required.length} مميزات متطابقة` };
}
function addReason(reasons: MatchReason[], field: string, label: string, matched: boolean, detail: string) { reasons.push({ field, label, matched, detail }); }

function rentalScore(request: Record<string, unknown>, offer: Record<string, unknown>) {
  let score = 0; const reasons: MatchReason[] = [];
  const propertyType = text(request.property_type) === text(offer.property_type); addReason(reasons, "property_type", "نوع العقار", propertyType, propertyType ? "نوع العقار متطابق" : "نوع العقار مختلف"); if (propertyType) score += 25;
  if (hasValue(request.rent_period)) { const matched = text(request.rent_period) === text(offer.rent_period); addReason(reasons, "rent_period", "نوع الإيجار", matched, matched ? "نوع الإيجار متطابق" : "نوع الإيجار مختلف"); if (matched) score += 10; }
  if (hasValue(request.budget_min) || hasValue(request.budget_max)) { const matched = inRange(number(offer.rent_price), request.budget_min, request.budget_max); addReason(reasons, "budget", "الميزانية", matched, matched ? "السعر ضمن الميزانية" : "السعر خارج الميزانية"); if (matched) score += 20; }
  const location = locationReason(request, offer); if (location) { reasons.push(location); if (location.matched) score += 15; }
  if (hasValue(request.area_min) || hasValue(request.area_max)) { const matched = inRange(number(offer.area_value), request.area_min, request.area_max) && (!hasValue(request.area_unit) || text(request.area_unit) === text(offer.area_unit)); addReason(reasons, "area", "المساحة", matched, matched ? "المساحة متوافقة" : "المساحة غير متوافقة"); if (matched) score += 10; }
  if (hasValue(request.rooms_count)) { const matched = number(offer.rooms_count) !== null && number(offer.rooms_count)! >= number(request.rooms_count)!; addReason(reasons, "rooms_count", "الغرف", matched, matched ? "عدد الغرف متوافق" : "عدد الغرف غير متوافق"); if (matched) score += 5; }
  if (hasValue(request.bathrooms_count)) { const matched = number(offer.bathrooms_count) !== null && number(offer.bathrooms_count)! >= number(request.bathrooms_count)!; addReason(reasons, "bathrooms_count", "الحمامات", matched, matched ? "عدد الحمامات متوافق" : "عدد الحمامات غير متوافق"); if (matched) score += 5; }
  if (hasValue(request.floors_count)) { const matched = number(offer.floors_count) !== null && number(offer.floors_count)! >= number(request.floors_count)!; addReason(reasons, "floors_count", "الطوابق", matched, matched ? "عدد الطوابق متوافق" : "عدد الطوابق غير متوافق"); if (matched) score += 3; }
  const amenities = amenityReason(request, offer); if (amenities) { reasons.push(amenities); if (amenities.matched) score += 7; }
  return { score, reasons };
}

function purchaseScore(request: Record<string, unknown>, offer: Record<string, unknown>) {
  let score = 0; const reasons: MatchReason[] = [];
  const propertyType = text(request.property_type) === text(offer.property_type); addReason(reasons, "property_type", "نوع العقار", propertyType, propertyType ? "نوع العقار متطابق" : "نوع العقار مختلف"); if (propertyType) score += 25;
  if (hasValue(request.budget_min) || hasValue(request.budget_max)) { const matched = inRange(number(offer.total_price), request.budget_min, request.budget_max); addReason(reasons, "budget", "الميزانية", matched, matched ? "السعر ضمن الميزانية" : "السعر خارج الميزانية"); if (matched) score += 25; }
  const location = locationReason(request, offer); if (location) { reasons.push(location); if (location.matched) score += 15; }
  if (hasValue(request.area_min) || hasValue(request.area_max)) { const matched = inRange(number(offer.area_value), request.area_min, request.area_max) && (!hasValue(request.area_unit) || text(request.area_unit) === text(offer.area_unit)); addReason(reasons, "area", "المساحة", matched, matched ? "المساحة متوافقة" : "المساحة غير متوافقة"); if (matched) score += 10; }
  if (hasValue(request.rooms_count)) { const matched = number(offer.rooms_count) !== null && number(offer.rooms_count)! >= number(request.rooms_count)!; addReason(reasons, "rooms_count", "الغرف", matched, matched ? "عدد الغرف متوافق" : "عدد الغرف غير متوافق"); if (matched) score += 8; }
  if (hasValue(request.bathrooms_count)) { const matched = number(offer.bathrooms_count) !== null && number(offer.bathrooms_count)! >= number(request.bathrooms_count)!; addReason(reasons, "bathrooms_count", "الحمامات", matched, matched ? "عدد الحمامات متوافق" : "عدد الحمامات غير متوافق"); if (matched) score += 5; }
  if (hasValue(request.floors_count)) { const matched = number(offer.floors_count) !== null && number(offer.floors_count)! >= number(request.floors_count)!; addReason(reasons, "floors_count", "الطوابق", matched, matched ? "عدد الطوابق متوافق" : "عدد الطوابق غير متوافق"); if (matched) score += 5; }
  const amenities = amenityReason(request, offer); if (amenities) { reasons.push(amenities); if (amenities.matched) score += 7; }
  return { score, reasons };
}

export async function findRentalOfferMatches(requestId: number): Promise<MatchResult[]> {
  const [request] = await db.select().from(rentalRequests).where(eq(rentalRequests.id, requestId)).limit(1); if (!request) return [];
  const offers = await db.select().from(rentals).where(eq(rentals.status, "available"));
  return offers.map((offer) => ({ ...rentalScore(toApiObject(request), toApiObject(offer)), record: toApiObject(offer, "rentals") })).filter((match) => match.score >= 40).sort((a, b) => b.score - a.score);
}

export async function findRentalRequestMatches(rentalId: number): Promise<MatchResult[]> {
  const [offer] = await db.select().from(rentals).where(eq(rentals.id, rentalId)).limit(1); if (!offer) return [];
  const requests = await db.select({ request: rentalRequests, customerName: customers.fullName, customerCode: customers.code }).from(rentalRequests).innerJoin(customers, eq(rentalRequests.customerId, customers.id)).where(eq(rentalRequests.status, "open"));
  return requests.map(({ request, customerName, customerCode }) => ({ ...rentalScore(toApiObject(request), toApiObject(offer)), record: { ...toApiObject(request), customer_name: customerName, customer_code: customerCode } })).filter((match) => match.score >= 40).sort((a, b) => b.score - a.score);
}

export async function findPurchaseOfferMatches(requestId: number): Promise<MatchResult[]> {
  const [request] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, requestId)).limit(1); if (!request) return [];
  const offers = await db.select().from(properties).where(ne(properties.status, "archived"));
  return offers.map((offer) => ({ ...purchaseScore(toApiObject(request), toApiObject(offer)), record: toApiObject(offer, "properties") })).filter((match) => match.score >= 40).sort((a, b) => b.score - a.score);
}

export async function findPurchaseRequestMatches(propertyId: number): Promise<MatchResult[]> {
  const [offer] = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1); if (!offer) return [];
  const requests = await db.select({ request: purchaseRequests, customerName: customers.fullName, customerCode: customers.code }).from(purchaseRequests).innerJoin(customers, eq(purchaseRequests.customerId, customers.id)).where(eq(purchaseRequests.status, "open"));
  return requests.map(({ request, customerName, customerCode }) => ({ ...purchaseScore(toApiObject(request), toApiObject(offer)), record: { ...toApiObject(request), customer_name: customerName, customer_code: customerCode } })).filter((match) => match.score >= 40).sort((a, b) => b.score - a.score);
}
