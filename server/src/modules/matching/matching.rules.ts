import { sql, type SQL } from "drizzle-orm";

/**
 * When a listing matches a customer's request, in two forms that must agree:
 * `evaluateMatch` explains one pair (the request and offer pages, the
 * dashboard's rows), and the SQL builders below select and rank every pair
 * at once (the dashboard). `test:dashboard:operations` checks them against
 * each other.
 *
 * Required criteria decide whether a listing is a match at all: the property
 * type, and when the request states them, its location, budget and (rentals)
 * rent period. Preferences only rank matches: area, rooms, bathrooms, floors
 * and amenities.
 */
export type MatchKind = "sale" | "rental";

export type MatchReason = {
  field: string;
  label: string;
  matched: boolean;
  detail: string;
  /** A required criterion; a listing that misses one is not a full match. */
  required: boolean;
};

export type MatchEvaluation = {
  /** Weighted sum of the criteria met (at most 100); kept for ordering. */
  score: number;
  reasons: MatchReason[];
  required_met: boolean;
  preferences_met: number;
  preferences_total: number;
};

type Row = Record<string, unknown>;

// The weights the score always used; a request that states every criterion
// can reach 100.
const WEIGHTS: Record<MatchKind, Record<string, number>> = {
  rental: {
    property_type: 25,
    rent_period: 10,
    budget: 20,
    location: 15,
    area: 10,
    rooms_count: 5,
    bathrooms_count: 5,
    floors_count: 3,
    amenities: 7,
  },
  sale: {
    property_type: 25,
    budget: 25,
    location: 15,
    area: 10,
    rooms_count: 8,
    bathrooms_count: 5,
    floors_count: 5,
    amenities: 7,
  },
};

const PRICE_COLUMN: Record<MatchKind, string> = {
  rental: "rent_price",
  sale: "total_price",
};

const LOCATION_LEVELS = [
  {
    id: "governorate_id",
    text: "governorate",
    label: "المحافظة",
    same: "المحافظة متطابقة",
    other: "المحافظة مختلفة",
  },
  {
    id: "district_id",
    text: "district",
    label: "المنطقة",
    same: "المنطقة متطابقة",
    other: "المنطقة مختلفة",
  },
  {
    id: "neighborhood_id",
    text: "neighborhood",
    label: "الحي",
    same: "الحي متطابق",
    other: "الحي مختلف",
  },
] as const;

const COUNTS = [
  { field: "rooms_count", label: "الغرف", noun: "عدد الغرف" },
  { field: "bathrooms_count", label: "الحمامات", noun: "عدد الحمامات" },
  { field: "floors_count", label: "الطوابق", noun: "عدد الطوابق" },
] as const;

function number(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function text(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}
function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}
function inRange(value: number | null, min: unknown, max: unknown) {
  if (value === null) return false;
  const low = number(min);
  const high = number(max);
  return (low === null || value >= low) && (high === null || value <= high);
}
function plainObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

/**
 * The most specific location level the request names by id decides; without
 * ids, the first named by text (governorate, then district, then
 * neighborhood).
 */
function locationReason(request: Row, offer: Row): MatchReason | null {
  for (const level of [...LOCATION_LEVELS].reverse()) {
    if (!hasValue(request[level.id])) continue;
    const matched =
      hasValue(offer[level.id]) &&
      String(request[level.id]) === String(offer[level.id]);
    return {
      field: level.id,
      label: level.label,
      matched,
      detail: matched ? level.same : level.other,
      required: true,
    };
  }
  for (const level of LOCATION_LEVELS) {
    if (!hasValue(request[level.text])) continue;
    const matched = text(request[level.text]) === text(offer[level.text]);
    return {
      field: level.text,
      label: level.label,
      matched,
      detail: matched ? level.same : level.other,
      required: true,
    };
  }
  return null;
}

/** Amenities the request asks for: every key with a value other than null or "". */
function requestedAmenities(request: Row) {
  return Object.entries(plainObject(request.amenities)).filter(([, value]) =>
    hasValue(value),
  );
}

function amenityReason(request: Row, offer: Row): MatchReason | null {
  const required = requestedAmenities(request);
  if (!required.length) return null;
  const available = plainObject(offer.amenities);
  const matched = required.filter(
    ([key, value]) =>
      (typeof value !== "object" && available[key] === value) ||
      (value === true && Boolean(available[key])),
  ).length;
  return {
    field: "amenities",
    label: "المميزات",
    matched: matched === required.length,
    detail: `${matched} من ${required.length} مميزات متطابقة`,
    required: false,
  };
}

