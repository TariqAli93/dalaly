import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  commissionSplits,
  commissions,
  deals,
  journalEntries,
  people,
  users,
  vouchers,
} from "../../infrastructure/database/schema.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import type { CommissionPageQuery } from "./commissions.schema.js";

const entry = alias(journalEntries, "entry");
const cancelEntry = alias(journalEntries, "cancel_entry");
const creator = alias(users, "creator");

/** Collected on a commission: its posted, not voided, allocated receipts. */
const collected = sql<string>`(
  SELECT coalesce(sum(v.amount), 0) FROM vouchers v
  WHERE v.commission_id = ${commissions.id} AND v.status = 'posted'
)`;
/** Employees' shares of a commission, together. */
const shares = sql<string>`(
  SELECT coalesce(sum(s.amount), 0) FROM commission_splits s
  WHERE s.commission_id = ${commissions.id}
)`;

function selectCommissions() {
  return db
    .select({
      id: commissions.id,
      code: commissions.code,
      deal_id: commissions.dealId,
      deal_code: deals.code,
      payer_role: commissions.payerRole,
      payer_person_id: commissions.payerPersonId,
      payer_name: people.fullName,
      currency: commissions.currency,
      basis: commissions.basis,
      rate: commissions.rate,
      base_amount: commissions.baseAmount,
      amount: commissions.amount,
      collected: sql<string>`${collected}::numeric(18,2)::text`,
      outstanding: sql<string>`(${commissions.amount} - ${collected})::numeric(18,2)::text`,
      shares_total: sql<string>`${shares}::numeric(18,2)::text`,
      office_share: sql<string>`(${commissions.amount} - ${shares})::numeric(18,2)::text`,
      commission_date: commissions.commissionDate,
      description: commissions.description,
      status: commissions.status,
      journal_entry_id: commissions.journalEntryId,
      journal_entry_code: entry.code,
      cancel_entry_id: commissions.cancelEntryId,
      cancel_entry_code: cancelEntry.code,
      cancel_reason: commissions.cancelReason,
      cancelled_at: commissions.cancelledAt,
      created_by_name: creator.displayName,
      created_at: commissions.createdAt,
    })
    .from(commissions)
    .innerJoin(entry, eq(commissions.journalEntryId, entry.id))
    .leftJoin(cancelEntry, eq(commissions.cancelEntryId, cancelEntry.id))
    .leftJoin(deals, eq(commissions.dealId, deals.id))
    .leftJoin(people, eq(commissions.payerPersonId, people.id))
    .leftJoin(creator, eq(commissions.createdBy, creator.id));
}

function conditions(query: CommissionPageQuery): SQL | undefined {
  const where: SQL[] = [];
  if (query.deal_id) where.push(eq(commissions.dealId, query.deal_id));
  if (query.person_id)
    where.push(eq(commissions.payerPersonId, query.person_id));
  if (query.currency) where.push(eq(commissions.currency, query.currency));
  if (query.user_id)
    where.push(
      sql`exists (select 1 from ${commissionSplits} where ${commissionSplits.commissionId} = ${commissions.id} and ${commissionSplits.userId} = ${query.user_id})`,
    );
  if (query.state === "cancelled")
    where.push(eq(commissions.status, "cancelled"));
  else if (query.state === "open")
    where.push(
      and(
        eq(commissions.status, "active"),
        sql`${commissions.amount} > ${collected}`,
      )!,
    );
  else if (query.state === "settled")
    where.push(
      and(
        eq(commissions.status, "active"),
        sql`${commissions.amount} <= ${collected}`,
      )!,
    );
  if (query.q) {
    const pattern = containsPattern(query.q);
    where.push(
      or(
        ilike(commissions.code, pattern),
        ilike(deals.code, pattern),
        ilike(people.fullName, pattern),
      )!,
    );
  }
  return where.length ? and(...where) : undefined;
}

const SORT_COLUMNS = {
  commission_date: commissions.commissionDate,
  code: commissions.code,
  amount: commissions.amount,
  created_at: commissions.createdAt,
} as const;

export async function listCommissionsPage(query: CommissionPageQuery) {
  const where = conditions(query);
  const order = query.sort_order === "asc" ? asc : desc;
  const items = await selectCommissions()
    .where(where)
    .orderBy(order(SORT_COLUMNS[query.sort_by]), order(commissions.id))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(commissions)
    .leftJoin(deals, eq(commissions.dealId, deals.id))
    .leftJoin(people, eq(commissions.payerPersonId, people.id))
    .where(where);
  return { items, total, page: query.page, page_size: query.page_size };
}

/** A share with what was paid on it and what is left. */
function selectSplits() {
  const paid = sql`(
    SELECT coalesce(sum(v.amount), 0) FROM vouchers v
    WHERE v.commission_split_id = ${commissionSplits.id} AND v.status = 'posted'
  )`;
  return db
    .select({
      id: commissionSplits.id,
      commission_id: commissionSplits.commissionId,
      commission_code: commissions.code,
      commission_status: commissions.status,
      deal_code: deals.code,
      currency: commissions.currency,
      user_id: commissionSplits.userId,
      user_name: users.displayName,
      basis: commissionSplits.basis,
      rate: commissionSplits.rate,
      amount: commissionSplits.amount,
      paid: sql<string>`${paid}::numeric(18,2)::text`,
      outstanding: sql<string>`(${commissionSplits.amount} - ${paid})::numeric(18,2)::text`,
    })
    .from(commissionSplits)
    .innerJoin(commissions, eq(commissionSplits.commissionId, commissions.id))
    .innerJoin(users, eq(commissionSplits.userId, users.id))
    .leftJoin(deals, eq(commissions.dealId, deals.id));
}

export async function getCommission(id: number) {
  const [row] = await selectCommissions().where(eq(commissions.id, id));
  if (!row) return null;
  const [splits, allocated] = await Promise.all([
    selectSplits()
      .where(eq(commissionSplits.commissionId, id))
      .orderBy(commissionSplits.id),
    db
      .select({
        id: vouchers.id,
        code: vouchers.code,
        kind: vouchers.kind,
        voucher_date: vouchers.voucherDate,
        amount: vouchers.amount,
        party_name: vouchers.partyName,
        status: vouchers.status,
        commission_split_id: vouchers.commissionSplitId,
      })
      .from(vouchers)
      .leftJoin(
        commissionSplits,
        eq(vouchers.commissionSplitId, commissionSplits.id),
      )
      .where(
        or(
          eq(vouchers.commissionId, id),
          eq(commissionSplits.commissionId, id),
        ),
      )
      .orderBy(vouchers.voucherDate, vouchers.id),
  ]);
  return { ...row, splits, vouchers: allocated };
}

/** Employees' shares not yet paid in full, of live commissions. */
export async function listPayableSplits(userId?: number | null) {
  return selectSplits()
    .where(
      and(
        eq(commissions.status, "active"),
        userId ? eq(commissionSplits.userId, userId) : undefined,
        sql`${commissionSplits.amount} > (
          SELECT coalesce(sum(v.amount), 0) FROM vouchers v
          WHERE v.commission_split_id = ${commissionSplits.id} AND v.status = 'posted'
        )`,
      ),
    )
    .orderBy(
      users.displayName,
      commissions.commissionDate,
      commissionSplits.id,
    );
}
