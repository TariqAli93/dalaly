import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../infrastructure/database/db.js";
import {
  accounts,
  cashTransfers,
  journalEntries,
  users,
} from "../../infrastructure/database/schema.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import type { TransferPageQuery } from "./cash.schema.js";

const fromAccount = alias(accounts, "from_account");
const toAccount = alias(accounts, "to_account");
const entry = alias(journalEntries, "entry");
const voidEntry = alias(journalEntries, "void_entry");
const creator = alias(users, "creator");
const voider = alias(users, "voider");

function selectTransfers() {
  return db
    .select({
      id: cashTransfers.id,
      code: cashTransfers.code,
      transfer_date: cashTransfers.transferDate,
      currency: cashTransfers.currency,
      amount: cashTransfers.amount,
      from_account_id: cashTransfers.fromAccountId,
      from_account_code: fromAccount.code,
      from_account_name: fromAccount.name,
      to_account_id: cashTransfers.toAccountId,
      to_account_code: toAccount.code,
      to_account_name: toAccount.name,
      description: cashTransfers.description,
      reference: cashTransfers.reference,
      status: cashTransfers.status,
      journal_entry_id: cashTransfers.journalEntryId,
      journal_entry_code: entry.code,
      void_entry_id: cashTransfers.voidEntryId,
      void_entry_code: voidEntry.code,
      void_reason: cashTransfers.voidReason,
      voided_at: cashTransfers.voidedAt,
      voided_by_name: voider.displayName,
      created_by_name: creator.displayName,
      created_at: cashTransfers.createdAt,
    })
    .from(cashTransfers)
    .innerJoin(fromAccount, eq(cashTransfers.fromAccountId, fromAccount.id))
    .innerJoin(toAccount, eq(cashTransfers.toAccountId, toAccount.id))
    .innerJoin(entry, eq(cashTransfers.journalEntryId, entry.id))
    .leftJoin(voidEntry, eq(cashTransfers.voidEntryId, voidEntry.id))
    .leftJoin(creator, eq(cashTransfers.createdBy, creator.id))
    .leftJoin(voider, eq(cashTransfers.voidedBy, voider.id));
}

function conditions(query: TransferPageQuery): SQL | undefined {
  const where: SQL[] = [];
  if (query.currency) where.push(eq(cashTransfers.currency, query.currency));
  if (query.status) where.push(eq(cashTransfers.status, query.status));
  if (query.account_id)
    where.push(
      or(
        eq(cashTransfers.fromAccountId, query.account_id),
        eq(cashTransfers.toAccountId, query.account_id),
      )!,
    );
  if (query.from) where.push(gte(cashTransfers.transferDate, query.from));
  if (query.to) where.push(lte(cashTransfers.transferDate, query.to));
  if (query.q) {
    const pattern = containsPattern(query.q);
    where.push(
      or(
        ilike(cashTransfers.code, pattern),
        ilike(cashTransfers.description, pattern),
        ilike(cashTransfers.reference, pattern),
      )!,
    );
  }
  return where.length ? and(...where) : undefined;
}

const SORT_COLUMNS = {
  transfer_date: cashTransfers.transferDate,
  code: cashTransfers.code,
  amount: cashTransfers.amount,
  created_at: cashTransfers.createdAt,
} as const;

export async function listTransfersPage(query: TransferPageQuery) {
  const where = conditions(query);
  const order = query.sort_order === "asc" ? asc : desc;
  const items = await selectTransfers()
    .where(where)
    .orderBy(order(SORT_COLUMNS[query.sort_by]), order(cashTransfers.id))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cashTransfers)
    .where(where);
  return { items, total, page: query.page, page_size: query.page_size };
}

export async function getTransfer(id: number) {
  const [row] = await selectTransfers().where(eq(cashTransfers.id, id));
  return row ?? null;
}