export function evaluateMatch(
  kind: MatchKind,
  request: Row,
  offer: Row,
): MatchEvaluation {
  const weights = WEIGHTS[kind];
  const reasons: MatchReason[] = [];
  let score = 0;
  // `weight` names the criterion in WEIGHTS; location reasons are named
  // after the level that decided them.
  function add(reason: MatchReason, weight: string) {
    reasons.push(reason);
    if (reason.matched) score += weights[weight] ?? 0;
  }

  const type = text(request.property_type) === text(offer.property_type);
  add(
    {
      field: "property_type",
      label: "نوع العقار",
      matched: type,
      detail: type ? "نوع العقار متطابق" : "نوع العقار مختلف",
      required: true,
    },
    "property_type",
  );
  if (kind === "rental" && hasValue(request.rent_period)) {
    const matched = text(request.rent_period) === text(offer.rent_period);
    add(
      {
        field: "rent_period",
        label: "نوع الإيجار",
        matched,
        detail: matched ? "نوع الإيجار متطابق" : "نوع الإيجار مختلف",
        required: true,
      },
      "rent_period",
    );
  }
  if (hasValue(request.budget_min) || hasValue(request.budget_max)) {
    const matched = inRange(
      number(offer[PRICE_COLUMN[kind]]),
      request.budget_min,
      request.budget_max,
    );
    add(
      {
        field: "budget",
        label: "الميزانية",
        matched,
        detail: matched ? "السعر ضمن الميزانية" : "السعر خارج الميزانية",
        required: true,
      },
      "budget",
    );
  }
  const location = locationReason(request, offer);
  if (location) add(location, "location");

  if (hasValue(request.area_min) || hasValue(request.area_max)) {
    const matched =
      inRange(number(offer.area_value), request.area_min, request.area_max) &&
      (!hasValue(request.area_unit) ||
        text(request.area_unit) === text(offer.area_unit));
    add(
      {
        field: "area",
        label: "المساحة",
        matched,
        detail: matched ? "المساحة متوافقة" : "المساحة غير متوافقة",
        required: false,
      },
      "area",
    );
  }
  for (const count of COUNTS) {
    const wanted = number(request[count.field]);
    if (wanted === null) continue;
    const offered = number(offer[count.field]);
    const matched = offered !== null && offered >= wanted;
    add(
      {
        field: count.field,
        label: count.label,
        matched,
        detail:
          offered === null
            ? `${count.noun} غير مسجّل في العرض`
            : matched
              ? `${count.noun} متوافق`
              : `${count.noun} غير متوافق`,
        required: false,
      },
      count.field,
    );
  }
  const amenities = amenityReason(request, offer);
  if (amenities) add(amenities, "amenities");

  const preferences = reasons.filter((reason) => !reason.required);
  return {
    score,
    reasons,
    required_met: reasons.every((reason) => !reason.required || reason.matched),
    preferences_met: preferences.filter((reason) => reason.matched).length,
    preferences_total: preferences.length,
  };
}

/**
 * Whether a match is worth listing: every required criterion met, or (as
 * before the required criteria existed) a score of at least 40.
 */
export function isListedMatch(evaluation: MatchEvaluation) {
  return evaluation.required_met || evaluation.score >= 40;
}

/** Full matches first, then the higher score. */
export function compareMatches(a: MatchEvaluation, b: MatchEvaluation) {
  return Number(b.required_met) - Number(a.required_met) || b.score - a.score;
}

// ─── The same rules in SQL ───────────────────────────────────────────────
// `r` and `o` are the request and offer aliases of the caller's query; both
// are fixed names, never user input.

const r = (column: string) => sql.raw(`r.${column}`);
const o = (column: string) => sql.raw(`o.${column}`);
const filled = (column: SQL) =>
  sql`(${column} IS NOT NULL AND ${column}::text <> '')`;
// JavaScript's trim() also drops other whitespace; requests and listings are
// saved through forms that trim, so spaces, tabs and newlines are enough.
const norm = (column: SQL) =>
  sql`lower(btrim(coalesce(${column}::text, ''), E' \\t\\n\\r'))`;

