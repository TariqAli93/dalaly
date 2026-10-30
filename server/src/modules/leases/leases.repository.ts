import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import { rawRows } from "../../infrastructure/database/raw-query.js";
import {
  agreements,
  leases,
  people,
  rentals,
  users,
} from "../../infrastructure/database/schema.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import {
  installmentLeft,
  installmentState,
  type LeaseState,
} from "./leases.rules.js";
import type { LeasePageQuery, OverduePageQuery } from "./leases.schema.js";

const landlord = alias(people, "landlord");
const tenant = alias(people, "tenant");
const creator = alias(users, "creator");
const previous = alias(leases, "previous");

/** The office's today (Baghdad), as a date. */
export const OFFICE_DATE = sql`(now() at time zone 'Asia/Baghdad')::date`;

/** Where a lease stands today; leaseState() in leases.rules.ts, in SQL. */
const stateOf = sql<LeaseState>`CASE
  WHEN ${leases.status} IN ('cancelled', 'terminated', 'renewed') THEN ${leases.status}
  WHEN ${leases.startDate} > ${OFFICE_DATE} THEN 'upcoming'
  WHEN ${leases.endDate} < ${OFFICE_DATE} THEN 'ended'
  ELSE 'current' END`;

/** Posted receipts collecting installment `i`. */
const PAID = sql.raw(
  "(SELECT coalesce(sum(v.amount), 0) FROM vouchers v WHERE v.lease_installment_id = i.id AND v.status = 'posted')",
);
/** Installment `i` of the outer lease falls after its termination date. */
const RELEASED = sql`(${leases.status} = 'terminated' AND i.due_date > ${leases.terminationDate})`;
/** Client funds held on the outer lease for one of its sides. */
const heldFor = (side: SQL) =>
  sql<string>`(SELECT coalesce(sum(CASE WHEN v.kind = 'receipt' THEN v.amount ELSE -v.amount END), 0)::numeric(18,2)::text
    FROM vouchers v WHERE v.lease_id = ${leases.id} AND v.status = 'posted' AND v.held_for_person_id = ${side})`;

function selectLeases() {
  return db
    .select({
      id: leases.id,
      code: leases.code,
      agreement_id: leases.agreementId,
      agreement_code: agreements.code,
      agreement_revision: leases.agreementRevision,
      rental_id: leases.rentalId,
      rental_code: rentals.code,
      rental_name: rentals.name,
      landlord_person_id: leases.landlordPersonId,
      landlord_name: landlord.fullName,
      tenant_person_id: leases.tenantPersonId,
      tenant_name: tenant.fullName,
      currency: leases.currency,
      rent_amount: leases.rentAmount,
      frequency: leases.frequency,
      start_date: leases.startDate,
      end_date: leases.endDate,
      deposit: leases.deposit,
      office_collects: leases.officeCollects,
      status: leases.status,
      state: stateOf,
      installment_count: sql<number>`(SELECT count(*)::int FROM lease_installments i WHERE i.lease_id = ${leases.id})`,
      total_rent: sql<string>`(SELECT coalesce(sum(i.amount), 0)::numeric(18,2)::text FROM lease_installments i WHERE i.lease_id = ${leases.id})`,
      next_due_date: sql<
        string | null
      >`(SELECT min(i.due_date)::text FROM lease_installments i WHERE i.lease_id = ${leases.id} AND i.due_date >= ${OFFICE_DATE} AND NOT ${RELEASED})`,
      // The rent so far: installments whose day has come, less what was paid.
      due_to_date: sql<string>`(SELECT coalesce(sum(i.amount), 0)::numeric(18,2)::text FROM lease_installments i
        WHERE i.lease_id = ${leases.id} AND i.due_date <= ${OFFICE_DATE} AND NOT ${RELEASED})`,
      collected: sql<string>`(SELECT coalesce(sum(v.amount), 0)::numeric(18,2)::text FROM vouchers v
        JOIN lease_installments i ON i.id = v.lease_installment_id
        WHERE i.lease_id = ${leases.id} AND v.status = 'posted')`,
      outstanding: sql<string>`(SELECT coalesce(sum(greatest(i.amount - ${PAID}, 0)), 0)::numeric(18,2)::text FROM lease_installments i
        WHERE i.lease_id = ${leases.id} AND i.due_date <= ${OFFICE_DATE} AND NOT ${RELEASED})`,
      overdue_count: sql<number>`(CASE WHEN ${leases.officeCollects} THEN (SELECT count(*)::int FROM lease_installments i
        WHERE i.lease_id = ${leases.id} AND i.due_date < ${OFFICE_DATE} AND NOT ${RELEASED} AND ${PAID} < i.amount) ELSE 0 END)`,
      held_for_landlord: heldFor(sql`${leases.landlordPersonId}`),
      deposit_held: heldFor(sql`${leases.tenantPersonId}`),
      termination_date: leases.terminationDate,
      termination_reason: leases.terminationReason,
      terminated_at: leases.terminatedAt,
      renewed_from_id: leases.renewedFromId,
      renewed_from_code: previous.code,
      renewed_by_id: sql<
        number | null
      >`(SELECT r.id::int FROM leases r WHERE r.renewed_from_id = ${leases.id} AND r.status <> 'cancelled' LIMIT 1)`,
      renewed_by_code: sql<
        string | null
      >`(SELECT r.code FROM leases r WHERE r.renewed_from_id = ${leases.id} AND r.status <> 'cancelled' LIMIT 1)`,
      notes: leases.notes,
      cancel_reason: leases.cancelReason,
      cancelled_at: leases.cancelledAt,
      created_by_name: creator.displayName,
      created_at: leases.createdAt,
    })
    .from(leases)
    .leftJoin(agreements, eq(leases.agreementId, agreements.id))
    .leftJoin(rentals, eq(leases.rentalId, rentals.id))
    .leftJoin(landlord, eq(leases.landlordPersonId, landlord.id))
    .leftJoin(tenant, eq(leases.tenantPersonId, tenant.id))
    .leftJoin(previous, eq(leases.renewedFromId, previous.id))
    .leftJoin(creator, eq(leases.createdBy, creator.id));
}

