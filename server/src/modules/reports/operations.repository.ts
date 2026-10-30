import { sql, type SQL } from "drizzle-orm";
import {
  rawRows,
  type RawRow,
} from "../../infrastructure/database/raw-query.js";
import { CURRENCIES, toMinor, type Currency } from "../../shared/money.js";
import { requestMatchSummaries } from "../dashboard/dashboard.operations.repository.js";
import type { MatchKind } from "../matching/matching.rules.js";
import { FREQUENCY_MONTHS } from "../leases/leases.rules.js";
import {
  AGE_BUCKETS,
  ageBucket,
  average,
  bandEnd,
  median,
  PRICE_BANDS,
  rate,
} from "./operations.rules.js";
import { officeToday, reportPeriod } from "./reports.rules.js";
import type {
  CustomersReportQuery,
  DealsReportQuery,
  LeasesReportQuery,
  ListingsReportQuery,
} from "./reports.schema.js";

/**
 * The operational reports: deals, customers, listings and leases, from the
 * records themselves. Each figure has one definition, in docs/REPORTS.md;
 * where the dashboard already defines one (listings without activity,
 * listings sold or rented, requests without a match) it is reused.
 * Timestamps are read as dates in the office's time zone (Baghdad).
 */

const DAY = (column: SQL) => sql`(${column} AT TIME ZONE 'Asia/Baghdad')::date`;
const count = (value: unknown) => Number(value ?? 0);
const id = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);
const text = (value: unknown) => (value as string | null) ?? null;
const money = (value: unknown) => (value as string | null) ?? "0.00";
const days = (value: unknown) =>
  value === null || value === undefined
    ? null
    : Math.round(Number(value) * 10) / 10;

/** Requests of a kind, and the listings and follow-ups that go with them. */
const KIND = {
  sale: {
    listings: sql.raw("properties"),
    followups: sql.raw("property_followups"),
    listingId: sql.raw("property_id"),
    requests: sql.raw("purchase_requests"),
    price: sql.raw("l.total_price"),
    budget: sql.raw("r.budget_max"),
    closedStatus: "sold",
  },
  rental: {
    listings: sql.raw("rentals"),
    followups: sql.raw("rental_followups"),
    listingId: sql.raw("rental_id"),
    requests: sql.raw("rental_requests"),
    // A rent as a month's share, as on the dashboard.
    price: sql.raw(
      "(CASE WHEN l.rent_period = 'annual' THEN l.rent_price / 12 WHEN l.rent_period = 'semi_annual' THEN l.rent_price / 6 ELSE l.rent_price END)",
    ),
    budget: sql.raw(
      "(CASE WHEN r.rent_period = 'annual' THEN r.budget_max / 12 WHEN r.rent_period = 'semi_annual' THEN r.budget_max / 6 ELSE r.budget_max END)",
    ),
    closedStatus: "rented",
  },
} as const;

/** The lower bound of the price band a value falls in (SQL numeric, exact). */
function bandSql(kind: MatchKind, value: SQL) {
  const bounds = [...PRICE_BANDS[kind]].reverse();
  return sql`CASE WHEN ${value} IS NULL THEN NULL ${sql.join(
    bounds.map((bound) => sql`WHEN ${value} >= ${bound} THEN ${bound}::bigint`),
    sql` `,
  )} END`;
}

// ─── Deals ─────────────────────────────────────────────────────────────

/**
 * Deals created and closed in the period, the pipeline now, conversion,
 * how long won deals took, why deals were lost, each employee's results
 * and the commissions deals generated. `user_id` keeps one employee's
 * deals (the one they are assigned to); `deal_type` one kind.
 */
