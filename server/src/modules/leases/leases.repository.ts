import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  agreements,
  leaseInstallments,
  leases,
  people,
  rentals,
  users,
} from "../../infrastructure/database/schema.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import type { LeaseState } from "./leases.rules.js";
import type { LeasePageQuery } from "./leases.schema.js";

const landlord = alias(people, "landlord");
const tenant = alias(people, "tenant");
const creator = alias(users, "creator");

/** The office's today (Baghdad), as a date. */
export const OFFICE_DATE = sql`(now() at time zone 'Asia/Baghdad')::date`;

/** Where a lease stands today; leaseState() in leases.rules.ts, in SQL. */
const stateOf = sql<LeaseState>`CASE
  WHEN ${leases.status} = 'cancelled' THEN 'cancelled'
  WHEN ${leases.startDate} > ${OFFICE_DATE} THEN 'upcoming'
  WHEN ${leases.endDate} < ${OFFICE_DATE} THEN 'ended'
  ELSE 'current' END`;

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
      >`(SELECT min(i.due_date)::text FROM lease_installments i WHERE i.lease_id = ${leases.id} AND i.due_date >= ${OFFICE_DATE})`,
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

/** A lease with its schedule; an installment is due once its day comes. */
export async function getLease(id: number) {
  const [lease] = await selectLeases().where(eq(leases.id, id));
  if (!lease) return null;
  const installments = await db
    .select({
      id: leaseInstallments.id,
      seq: leaseInstallments.seq,
      due_date: leaseInstallments.dueDate,
      period_start: leaseInstallments.periodStart,
      period_end: leaseInstallments.periodEnd,
      amount: leaseInstallments.amount,
      state: sql<
        "upcoming" | "due"
      >`CASE WHEN ${leaseInstallments.dueDate} > ${OFFICE_DATE} THEN 'upcoming' ELSE 'due' END`,
    })
    .from(leaseInstallments)
    .where(eq(leaseInstallments.leaseId, id))
    .orderBy(leaseInstallments.seq);
  return { ...lease, installments };
}