function conditions(query: LeasePageQuery): SQL | undefined {
  const where: SQL[] = [];
  if (query.state) where.push(sql`${stateOf} = ${query.state}`);
  if (query.person_id)
    where.push(
      or(
        eq(leases.landlordPersonId, query.person_id),
        eq(leases.tenantPersonId, query.person_id),
      )!,
    );
  if (query.rental_id) where.push(eq(leases.rentalId, query.rental_id));
  if (query.q) {
    const pattern = containsPattern(query.q);
    where.push(
      or(
        ilike(leases.code, pattern),
        ilike(landlord.fullName, pattern),
        ilike(tenant.fullName, pattern),
        ilike(rentals.code, pattern),
        ilike(rentals.name, pattern),
      )!,
    );
  }
  return where.length ? and(...where) : undefined;
}

const SORT_COLUMNS = {
  start_date: leases.startDate,
  end_date: leases.endDate,
  code: leases.code,
  created_at: leases.createdAt,
} as const;

export async function listLeasesPage(query: LeasePageQuery) {
  const where = conditions(query);
  const order = query.sort_order === "asc" ? asc : desc;
  const items = await selectLeases()
    .where(where)
    .orderBy(order(SORT_COLUMNS[query.sort_by]), order(leases.id))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leases)
    .leftJoin(rentals, eq(leases.rentalId, rentals.id))
    .leftJoin(landlord, eq(leases.landlordPersonId, landlord.id))
    .leftJoin(tenant, eq(leases.tenantPersonId, tenant.id))
    .where(where);
  return { items, total, page: query.page, page_size: query.page_size };
}

/**
 * A lease with its schedule, each installment with what was paid on it and
 * where it stands, and the leases it renews or was renewed by.
 */
export async function getLease(id: number) {
  const [lease] = await selectLeases().where(eq(leases.id, id));
  if (!lease) return null;
  // Raw, so the paid subquery names its own installment (`i`): a one-table
  // select would leave the outer column unqualified.
  const [rows, [today], chain] = await Promise.all([
    rawRows(sql`
      SELECT i.id, i.seq, i.due_date::text, i.period_start::text, i.period_end::text, i.amount::text,
        ${PAID}::numeric(18,2)::text AS paid
      FROM lease_installments i WHERE i.lease_id = ${id} ORDER BY i.seq`),
    rawRows(sql`SELECT ${OFFICE_DATE}::text AS today`),
    leaseChain(id),
  ]);
  const installments = rows
    .map((raw) => ({
      id: Number(raw.id),
      seq: Number(raw.seq),
      due_date: raw.due_date as string,
      period_start: raw.period_start as string,
      period_end: raw.period_end as string,
      amount: raw.amount as string,
      paid: raw.paid as string,
    }))
    .map((row) => ({
      ...row,
      left: installmentLeft(row.amount, row.paid),
      state: installmentState(
        {
          dueDate: row.due_date,
          amount: row.amount,
          paid: row.paid,
          officeCollects: lease.office_collects,
          terminationDate: lease.termination_date,
        },
        today!.today as string,
      ),
    }));
  return { ...lease, installments, chain };
}