export async function dealsReport(query: DealsReportQuery) {
  const { from, to } = reportPeriod(query);
  const scope = sql.join(
    [
      sql`true`,
      query.user_id ? sql`d.assigned_user_id = ${query.user_id}` : sql`true`,
      query.deal_type ? sql`d.deal_type = ${query.deal_type}` : sql`true`,
    ],
    sql` AND `,
  );
  const closedIn = sql`d.closed_at IS NOT NULL AND ${DAY(sql`d.closed_at`)} BETWEEN ${from} AND ${to}`;
  const createdIn = sql`${DAY(sql`d.created_at`)} BETWEEN ${from} AND ${to}`;
  const OPEN = sql`d.stage NOT IN ('won', 'lost', 'cancelled')`;

  const [totals, stages, reasons, employees, commissions, closed, pipeline] =
    await Promise.all([
      rawRows(sql`SELECT
          count(*) FILTER (WHERE ${createdIn})::int AS created,
          count(*) FILTER (WHERE d.stage = 'won' AND ${closedIn})::int AS won,
          count(*) FILTER (WHERE d.stage = 'lost' AND ${closedIn})::int AS lost,
          count(*) FILTER (WHERE d.stage = 'cancelled' AND ${closedIn})::int AS cancelled,
          count(*) FILTER (WHERE ${OPEN})::int AS open_now,
          count(*) FILTER (WHERE ${createdIn} AND d.stage = 'won')::int AS cohort_won,
          array_remove(array_agg(extract(epoch FROM d.closed_at - d.created_at) / 86400)
            FILTER (WHERE d.stage = 'won' AND ${closedIn}), NULL) AS cycle_days
        FROM deals d WHERE ${scope}`),
      rawRows(sql`SELECT d.stage, count(*)::int AS deals,
          avg(extract(epoch FROM now() - d.stage_changed_at) / 86400) AS days_in_stage
        FROM deals d WHERE ${scope} AND ${OPEN}
        GROUP BY d.stage`),
      rawRows(sql`SELECT coalesce(nullif(trim(d.lost_reason), ''), 'بلا سبب') AS reason,
          count(*)::int AS deals
        FROM deals d WHERE ${scope} AND d.stage = 'lost' AND ${closedIn}
        GROUP BY 1 ORDER BY 2 DESC, 1`),
      rawRows(sql`SELECT d.assigned_user_id AS user_id, u.display_name,
          count(*) FILTER (WHERE ${OPEN})::int AS open_now,
          count(*) FILTER (WHERE ${createdIn})::int AS created,
          count(*) FILTER (WHERE d.stage = 'won' AND ${closedIn})::int AS won,
          count(*) FILTER (WHERE d.stage = 'lost' AND ${closedIn})::int AS lost,
          avg(extract(epoch FROM d.closed_at - d.created_at) / 86400)
            FILTER (WHERE d.stage = 'won' AND ${closedIn}) AS cycle_days,
          coalesce(sum((SELECT sum(c.amount) FROM commissions c WHERE c.deal_id = d.id AND c.status = 'active'
            AND c.currency = 'IQD' AND c.commission_date BETWEEN ${from} AND ${to})), 0)::numeric(18,2)::text AS commission_iqd,
          coalesce(sum((SELECT sum(c.amount) FROM commissions c WHERE c.deal_id = d.id AND c.status = 'active'
            AND c.currency = 'USD' AND c.commission_date BETWEEN ${from} AND ${to})), 0)::numeric(18,2)::text AS commission_usd
        FROM deals d LEFT JOIN users u ON u.id = d.assigned_user_id
        WHERE ${scope}
        GROUP BY d.assigned_user_id, u.display_name
        ORDER BY u.display_name NULLS LAST`),
      rawRows(sql`SELECT c.currency, d.deal_type, count(*)::int AS commissions,
          sum(c.amount)::numeric(18,2)::text AS amount
        FROM commissions c JOIN deals d ON d.id = c.deal_id
        WHERE ${scope} AND c.status = 'active' AND c.commission_date BETWEEN ${from} AND ${to}
        GROUP BY c.currency, d.deal_type ORDER BY c.currency, d.deal_type`),
      rawRows(sql`SELECT d.id, d.code, d.deal_type, d.stage, d.currency, d.agreed_price::text,
          d.lost_reason, d.client_person_id, p.full_name AS client_name, u.display_name AS user_name,
          ${DAY(sql`d.created_at`)}::text AS created_on, ${DAY(sql`d.closed_at`)}::text AS closed_on,
          extract(epoch FROM d.closed_at - d.created_at) / 86400 AS cycle_days,
          count(*) OVER () AS total
        FROM deals d
        LEFT JOIN people p ON p.id = d.client_person_id
        LEFT JOIN users u ON u.id = d.assigned_user_id
        WHERE ${scope} AND d.stage IN ('won', 'lost', 'cancelled') AND ${closedIn}
        ORDER BY d.closed_at DESC, d.id DESC
        LIMIT 1000`),
      rawRows(sql`SELECT d.currency, count(*)::int AS deals,
          coalesce(sum(d.expected_commission), 0)::numeric(18,2)::text AS expected_commission
        FROM deals d WHERE ${scope} AND ${OPEN}
        GROUP BY d.currency ORDER BY d.currency`),
    ]);

  const row = totals[0] ?? {};
  const won = count(row.won);
  const lost = count(row.lost);
  const created = count(row.created);
  const cycle = ((row.cycle_days as unknown[] | null) ?? []).map(Number);
  const closedTotal = count(closed[0]?.total);
  return {
    from,
    to,
    user_id: query.user_id ?? null,
    deal_type: query.deal_type ?? null,
    totals: {
      created,
      won,
      lost,
      cancelled: count(row.cancelled),
      open_now: count(row.open_now),
      win_rate: rate(won, won + lost),
      cohort_won: count(row.cohort_won),
      cohort_conversion: rate(count(row.cohort_won), created),
      cycle_days_average: average(cycle),
      cycle_days_median: median(cycle),
    },
    stages: stages.map((item) => ({
      stage: item.stage as string,
      deals: count(item.deals),
      days_in_stage: days(item.days_in_stage),
    })),
    pipeline: pipeline.map((item) => ({
      currency: item.currency as Currency,
      deals: count(item.deals),
      expected_commission: money(item.expected_commission),
    })),
    lost_reasons: reasons.map((item) => ({
      reason: item.reason as string,
      deals: count(item.deals),
      share: rate(count(item.deals), lost),
    })),
    employees: employees.map((item) => ({
      user_id: id(item.user_id),
      display_name: text(item.display_name),
      open_now: count(item.open_now),
      created: count(item.created),
      won: count(item.won),
      lost: count(item.lost),
      win_rate: rate(count(item.won), count(item.won) + count(item.lost)),
      cycle_days: days(item.cycle_days),
      commission_iqd: money(item.commission_iqd),
      commission_usd: money(item.commission_usd),
    })),
    commissions: commissions.map((item) => ({
      currency: item.currency as Currency,
      deal_type: item.deal_type as string,
      commissions: count(item.commissions),
      amount: money(item.amount),
    })),
    closed: closed.map((item) => ({
      id: Number(item.id),
      code: item.code as string,
      deal_type: item.deal_type as string,
      stage: item.stage as string,
      currency: item.currency as Currency,
      agreed_price: text(item.agreed_price),
      lost_reason: text(item.lost_reason),
      client_person_id: id(item.client_person_id),
      client_name: text(item.client_name),
      user_name: text(item.user_name),
      created_on: item.created_on as string,
      closed_on: item.closed_on as string,
      cycle_days: days(item.cycle_days),
    })),
    closed_truncated: closedTotal > closed.length,
  };
}

