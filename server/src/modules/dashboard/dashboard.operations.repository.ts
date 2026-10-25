import { inArray, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import { pool } from "../../infrastructure/database/pool.js";
import { properties, rentals } from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import {
  evaluateMatch,
  preferenceMetSql,
  preferenceTotalSql,
  requiredSql,
  type MatchEvaluation,
  type MatchKind,
} from "../matching/matching.rules.js";
import type { MatchingQuery, OverviewQuery } from "./dashboard.schema.js";

/**
 * The operational dashboard: what needs doing, from recorded data only.
 * Every figure here is defined in docs/OPERATIONS_DASHBOARD.md; a section
 * the caller may not read is null, and its queries do not run.
 */
export type OperationsAccess = {
  properties: boolean;
  rentals: boolean;
  requests: boolean;
  followups: boolean;
  rentalFollowups: boolean;
};

// Start of today in the office's time zone, as a timestamptz.
const TODAY = sql`(date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad')`;
/** How far back the closings and viewings look. */
const RECENT_DAYS = 30;
const APPOINTMENT_DAYS = 7;
const APPOINTMENT_LIMIT = 20;
const EXAMPLE_LIMIT = 5;
const CUSTOMER_LIMIT = 8;

type Row = Record<string, unknown>;

const dialect = new PgDialect();

/**
 * Runs a raw query on the pool itself: unlike db.execute, which keeps
 * timestamps as PostgreSQL text, it returns them as Dates (ISO in JSON).
 */
async function rows(query: SQL): Promise<Row[]> {
  const { sql: text, params } = dialect.sqlToQuery(query);
  return (await pool.query(text, params)).rows as Row[];
}
const toNumber = (value: unknown) => (value === null ? null : Number(value));
const toCount = (value: unknown) => Number(value ?? 0);

// ─── Overview ────────────────────────────────────────────────────────────

const FOLLOWUP_SOURCES = {
  sale: {
    followups: sql.raw("property_followups"),
    listings: sql.raw("properties"),
    listingId: sql.raw("property_id"),
  },
  rental: {
    followups: sql.raw("rental_followups"),
    listings: sql.raw("rentals"),
    listingId: sql.raw("rental_id"),
  },
} as const;

/** The follow-up kinds the caller may read. */
function followupKinds(access: OperationsAccess): MatchKind[] {
  return [
    ...(access.followups && access.properties ? (["sale"] as const) : []),
    ...(access.rentalFollowups && access.rentals ? (["rental"] as const) : []),
  ];
}

/** Follow-ups of the given kinds as one list (`f` and listing `l` aliases). */
function followupUnion(kinds: MatchKind[], where: SQL) {
  return sql.join(
    kinds.map((kind) => {
      const source = FOLLOWUP_SOURCES[kind];
      return sql`SELECT f.id, ${kind}::text AS kind, l.id AS listing_id, l.code AS listing_code,
          coalesce(l.name, ${kind === "sale" ? "عقار " : "إيجار "}::text || l.code) AS listing_name,
          l.status AS listing_status, f.type, f.notes, f.scheduled_at, f.created_at, u.username AS user_name
        FROM ${source.followups} f
        JOIN ${source.listings} l ON l.id = f.${source.listingId}
        LEFT JOIN users u ON u.id = f.user_id
        WHERE ${where}`;
    }),
    sql` UNION ALL `,
  );
}

function appointmentRow(row: Row) {
  return {
    id: Number(row.id),
    kind: row.kind as MatchKind,
    listing_id: Number(row.listing_id),
    listing_code: row.listing_code as string,
    listing_name: row.listing_name as string,
    listing_status: row.listing_status as string,
    type: row.type as string,
    notes: (row.notes as string | null) ?? null,
    scheduled_at: row.scheduled_at as Date,
    created_at: row.created_at as Date,
    user_name: (row.user_name as string | null) ?? null,
  };
}

/** Scheduled follow-ups from the start of today through the next 7 days. */
async function getAppointments(kinds: MatchKind[]) {
  const window = sql`f.scheduled_at >= ${TODAY} AND f.scheduled_at < ${TODAY} + make_interval(days => ${APPOINTMENT_DAYS})`;
  const all = followupUnion(kinds, window);
  const [counts] = await rows(sql`SELECT
      count(*) FILTER (WHERE scheduled_at < ${TODAY} + interval '1 day')::int AS today,
      count(*)::int AS next_days
    FROM (${all}) a`);
  const items = await rows(
    sql`SELECT * FROM (${all}) a ORDER BY scheduled_at, kind, id LIMIT ${APPOINTMENT_LIMIT}`,
  );
  return {
    today: toCount(counts?.today),
    next_days: toCount(counts?.next_days),
    days: APPOINTMENT_DAYS,
    items: items.map(appointmentRow),
  };
}

/**
 * Viewings (follow-ups of type "visit") whose time passed in the last 30
 * days with nothing recorded on that listing since: no follow-up added after
 * the viewing's time.
 */
async function getViewingsWithoutOutcome(kinds: MatchKind[]) {
  const pending = sql.join(
    kinds.map((kind) => {
      const source = FOLLOWUP_SOURCES[kind];
      return sql`(${followupUnion(
        [kind],
        sql`f.type = 'visit' AND f.scheduled_at < now()
          AND f.scheduled_at >= now() - make_interval(days => ${RECENT_DAYS})
          AND NOT EXISTS (
            SELECT 1 FROM ${source.followups} later
            WHERE later.${source.listingId} = f.${source.listingId}
              AND later.id <> f.id AND later.created_at > f.scheduled_at
          )`,
      )})`;
    }),
    sql` UNION ALL `,
  );
  const items =
    await rows(sql`SELECT *, count(*) OVER () AS total FROM (${pending}) v
    ORDER BY scheduled_at DESC, kind, id LIMIT ${EXAMPLE_LIMIT}`);
  return {
    total: toCount(items[0]?.total),
    days: RECENT_DAYS,
    items: items.map(appointmentRow),
  };
}

/**
 * Available listings with no edit and no follow-up recorded in the last
 * `days` days, least recently touched first.
 */
async function getStaleListings(kind: MatchKind, days: number) {
  const source = FOLLOWUP_SOURCES[kind];
  const price = sql.raw(kind === "sale" ? "l.total_price" : "l.rent_price");
  const items = await rows(sql`SELECT l.id, l.code,
      coalesce(l.name, ${kind === "sale" ? "عقار " : "إيجار "}::text || l.code) AS name,
      l.property_type, l.governorate, l.district, ${price} AS price,
      ${kind === "rental" ? sql.raw("l.rent_period") : sql`NULL::text`} AS rent_period,
      l.updated_at, lf.last_followup_at, count(*) OVER () AS total
    FROM ${source.listings} l
    LEFT JOIN LATERAL (
      SELECT max(f.created_at) AS last_followup_at FROM ${source.followups} f
      WHERE f.${source.listingId} = l.id
    ) lf ON true
    WHERE l.status = 'available'
      AND l.updated_at < now() - make_interval(days => ${days})
      AND (lf.last_followup_at IS NULL OR lf.last_followup_at < now() - make_interval(days => ${days}))
    ORDER BY greatest(l.updated_at, coalesce(lf.last_followup_at, l.updated_at)), l.id
    LIMIT ${EXAMPLE_LIMIT}`);
  return {
    total: toCount(items[0]?.total),
    items: items.map((row) => ({
      id: Number(row.id),
      kind,
      code: row.code as string,
      name: row.name as string,
      property_type: row.property_type as string,
      governorate: (row.governorate as string | null) ?? null,
      district: (row.district as string | null) ?? null,
      price: Number(row.price),
      rent_period: (row.rent_period as string | null) ?? null,
      updated_at: row.updated_at as Date,
      last_followup_at: (row.last_followup_at as Date | null) ?? null,
    })),
  };
}

const MONTHLY_RENT = sql`(CASE WHEN rent_period = 'annual' THEN rent_price / 12
  WHEN rent_period = 'semi_annual' THEN rent_price / 6 ELSE rent_price END)`;

/**
 * Current status counts, the value on offer, and listings closed in the last
 * 30 days: currently sold (rented) and changed to that status in the change
 * log within the period.
 */
async function getSaleFigures() {
  const [row] = await rows(sql`SELECT
      count(*) FILTER (WHERE status = 'available')::int AS available,
      count(*) FILTER (WHERE status = 'reserved')::int AS reserved,
      count(*) FILTER (WHERE status = 'negotiating')::int AS negotiating,
      count(*) FILTER (WHERE status = 'sold')::int AS sold,
      coalesce(sum(total_price) FILTER (WHERE status = 'available'), 0) AS available_value,
      (SELECT count(DISTINCT a.entity_id)::int FROM audit_logs a
        JOIN properties s ON s.id = a.entity_id AND s.status = 'sold'
        WHERE a.entity_type = 'property' AND a.action = 'status_changed'
          AND a.new_value ->> 'status' = 'sold'
          AND a.created_at >= now() - make_interval(days => ${RECENT_DAYS})) AS closed_recently
    FROM properties`);
  return {
    counts: {
      available: toCount(row?.available),
      reserved: toCount(row?.reserved),
      negotiating: toCount(row?.negotiating),
      sold: toCount(row?.sold),
    },
    available_value: Number(row?.available_value ?? 0),
    closed_recently: toCount(row?.closed_recently),
  };
}

async function getRentalFigures() {
  const [row] = await rows(sql`SELECT
      count(*) FILTER (WHERE status = 'available')::int AS available,
      count(*) FILTER (WHERE status = 'reserved')::int AS reserved,
      count(*) FILTER (WHERE status = 'negotiating')::int AS negotiating,
      count(*) FILTER (WHERE status = 'rented')::int AS rented,
      coalesce(sum(${MONTHLY_RENT}) FILTER (WHERE status = 'available'), 0) AS available_monthly_value,
      coalesce(sum(${MONTHLY_RENT}) FILTER (WHERE status = 'rented'), 0) AS rented_monthly_value,
      (SELECT count(DISTINCT a.entity_id)::int FROM audit_logs a
        JOIN rentals s ON s.id = a.entity_id AND s.status = 'rented'
        WHERE a.entity_type = 'rental' AND a.action = 'updated'
          AND a.new_value ->> 'status' = 'rented'
          AND coalesce(a.old_value ->> 'status', '') <> 'rented'
          AND a.created_at >= now() - make_interval(days => ${RECENT_DAYS})) AS closed_recently
    FROM rentals`);
  return {
    counts: {
      available: toCount(row?.available),
      reserved: toCount(row?.reserved),
      negotiating: toCount(row?.negotiating),
      rented: toCount(row?.rented),
    },
    available_monthly_value: Math.round(
      Number(row?.available_monthly_value ?? 0),
    ),
    rented_monthly_value: Math.round(Number(row?.rented_monthly_value ?? 0)),
    closed_recently: toCount(row?.closed_recently),
  };
}

export async function getOperationsOverview(
  access: OperationsAccess,
  query: OverviewQuery,
) {
  const kinds = followupKinds(access);
  // One query at a time: each is small, and the dashboard's matching request
  // runs beside this one.
  const sale = access.properties ? await getSaleFigures() : null;
  const rental = access.rentals ? await getRentalFigures() : null;
  const appointments = kinds.length ? await getAppointments(kinds) : null;
  const viewings = kinds.length ? await getViewingsWithoutOutcome(kinds) : null;
  const staleSale = access.properties
    ? await getStaleListings("sale", query.stale_days)
    : null;
  const staleRental = access.rentals
    ? await getStaleListings("rental", query.stale_days)
    : null;
  return {
    generated_at: new Date(),
    recent_days: RECENT_DAYS,
    stale_days: query.stale_days,
    sale,
    rental,
    appointments,
    viewings_without_outcome: viewings,
    stale_listings: { sale: staleSale, rental: staleRental },
  };
}

// ─── Matching ────────────────────────────────────────────────────────────

const REQUEST_TABLES = {
  sale: sql.raw("purchase_requests"),
  rental: sql.raw("rental_requests"),
} as const;
const OFFER_TABLES = {
  sale: sql.raw("properties"),
  rental: sql.raw("rentals"),
} as const;

export type RequestSummary = {
  kind: MatchKind;
  id: number;
  code: string;
  person_id: number;
  person_code: string;
  person_name: string;
  person_phone: string | null;
  property_type: string;
  rent_period: string | null;
  budget_min: number | null;
  budget_max: number | null;
  area_min: number | null;
  area_max: number | null;
  area_unit: string | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  floors_count: number | null;
  governorate: string | null;
  district: string | null;
  neighborhood: string | null;
  other_requirements: string | null;
  created_at: Date;
  updated_at: Date;
  /** Available listings meeting every required criterion. */
  match_count: number;
  preferences_total: number;
};

/** Open requests of active customers (alias `r`), with their preference count. */
function openRequestsSql(kind: MatchKind, ids?: number[]) {
  return sql`SELECT r.*, p.full_name AS person_name, p.code AS person_code,
      p.phone_primary AS person_phone, ${preferenceTotalSql()} AS preferences_total
    FROM ${REQUEST_TABLES[kind]} r
    JOIN people p ON p.id = r.person_id
    WHERE r.status = 'open' AND p.status = 'active'
      ${ids ? sql`AND r.id = ANY(${sql.param(ids)}::bigint[])` : sql``}`;
}

// Preferences met by the pair; a request that states none skips the work.
const preferencesMet = (kind: MatchKind) =>
  sql`CASE WHEN r.preferences_total = 0 THEN 0 ELSE ${preferenceMetSql(kind)} END`;

/**
 * Every open request of an active customer, with how many available listings
 * meet all its required criteria and the most preferences any of them meets.
 * One grouped pass over the pairs: no sort, so it stays in memory however
 * many pairs there are (docs/OPERATIONS_DASHBOARD.md, "Performance").
 */
export function matchSummarySql(kind: MatchKind) {
  return sql`WITH open_requests AS MATERIALIZED (${openRequestsSql(kind)}),
    matches AS (
      SELECT r.id AS request_id, count(*)::int AS match_count,
        max(${preferencesMet(kind)}) AS best_preferences_met
      FROM open_requests r
      JOIN ${OFFER_TABLES[kind]} o ON o.status = 'available' AND ${requiredSql(kind)}
      GROUP BY r.id
    )
    SELECT r.*, coalesce(m.match_count, 0) AS match_count,
      coalesce(m.best_preferences_met, 0) AS best_preferences_met
    FROM open_requests r
    LEFT JOIN matches m ON m.request_id = r.id`;
}

/**
 * The best available listing for each of these requests: every required
 * criterion met, then the most preferences, the most recently updated, the
 * highest id. Asked only for the requests on the page.
 */
export async function bestOffers(kind: MatchKind, requestIds: number[]) {
  if (!requestIds.length) return new Map<number, number>();
  const found = await rows(sql`WITH open_requests AS (${openRequestsSql(kind, requestIds)})
    SELECT r.id AS request_id, b.offer_id
    FROM open_requests r
    CROSS JOIN LATERAL (
      SELECT o.id AS offer_id FROM ${OFFER_TABLES[kind]} o
      WHERE o.status = 'available' AND ${requiredSql(kind)}
      ORDER BY ${preferencesMet(kind)} DESC, o.updated_at DESC, o.id DESC
      LIMIT 1
    ) b`);
  return new Map(found.map((row) => [Number(row.request_id), Number(row.offer_id)]));
}

export async function requestMatchSummaries(kind: MatchKind) {
  const result = await rows(matchSummarySql(kind));
  return result.map((row) => ({
    summary: {
      kind,
      id: Number(row.id),
      code: row.code as string,
      person_id: Number(row.person_id),
      person_code: row.person_code as string,
      person_name: row.person_name as string,
      person_phone: (row.person_phone as string | null) ?? null,
      property_type: row.property_type as string,
      rent_period:
        kind === "rental" ? ((row.rent_period as string | null) ?? null) : null,
      budget_min: toNumber(row.budget_min),
      budget_max: toNumber(row.budget_max),
      area_min: toNumber(row.area_min),
      area_max: toNumber(row.area_max),
      area_unit: (row.area_unit as string | null) ?? null,
      rooms_count: toNumber(row.rooms_count),
      bathrooms_count: toNumber(row.bathrooms_count),
      floors_count: toNumber(row.floors_count),
      governorate: (row.governorate as string | null) ?? null,
      district: (row.district as string | null) ?? null,
      neighborhood: (row.neighborhood as string | null) ?? null,
      other_requirements: (row.other_requirements as string | null) ?? null,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
      match_count: toCount(row.match_count),
      preferences_total: toCount(row.preferences_total),
    } satisfies RequestSummary,
    // The raw request row, for evaluateMatch.
    request: row,
    best_preferences_met: toCount(row.best_preferences_met),
  }));
}

type Summary = Awaited<ReturnType<typeof requestMatchSummaries>>[number];

/** Letters and digits of a search, and of a phone for digit-only matching. */
function matchesSearch(summary: RequestSummary, q: string | undefined) {
  if (!q) return true;
  const tokens = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    summary.person_name,
    summary.person_code,
    summary.code,
    summary.person_phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const phoneDigits = (summary.person_phone ?? "").replace(/\D/g, "");
  return tokens.every((token) => {
    const digits = token.replace(/\D/g, "");
    return (
      haystack.includes(token) ||
      (digits.length >= 3 && digits === token && phoneDigits.includes(digits))
    );
  });
}

/** Preferences met as a share of those stated; none stated counts as all. */
function preferenceShare(summary: Summary) {
  const total = summary.summary.preferences_total;
  return total ? summary.best_preferences_met / total : 1;
}

function byOpportunity(a: Summary, b: Summary) {
  return (
    preferenceShare(b) - preferenceShare(a) ||
    b.summary.updated_at.getTime() - a.summary.updated_at.getTime() ||
    b.summary.id - a.summary.id
  );
}

function offerSummary(kind: MatchKind, offer: Row) {
  return {
    id: Number(offer.id),
    kind,
    code: offer.code as string,
    name: offer.name as string,
    property_type: offer.property_type as string,
    status: offer.status as string,
    price: Number(kind === "sale" ? offer.total_price : offer.rent_price),
    rent_period: kind === "rental" ? (offer.rent_period as string) : null,
    area_value: Number(offer.area_value),
    area_unit: offer.area_unit as string,
    rooms_count: toNumber(offer.rooms_count ?? null),
    bathrooms_count: toNumber(offer.bathrooms_count ?? null),
    floors_count:
      kind === "rental" ? toNumber(offer.floors_count ?? null) : null,
    governorate: (offer.governorate as string | null) ?? null,
    district: (offer.district as string | null) ?? null,
    neighborhood: (offer.neighborhood as string | null) ?? null,
    is_negotiable: Boolean(offer.is_negotiable),
    owner_person_id: toNumber(offer.owner_person_id ?? null),
    updated_at: offer.updated_at as Date,
  };
}

async function loadOffers(kind: MatchKind, ids: number[]) {
  if (!ids.length) return new Map<number, Row>();
  const found =
    kind === "sale"
      ? await db.select().from(properties).where(inArray(properties.id, ids))
      : await db.select().from(rentals).where(inArray(rentals.id, ids));
  return new Map(
    found.map((offer) => [
      offer.id,
      toApiObject(offer, kind === "sale" ? "properties" : "rentals"),
    ]),
  );
}

export async function getOperationsMatching(
  access: OperationsAccess,
  query: MatchingQuery,
) {
  const kinds: MatchKind[] = access.requests
    ? [
        ...(access.properties ? (["sale"] as const) : []),
        ...(access.rentals ? (["rental"] as const) : []),
      ]
    : [];
  const byKind = new Map<MatchKind, Summary[]>();
  for (const kind of kinds) byKind.set(kind, await requestMatchSummaries(kind));

  const countsOf = (kind: MatchKind) => {
    const list = byKind.get(kind);
    if (!list) return null;
    const withMatches = list.filter(
      (item) => item.summary.match_count > 0,
    ).length;
    return {
      open_requests: list.length,
      with_matches: withMatches,
      without_matches: list.length - withMatches,
    };
  };

  const all = [...byKind.values()].flat();
  const searched = all.filter((item) => matchesSearch(item.summary, query.q));
  const inKind = searched.filter(
    (item) => query.kind === "all" || item.summary.kind === query.kind,
  );

  // The workspace: one row per request with at least one full match.
  const matched = inKind
    .filter((item) => item.summary.match_count > 0)
    .sort(byOpportunity);
  const start = (query.page - 1) * query.page_size;
  const page = matched.slice(start, start + query.page_size);
  const best = new Map<MatchKind, Map<number, number>>();
  const offers = new Map<MatchKind, Map<number, Row>>();
  for (const kind of kinds) {
    const ids = await bestOffers(
      kind,
      page.filter((item) => item.summary.kind === kind).map((item) => item.summary.id),
    );
    best.set(kind, ids);
    offers.set(kind, await loadOffers(kind, [...new Set(ids.values())]));
  }
  const items = page.flatMap((item) => {
    const offerId = best.get(item.summary.kind)?.get(item.summary.id);
    const offer = offerId === undefined ? undefined : offers.get(item.summary.kind)?.get(offerId);
    // Changed between the queries (sold, deleted): leave it out of this page.
    if (!offer) return [];
    const evaluation: MatchEvaluation = evaluateMatch(
      item.summary.kind,
      item.request,
      offer,
    );
    return [
      {
        request: item.summary,
        offer: offerSummary(item.summary.kind, offer),
        match: evaluation,
      },
    ];
  });

  // Customers with open requests: those with matches first, then whoever has
  // waited longest.
  const people = new Map<
    number,
    {
      person_id: number;
      person_code: string;
      person_name: string;
      person_phone: string | null;
      open_requests: number;
      requests_with_matches: number;
      total_matches: number;
      oldest_request_at: Date;
      last_request_update_at: Date;
      requests: Array<{
        kind: MatchKind;
        id: number;
        code: string;
        property_type: string;
        match_count: number;
      }>;
    }
  >();
  for (const { summary } of searched) {
    const entry = people.get(summary.person_id) ?? {
      person_id: summary.person_id,
      person_code: summary.person_code,
      person_name: summary.person_name,
      person_phone: summary.person_phone,
      open_requests: 0,
      requests_with_matches: 0,
      total_matches: 0,
      oldest_request_at: summary.created_at,
      last_request_update_at: summary.updated_at,
      requests: [],
    };
    entry.open_requests += 1;
    if (summary.match_count) entry.requests_with_matches += 1;
    entry.total_matches += summary.match_count;
    if (summary.created_at < entry.oldest_request_at)
      entry.oldest_request_at = summary.created_at;
    if (summary.updated_at > entry.last_request_update_at)
      entry.last_request_update_at = summary.updated_at;
    entry.requests.push({
      kind: summary.kind,
      id: summary.id,
      code: summary.code,
      property_type: summary.property_type,
      match_count: summary.match_count,
    });
    people.set(summary.person_id, entry);
  }
  const customers = [...people.values()].sort(
    (a, b) =>
      Number(b.requests_with_matches > 0) -
        Number(a.requests_with_matches > 0) ||
      a.oldest_request_at.getTime() - b.oldest_request_at.getTime() ||
      a.person_id - b.person_id,
  );

  // Open requests with no listing meeting their required criteria, longest
  // waiting first. Not narrowed by the search: it is the office's risk list.
  const unmatched = all
    .filter((item) => item.summary.match_count === 0)
    .sort(
      (a, b) =>
        a.summary.created_at.getTime() - b.summary.created_at.getTime() ||
        a.summary.id - b.summary.id,
    );

  return {
    kinds,
    counts: { sale: countsOf("sale"), rental: countsOf("rental") },
    items,
    total: matched.length,
    page: query.page,
    page_size: query.page_size,
    customers: {
      total: customers.length,
      items: customers.slice(0, CUSTOMER_LIMIT),
    },
    unmatched: {
      total: unmatched.length,
      items: unmatched.slice(0, EXAMPLE_LIMIT).map((item) => item.summary),
    },
  };
}