function locationSql() {
  const byId = [...LOCATION_LEVELS]
    .reverse()
    .map(
      (level) =>
        sql`WHEN ${r(level.id)} IS NOT NULL THEN coalesce(${o(level.id)} = ${r(level.id)}, false)`,
    );
  const byText = LOCATION_LEVELS.map(
    (level) =>
      sql`WHEN ${filled(r(level.text))} THEN ${norm(r(level.text))} = ${norm(o(level.text))}`,
  );
  return sql`(CASE ${sql.join([...byId, ...byText], sql` `)} ELSE true END)`;
}

/** Every required criterion of the request met by the offer. */
export function requiredSql(kind: MatchKind) {
  const price = o(PRICE_COLUMN[kind]);
  const parts = [
    sql`${norm(r("property_type"))} = ${norm(o("property_type"))}`,
    sql`(${r("budget_min")} IS NULL OR ${price} >= ${r("budget_min")})`,
    sql`(${r("budget_max")} IS NULL OR ${price} <= ${r("budget_max")})`,
    locationSql(),
  ];
  if (kind === "rental")
    parts.push(
      sql`(NOT ${filled(r("rent_period"))} OR ${norm(r("rent_period"))} = ${norm(o("rent_period"))})`,
    );
  return sql.join(parts, sql` AND `);
}

const AMENITY_ASKED = sql`e.value <> 'null'::jsonb AND e.value <> '""'::jsonb`;
const requestAmenities = sql`jsonb_each(CASE WHEN jsonb_typeof(${r("amenities")}) = 'object' THEN ${r("amenities")} ELSE '{}'::jsonb END) e`;

/** How many preferences the request states (depends on the request only). */
export function preferenceTotalSql() {
  return sql`(
    (CASE WHEN ${r("area_min")} IS NOT NULL OR ${r("area_max")} IS NOT NULL THEN 1 ELSE 0 END)
    + ${sql.join(
      COUNTS.map(
        (count) =>
          sql`(CASE WHEN ${r(count.field)} IS NOT NULL THEN 1 ELSE 0 END)`,
      ),
      sql` + `,
    )}
    + (CASE WHEN ${r("amenities")} = '{}'::jsonb THEN 0
      WHEN EXISTS (SELECT 1 FROM ${requestAmenities} WHERE ${AMENITY_ASKED}) THEN 1 ELSE 0 END)
  )`;
}

/** How many of the request's preferences the offer meets. */
export function preferenceMetSql(kind: MatchKind) {
  const offered = (key: SQL) =>
    sql`(CASE WHEN jsonb_typeof(${o("amenities")}) = 'object' THEN ${o("amenities")} -> ${key} END)`;
  const truthy = (value: SQL) =>
    sql`(${value} IS NOT NULL AND ${value} NOT IN ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb))`;
  const area = sql`(CASE WHEN (${r("area_min")} IS NOT NULL OR ${r("area_max")} IS NOT NULL)
      AND (${r("area_min")} IS NULL OR ${o("area_value")} >= ${r("area_min")})
      AND (${r("area_max")} IS NULL OR ${o("area_value")} <= ${r("area_max")})
      AND (NOT ${filled(r("area_unit"))} OR ${norm(r("area_unit"))} = ${norm(o("area_unit"))})
    THEN 1 ELSE 0 END)`;
  // Sale listings record no floor count, so that preference is never met.
  const counts = COUNTS.map((count) =>
    kind === "sale" && count.field === "floors_count"
      ? sql`0`
      : sql`(CASE WHEN ${r(count.field)} IS NOT NULL AND ${o(count.field)} >= ${r(count.field)} THEN 1 ELSE 0 END)`,
  );
  // Most requests ask for no amenities; skip jsonb_each for them.
  const amenities = sql`(CASE WHEN ${r("amenities")} = '{}'::jsonb THEN 0
    WHEN EXISTS (SELECT 1 FROM ${requestAmenities} WHERE ${AMENITY_ASKED})
      AND NOT EXISTS (
        SELECT 1 FROM ${requestAmenities}
        WHERE ${AMENITY_ASKED}
          AND NOT (
            (jsonb_typeof(e.value) IN ('boolean', 'number', 'string') AND coalesce(${offered(sql`e.key`)} = e.value, false))
            OR (e.value = 'true'::jsonb AND ${truthy(offered(sql`e.key`))})
          )
      )
    THEN 1 ELSE 0 END)`;
  return sql`(${area} + ${sql.join(counts, sql` + `)} + ${amenities})`;
}