// ─── Customers ─────────────────────────────────────────────────────────

/**
 * Every contact made with a customer: an activity or a follow-up naming
 * them that took place (done), when it was done (else when it was
 * recorded). A task still open is a plan, not a contact.
 */
const CONTACTS = sql`(
    SELECT person_id, user_id, type, coalesce(completed_at, created_at) AS created_at FROM activities
      WHERE person_id IS NOT NULL AND status = 'done'
    UNION ALL SELECT person_id, user_id, type, coalesce(completed_at, created_at) FROM property_followups
      WHERE person_id IS NOT NULL AND status = 'done'
    UNION ALL SELECT person_id, user_id, type, coalesce(completed_at, created_at) FROM rental_followups
      WHERE person_id IS NOT NULL AND status = 'done'
  )`;
const OPEN_REQUESTS = sql`(
    SELECT person_id FROM purchase_requests WHERE status = 'open'
    UNION ALL SELECT person_id FROM rental_requests WHERE status = 'open'
  )`;
const OPEN_DEAL = sql`EXISTS (SELECT 1 FROM deals d WHERE (d.client_person_id = p.id OR d.owner_person_id = p.id)
    AND d.stage NOT IN ('won', 'lost', 'cancelled'))`;

/**
 * Active customers with something open (an open deal as client or owner,
 * or with `requests` an open request) whose last contact is more than
 * `days` days before `to`, or who were never contacted: never contacted
 * first. The reports' and the dashboard's «customers needing contact».
 */