/** Every lease of a renewal chain, oldest first: its history. */
async function leaseChain(id: number) {
  const rows = await rawRows(sql`
    WITH RECURSIVE back AS (
      SELECT id, renewed_from_id FROM leases WHERE id = ${id}
      UNION ALL
      SELECT l.id, l.renewed_from_id FROM leases l JOIN back ON l.id = back.renewed_from_id
    ), root AS (
      SELECT id FROM back WHERE renewed_from_id IS NULL
    ), forward AS (
      SELECT l.id FROM leases l JOIN root ON l.id = root.id
      UNION ALL
      SELECT l.id FROM leases l JOIN forward f ON l.renewed_from_id = f.id
    )
    SELECT l.id, l.code, l.start_date::text, l.end_date::text, l.rent_amount::text, l.currency, l.frequency, l.status
    FROM leases l JOIN forward f ON f.id = l.id
    ORDER BY l.start_date, l.id`);
  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code as string,
    start_date: row.start_date as string,
    end_date: row.end_date as string,
    rent_amount: row.rent_amount as string,
    currency: row.currency as string,
    frequency: row.frequency as string,
    status: row.status as string,
  }));
}

/**
 * Installments past their day and not fully paid, where the office collects
 * the rent: oldest first, with their lease and what is left.
 */
export async function listOverdueInstallments(query: OverduePageQuery) {
  const filters: SQL[] = [
    sql`l.office_collects`,
    sql`l.status IN ('active', 'terminated', 'renewed')`,
    sql`i.due_date < ${OFFICE_DATE}`,
    sql`NOT (l.status = 'terminated' AND i.due_date > l.termination_date)`,
    sql`${PAID} < i.amount`,
  ];
  if (query.person_id)
    filters.push(
      sql`(l.tenant_person_id = ${query.person_id} OR l.landlord_person_id = ${query.person_id})`,
    );
  if (query.lease_id) filters.push(sql`l.id = ${query.lease_id}`);
  const where = sql.join(filters, sql` AND `);
  const items = await rawRows(sql`
    SELECT i.id, i.seq, i.due_date::text, i.amount::text,
      ${PAID}::numeric(18,2)::text AS paid,
      greatest(i.amount - ${PAID}, 0)::numeric(18,2)::text AS left,
      (${OFFICE_DATE} - i.due_date)::int AS days_overdue,
      l.id AS lease_id, l.code AS lease_code, l.currency,
      l.tenant_person_id, t.full_name AS tenant_name, t.phone_primary AS tenant_phone,
      l.landlord_person_id, o.full_name AS landlord_name
    FROM lease_installments i
    JOIN leases l ON l.id = i.lease_id
    LEFT JOIN people t ON t.id = l.tenant_person_id
    LEFT JOIN people o ON o.id = l.landlord_person_id
    WHERE ${where}
    ORDER BY i.due_date, i.id
    LIMIT ${query.page_size} OFFSET ${pageOffset(query.page, query.page_size)}`);
  const [{ total }] = await rawRows(sql`
    SELECT count(*)::int AS total FROM lease_installments i JOIN leases l ON l.id = i.lease_id WHERE ${where}`);
  return {
    items: items.map((row) => ({
      id: Number(row.id),
      seq: Number(row.seq),
      due_date: row.due_date as string,
      amount: row.amount as string,
      paid: row.paid as string,
      left: row.left as string,
      days_overdue: Number(row.days_overdue),
      lease_id: Number(row.lease_id),
      lease_code: row.lease_code as string,
      currency: row.currency as string,
      tenant_person_id:
        row.tenant_person_id === null ? null : Number(row.tenant_person_id),
      tenant_name: (row.tenant_name as string | null) ?? null,
      tenant_phone: (row.tenant_phone as string | null) ?? null,
      landlord_person_id:
        row.landlord_person_id === null ? null : Number(row.landlord_person_id),
      landlord_name: (row.landlord_name as string | null) ?? null,
    })),
    total: Number(total),
    page: query.page,
    page_size: query.page_size,
  };
}