export async function uncontactedCustomers(input: {
  to: string;
  days: number;
  userId?: number | null;
  requests: boolean;
  limit: number;
}) {
  const assigned = input.userId
    ? sql`p.assigned_user_id = ${input.userId}`
    : sql`true`;
  const rows = await rawRows(sql`SELECT p.id, p.full_name, p.phone_primary, u.display_name AS user_name,
      ${input.requests ? sql`(SELECT count(*) FROM ${OPEN_REQUESTS} r WHERE r.person_id = p.id)` : sql`0`}::int AS open_requests,
      (SELECT count(*) FROM deals d WHERE (d.client_person_id = p.id OR d.owner_person_id = p.id)
        AND d.stage NOT IN ('won', 'lost', 'cancelled'))::int AS open_deals,
      ${DAY(sql`lc.last_contact`)}::text AS last_contact,
      count(*) OVER () AS total
    FROM people p
    LEFT JOIN users u ON u.id = p.assigned_user_id
    LEFT JOIN LATERAL (SELECT max(c.created_at) AS last_contact FROM ${CONTACTS} c WHERE c.person_id = p.id) lc ON true
    WHERE p.status = 'active' AND ${assigned}
      AND (${OPEN_DEAL} ${input.requests ? sql`OR EXISTS (SELECT 1 FROM ${OPEN_REQUESTS} r WHERE r.person_id = p.id)` : sql``})
      AND (lc.last_contact IS NULL OR ${DAY(sql`lc.last_contact`)} < ${input.to}::date - ${input.days}::int)
    ORDER BY lc.last_contact NULLS FIRST, p.id
    LIMIT ${input.limit}`);
  return {
    total: count(rows[0]?.total),
    rows: rows.map((item) => ({
      person_id: Number(item.id),
      person_name: item.full_name as string,
      phone: text(item.phone_primary),
      user_name: text(item.user_name),
      open_requests: count(item.open_requests),
      open_deals: count(item.open_deals),
      last_contact: text(item.last_contact),
    })),
  };
}

/**
 * Customers: how many are active and new, who was contacted (an activity
 * or a follow-up naming them), who has something open and has not been
 * contacted for `days` days, customers with more than one won deal, and
 * how customers and requests turned into deals. `user_id` keeps one
 * employee's customers (assigned to them) and contacts (made by them).
 * Request figures need `requests.read` and are null without it.
 */
export async function customersReport(
  query: CustomersReportQuery,
  access: { requests: boolean },
) {
  const { from, to } = reportPeriod(query);
  const stale = query.days;
  const assigned = query.user_id
    ? sql`p.assigned_user_id = ${query.user_id}`
    : sql`true`;
  const byUser = (column: SQL) =>
    query.user_id ? sql`${column} = ${query.user_id}` : sql`true`;
  const wonDeals = sql`(SELECT count(*) FROM deals d WHERE (d.client_person_id = p.id OR d.owner_person_id = p.id)
    AND d.stage = 'won' AND ${DAY(sql`d.closed_at`)} <= ${to})`;

  const [totals, uncontacted, repeat, byType, byUser2, requests] =
    await Promise.all([
      rawRows(sql`SELECT
          count(*) FILTER (WHERE p.status = 'active')::int AS active,
          count(*) FILTER (WHERE ${DAY(sql`p.created_at`)} BETWEEN ${from} AND ${to})::int AS new,
          count(*) FILTER (WHERE ${DAY(sql`p.created_at`)} BETWEEN ${from} AND ${to} AND ${wonDeals} > 0)::int AS new_converted,
          (SELECT count(DISTINCT c.person_id)::int FROM ${CONTACTS} c
            JOIN people cp ON cp.id = c.person_id
            WHERE ${DAY(sql`c.created_at`)} BETWEEN ${from} AND ${to} AND ${byUser(sql`c.user_id`)}) AS contacted
        FROM people p WHERE ${assigned}`),
      uncontactedCustomers({
        to,
        days: stale,
        userId: query.user_id,
        requests: access.requests,
        limit: 500,
      }),
      rawRows(sql`SELECT p.id, p.full_name, p.phone_primary, ${wonDeals}::int AS won_deals,
          (SELECT max(${DAY(sql`d.closed_at`)})::text FROM deals d WHERE (d.client_person_id = p.id OR d.owner_person_id = p.id)
            AND d.stage = 'won' AND ${DAY(sql`d.closed_at`)} <= ${to}) AS last_won
        FROM people p
        WHERE ${assigned} AND ${wonDeals} >= 2
        ORDER BY 4 DESC, p.full_name
        LIMIT 500`),
      rawRows(sql`SELECT c.type, count(*)::int AS contacts, count(DISTINCT c.person_id)::int AS customers
        FROM ${CONTACTS} c
        WHERE ${DAY(sql`c.created_at`)} BETWEEN ${from} AND ${to} AND ${byUser(sql`c.user_id`)}
        GROUP BY c.type ORDER BY 2 DESC`),
      rawRows(sql`SELECT c.user_id, u.display_name, count(*)::int AS contacts,
          count(DISTINCT c.person_id)::int AS customers
        FROM ${CONTACTS} c LEFT JOIN users u ON u.id = c.user_id
        WHERE ${DAY(sql`c.created_at`)} BETWEEN ${from} AND ${to} AND ${byUser(sql`c.user_id`)}
        GROUP BY c.user_id, u.display_name ORDER BY 3 DESC`),
      access.requests
        ? rawRows(sql`SELECT kind,
              count(*) FILTER (WHERE status = 'open' AND active)::int AS open,
              count(*) FILTER (WHERE created)::int AS created,
              count(*) FILTER (WHERE created AND has_deal)::int AS with_deal,
              count(*) FILTER (WHERE created AND won)::int AS won
            FROM (
              SELECT 'sale' AS kind, r.status, cp.status = 'active' AS active,
                ${DAY(sql`r.created_at`)} BETWEEN ${from} AND ${to} AS created,
                EXISTS (SELECT 1 FROM deals d WHERE d.purchase_request_id = r.id) AS has_deal,
                EXISTS (SELECT 1 FROM deals d WHERE d.purchase_request_id = r.id AND d.stage = 'won') AS won
              FROM purchase_requests r JOIN people cp ON cp.id = r.person_id
              WHERE ${query.user_id ? sql`cp.assigned_user_id = ${query.user_id}` : sql`true`}
              UNION ALL
              SELECT 'rental', r.status, cp.status = 'active',
                ${DAY(sql`r.created_at`)} BETWEEN ${from} AND ${to},
                EXISTS (SELECT 1 FROM deals d WHERE d.rental_request_id = r.id),
                EXISTS (SELECT 1 FROM deals d WHERE d.rental_request_id = r.id AND d.stage = 'won')
              FROM rental_requests r JOIN people cp ON cp.id = r.person_id
              WHERE ${query.user_id ? sql`cp.assigned_user_id = ${query.user_id}` : sql`true`}
            ) x
            GROUP BY kind ORDER BY kind`)
        : Promise.resolve(null),
    ]);

  const row = totals[0] ?? {};
  const created = count(row.new);
  return {
    from,
    to,
    days: stale,
    user_id: query.user_id ?? null,
    totals: {
      active: count(row.active),
      new: created,
      contacted: count(row.contacted),
      uncontacted: uncontacted.total,
      repeat: repeat.length,
      new_converted: count(row.new_converted),
      new_conversion: rate(count(row.new_converted), created),
    },
    uncontacted: uncontacted.rows,
    repeat: repeat.map((item) => ({
      person_id: Number(item.id),
      person_name: item.full_name as string,
      phone: text(item.phone_primary),
      won_deals: count(item.won_deals),
      last_won: text(item.last_won),
    })),
    contacts_by_type: byType.map((item) => ({
      type: item.type as string,
      contacts: count(item.contacts),
      customers: count(item.customers),
    })),
    contacts_by_user: byUser2.map((item) => ({
      user_id: id(item.user_id),
      display_name: text(item.display_name),
      contacts: count(item.contacts),
      customers: count(item.customers),
    })),
    requests: requests
      ? requests.map((item) => ({
          kind: item.kind as MatchKind,
          open: count(item.open),
          created: count(item.created),
          with_deal: count(item.with_deal),
          won: count(item.won),
          conversion: rate(count(item.won), count(item.created)),
        }))
      : null,
  };
}

// ─── Listings ──────────────────────────────────────────────────────────

/**
 * Sale or rental listings: status now, those sold (rented) in the period,
 * how long the available ones have been on offer, and supply against
 * demand by type, price band and location, with the open requests nothing
 * matches. Demand needs `requests.read` and is null without it.
 */
export async function listingsReport(
  query: ListingsReportQuery,
  access: { requests: boolean },
) {
  const { from, to } = reportPeriod(query);
  const kind = query.kind;
  const k = KIND[kind];
  const today = officeToday();
  // Listings now sold (rented) whose change log records the change in the
  // period: the dashboard's definition.
  const closedLog =
    kind === "sale"
      ? sql`a.entity_type = 'property' AND a.action = 'status_changed' AND a.new_value ->> 'status' = 'sold'`
      : sql`a.entity_type = 'rental' AND a.action = 'updated' AND a.new_value ->> 'status' = 'rented'
          AND coalesce(a.old_value ->> 'status', '') <> 'rented'`;

  const [statuses, available, closed, stale, types, bands, demand, matches] =
    await Promise.all([
      rawRows(
        sql`SELECT status, count(*)::int AS listings FROM ${k.listings} GROUP BY status ORDER BY 2 DESC`,
      ),
      rawRows(sql`SELECT l.id, (${today}::date - ${DAY(sql`l.created_at`)}) AS age
        FROM ${k.listings} l WHERE l.status = 'available'`),
      rawRows(sql`SELECT l.id, l.code, coalesce(l.name, l.code) AS name, l.property_type,
          ${k.price}::numeric(18,2)::text AS price, max(${DAY(sql`a.created_at`)})::text AS closed_on
        FROM audit_logs a JOIN ${k.listings} l ON l.id = a.entity_id AND l.status = ${k.closedStatus}
        WHERE ${closedLog} AND ${DAY(sql`a.created_at`)} BETWEEN ${from} AND ${to}
        GROUP BY l.id ORDER BY max(a.created_at) DESC
        LIMIT 500`),
      rawRows(sql`SELECT count(*)::int AS listings
        FROM ${k.listings} l
        WHERE l.status = 'available' AND l.updated_at < now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM ${k.followups} f WHERE f.${k.listingId} = l.id
            AND f.created_at >= now() - interval '30 days')`),
      rawRows(sql`SELECT t.property_type,
          count(*) FILTER (WHERE t.side = 'listing')::int AS available,
          count(*) FILTER (WHERE t.side = 'request')::int AS requests
        FROM (
          SELECT property_type, 'listing' AS side FROM ${k.listings} WHERE status = 'available'
          ${access.requests ? sql`UNION ALL SELECT r.property_type, 'request' FROM ${k.requests} r JOIN people p ON p.id = r.person_id WHERE r.status = 'open' AND p.status = 'active'` : sql``}
        ) t
        GROUP BY t.property_type ORDER BY 2 DESC, 3 DESC, 1`),
      rawRows(sql`SELECT band, count(*) FILTER (WHERE side = 'listing')::int AS available,
          count(*) FILTER (WHERE side = 'request')::int AS requests
        FROM (
          SELECT ${bandSql(kind, k.price)} AS band, 'listing' AS side FROM ${k.listings} l WHERE l.status = 'available'
          ${access.requests ? sql`UNION ALL SELECT ${bandSql(kind, k.budget)}, 'request' FROM ${k.requests} r JOIN people p ON p.id = r.person_id WHERE r.status = 'open' AND p.status = 'active'` : sql``}
        ) b
        GROUP BY band ORDER BY band NULLS LAST`),
      access.requests
        ? rawRows(sql`SELECT coalesce(nullif(r.governorate, ''), '—') AS governorate,
              coalesce(nullif(r.district, ''), '—') AS district,
              count(*)::int AS requests,
              (SELECT count(*) FROM ${k.listings} l WHERE l.status = 'available'
                AND coalesce(l.governorate, '') = coalesce(r.governorate, '')
                AND coalesce(l.district, '') = coalesce(r.district, ''))::int AS available
            FROM ${k.requests} r JOIN people p ON p.id = r.person_id
            WHERE r.status = 'open' AND p.status = 'active'
            GROUP BY r.governorate, r.district ORDER BY 3 DESC, 1, 2
            LIMIT 200`)
        : Promise.resolve(null),
      access.requests ? requestMatchSummaries(kind) : Promise.resolve(null),
    ]);

  const ages = available.map((row) => Number(row.age));
  const ageCounts = new Map<string, number>(
    AGE_BUCKETS.map((bucket) => [bucket.key, 0]),
  );
  for (const age of ages) {
    const key = ageBucket(age);
    ageCounts.set(key, ageCounts.get(key)! + 1);
  }
  const unmatched = matches
    ? matches
        .filter((item) => item.summary.match_count === 0)
        .map(({ summary }) => summary)
    : null;
  return {
    kind,
    from,
    to,
    statuses: statuses.map((row) => ({
      status: row.status as string,
      listings: count(row.listings),
    })),
    totals: {
      available: ages.length,
      closed: closed.length,
      stale: count(stale[0]?.listings),
      age_median: median(ages),
      open_requests: matches ? matches.length : null,
      unmatched_requests: unmatched ? unmatched.length : null,
    },
    age: AGE_BUCKETS.map((bucket) => ({
      bucket: bucket.key,
      listings: ageCounts.get(bucket.key)!,
    })),
    closed: closed.map((row) => ({
      id: Number(row.id),
      code: row.code as string,
      name: row.name as string,
      property_type: row.property_type as string,
      price: text(row.price),
      closed_on: row.closed_on as string,
    })),
    types: types.map((row) => ({
      property_type: row.property_type as string,
      available: count(row.available),
      requests: access.requests ? count(row.requests) : null,
    })),
    price_bands: bands.map((row) => {
      const lower = row.band === null ? null : Number(row.band);
      return {
        from: lower,
        to: lower === null ? null : bandEnd(kind, lower),
        available: count(row.available),
        requests: access.requests ? count(row.requests) : null,
      };
    }),
    demand: demand
      ? demand.map((row) => ({
          governorate: row.governorate as string,
          district: row.district as string,
          requests: count(row.requests),
          available: count(row.available),
        }))
      : null,
    unmatched: unmatched
      ? unmatched.slice(0, 500).map((summary) => ({
          id: summary.id,
          code: summary.code,
          person_id: summary.person_id,
          person_name: summary.person_name,
          phone: summary.person_phone,
          property_type: summary.property_type,
          budget_max:
            summary.budget_max === null ? null : String(summary.budget_max),
          governorate: summary.governorate,
          district: summary.district,
          created_at: summary.created_at,
        }))
      : null,
  };
}

// ─── Leases ────────────────────────────────────────────────────────────

/**
 * Leases: those in force and their monthly rent, those ending within
 * `days` days, installments due in the period and how much of them was
 * collected, what is overdue today, renewals of leases that ended in the
 * period, and the brokerage of rent deals.
 */
export async function leasesReport(query: LeasesReportQuery) {
  const { from, to } = reportPeriod(query);
  const today = officeToday();
  const months = sql`(CASE l.frequency ${sql.join(
    Object.entries(FREQUENCY_MONTHS).map(
      ([frequency, value]) => sql`WHEN ${frequency} THEN ${value}::int`,
    ),
    sql` `,
  )} END)`;
  const PAID = sql`coalesce((SELECT sum(v.amount) FROM vouchers v
    WHERE v.lease_installment_id = i.id AND v.status = 'posted'), 0)`;
  // Where a lease stopped: its termination day, else its last day.
  const ENDS = sql`coalesce(l.termination_date, l.end_date)`;
  const OWED = sql`l.office_collects AND l.status <> 'cancelled'
    AND NOT (l.status = 'terminated' AND i.due_date > l.termination_date)`;

  const [inForce, expiring, due, overdue, ended, brokerage] = await Promise.all(
    [
      rawRows(sql`SELECT l.currency,
        count(*) FILTER (WHERE l.start_date <= ${today} AND l.end_date >= ${today})::int AS current,
        count(*) FILTER (WHERE l.start_date > ${today})::int AS upcoming,
        coalesce(sum(round(l.rent_amount / ${months}, 2)) FILTER (WHERE l.start_date <= ${today} AND l.end_date >= ${today}), 0)::numeric(18,2)::text AS monthly_rent
      FROM leases l WHERE l.status = 'active'
      GROUP BY l.currency ORDER BY l.currency`),
      rawRows(sql`SELECT l.id, l.code, l.currency, l.rent_amount::text, l.frequency, l.end_date::text,
        (l.end_date - ${today}::date) AS days_left,
        l.tenant_person_id, t.full_name AS tenant_name, o.full_name AS landlord_name
      FROM leases l
      LEFT JOIN people t ON t.id = l.tenant_person_id
      LEFT JOIN people o ON o.id = l.landlord_person_id
      WHERE l.status = 'active' AND l.end_date BETWEEN ${today}::date AND ${today}::date + ${query.days}::int
      ORDER BY l.end_date, l.id`),
      rawRows(sql`SELECT l.currency, count(*)::int AS installments,
        sum(i.amount)::numeric(18,2)::text AS amount,
        sum(least(${PAID}, i.amount))::numeric(18,2)::text AS paid
      FROM lease_installments i JOIN leases l ON l.id = i.lease_id
      WHERE ${OWED} AND i.due_date BETWEEN ${from} AND ${to}
      GROUP BY l.currency ORDER BY l.currency`),
      rawRows(sql`SELECT l.currency, count(*)::int AS installments,
        sum(i.amount - least(${PAID}, i.amount))::numeric(18,2)::text AS left,
        max(${today}::date - i.due_date)::int AS oldest_days
      FROM lease_installments i JOIN leases l ON l.id = i.lease_id
      WHERE ${OWED} AND i.due_date < ${today} AND ${PAID} < i.amount
      GROUP BY l.currency ORDER BY l.currency`),
      rawRows(sql`SELECT count(*)::int AS ended,
        count(*) FILTER (WHERE l.status = 'renewed')::int AS renewed,
        count(*) FILTER (WHERE l.status = 'terminated')::int AS terminated
      FROM leases l
      WHERE l.status <> 'cancelled' AND ${ENDS} BETWEEN ${from} AND ${to}`),
      rawRows(sql`SELECT
        (SELECT count(*)::int FROM leases l WHERE l.status <> 'cancelled'
          AND ${DAY(sql`l.created_at`)} BETWEEN ${from} AND ${to} AND l.renewed_from_id IS NULL) AS activated,
        (SELECT count(*)::int FROM leases l WHERE l.status <> 'cancelled'
          AND ${DAY(sql`l.created_at`)} BETWEEN ${from} AND ${to} AND l.renewed_from_id IS NOT NULL) AS renewals,
        (SELECT count(*)::int FROM deals d WHERE d.deal_type = 'rent' AND d.stage = 'won'
          AND ${DAY(sql`d.closed_at`)} BETWEEN ${from} AND ${to}) AS rent_deals_won,
        (SELECT coalesce(json_agg(json_build_object('currency', x.currency, 'commissions', x.n, 'amount', x.amount) ORDER BY x.currency), '[]'::json)
          FROM (SELECT c.currency, count(*)::int AS n, sum(c.amount)::numeric(18,2)::text AS amount
            FROM commissions c JOIN deals d ON d.id = c.deal_id AND d.deal_type = 'rent'
            WHERE c.status = 'active' AND c.commission_date BETWEEN ${from} AND ${to}
            GROUP BY c.currency) x) AS commissions`),
    ],
  );

  const endedRow = ended[0] ?? {};
  const b = brokerage[0] ?? {};
  const currencies = (list: RawRow[]) =>
    CURRENCIES.filter((currency) =>
      list.some((row) => row.currency === currency),
    );
  return {
    from,
    to,
    days: query.days,
    in_force: currencies(inForce).map((currency) => {
      const row = inForce.find((item) => item.currency === currency)!;
      return {
        currency,
        current: count(row.current),
        upcoming: count(row.upcoming),
        monthly_rent: money(row.monthly_rent),
      };
    }),
    expiring: expiring.map((row) => ({
      id: Number(row.id),
      code: row.code as string,
      currency: row.currency as Currency,
      rent_amount: row.rent_amount as string,
      frequency: row.frequency as string,
      end_date: row.end_date as string,
      days_left: count(row.days_left),
      tenant_person_id: id(row.tenant_person_id),
      tenant_name: text(row.tenant_name),
      landlord_name: text(row.landlord_name),
    })),
    due: currencies(due).map((currency) => {
      const row = due.find((item) => item.currency === currency)!;
      const amount = money(row.amount);
      const paid = money(row.paid);
      return {
        currency,
        installments: count(row.installments),
        amount,
        paid,
        // An exact share of two amounts, as a percentage to one decimal.
        collection_rate: amountRate(paid, amount),
      };
    }),
    overdue: currencies(overdue).map((currency) => {
      const row = overdue.find((item) => item.currency === currency)!;
      return {
        currency,
        installments: count(row.installments),
        left: money(row.left),
        oldest_days: count(row.oldest_days),
      };
    }),
    ended: {
      ended: count(endedRow.ended),
      renewed: count(endedRow.renewed),
      terminated: count(endedRow.terminated),
      renewal_rate: rate(count(endedRow.renewed), count(endedRow.ended)),
    },
    brokerage: {
      activated: count(b.activated),
      renewals: count(b.renewals),
      rent_deals_won: count(b.rent_deals_won),
      commissions: (
        (b.commissions as Array<{
          currency: Currency;
          commissions: number;
          amount: string;
        }>) ?? []
      ).map((item) => ({
        currency: item.currency,
        commissions: count(item.commissions),
        amount: item.amount,
      })),
    },
  };
}

/** paid ÷ amount as a percentage to one decimal, from exact hundredths. */
function amountRate(part: string, whole: string) {
  const total = toMinor(whole);
  if (total <= 0n) return null;
  // Tenths of a percent, rounded half up.
  const tenths = (toMinor(part) * 2000n + total) / (2n * total);
  return Number(tenths) / 10;
}
