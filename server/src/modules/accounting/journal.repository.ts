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
  accountingPeriods,
  accounts,
  deals,
  journalEntries,
  journalLines,
  people,
  users,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { fromMinor, toMinor, type Currency } from "../../shared/money.js";
import { pageOffset } from "../../shared/utils/paging.js";
import { containsPattern } from "../../shared/utils/search.js";
import { recordAudit, type AuditAction } from "../audit/audit.service.js";
import { normalSide, type AccountType } from "./accounting.rules.js";
import {
  closePeriod,
  deleteDraft,
  postDraft,
  replaceDraft,
  reverseEntry,
  writeEntry,
  type LedgerEntry,
} from "./ledger.service.js";
import type {
  JournalEntryPayload,
  JournalPageQuery,
} from "./journal.schema.js";

const creator = alias(users, "creator");
const poster = alias(users, "poster");
const reversalOf = alias(journalEntries, "reversal_of");
const reversedBy = alias(journalEntries, "reversed_by");

/** An entry's total: its debits (equal to its credits once posted). */
const entryTotal = sql<string>`(
  SELECT coalesce(sum(${journalLines.debit}), 0)::numeric(18,2)::text
  FROM ${journalLines} WHERE ${journalLines.entryId} = ${journalEntries.id}
)`;

function selectEntries() {
  return db
    .select({
      id: journalEntries.id,
      code: journalEntries.code,
      entry_date: journalEntries.entryDate,
      description: journalEntries.description,
      currency: journalEntries.currency,
      status: journalEntries.status,
      source_type: journalEntries.sourceType,
      source_id: journalEntries.sourceId,
      total: entryTotal,
      reversal_of_id: journalEntries.reversalOfId,
      reversal_of_code: reversalOf.code,
      reversed_by_id: reversedBy.id,
      reversed_by_code: reversedBy.code,
      posted_at: journalEntries.postedAt,
      posted_by_name: poster.displayName,
      created_by_name: creator.displayName,
      created_at: journalEntries.createdAt,
      updated_at: journalEntries.updatedAt,
    })
    .from(journalEntries)
    .leftJoin(reversalOf, eq(journalEntries.reversalOfId, reversalOf.id))
    .leftJoin(reversedBy, eq(reversedBy.reversalOfId, journalEntries.id))
    .leftJoin(poster, eq(journalEntries.postedBy, poster.id))
    .leftJoin(creator, eq(journalEntries.createdBy, creator.id));
}

function conditions(query: JournalPageQuery): SQL | undefined {
  const where: SQL[] = [];
  if (query.currency) where.push(eq(journalEntries.currency, query.currency));
  if (query.status) where.push(eq(journalEntries.status, query.status));
  if (query.source_type)
    where.push(eq(journalEntries.sourceType, query.source_type));
  if (query.from) where.push(gte(journalEntries.entryDate, query.from));
  if (query.to) where.push(lte(journalEntries.entryDate, query.to));
  if (query.account_id)
    where.push(
      sql`exists (select 1 from ${journalLines} where ${journalLines.entryId} = ${journalEntries.id} and ${journalLines.accountId} = ${query.account_id})`,
    );
  if (query.q) {
    const pattern = containsPattern(query.q);
    where.push(
      or(
        ilike(journalEntries.code, pattern),
        ilike(journalEntries.description, pattern),
      )!,
    );
  }
  return where.length ? and(...where) : undefined;
}

const SORT_COLUMNS = {
  entry_date: journalEntries.entryDate,
  code: journalEntries.code,
  created_at: journalEntries.createdAt,
} as const;

export async function listJournalPage(query: JournalPageQuery) {
  const where = conditions(query);
  const order = query.sort_order === "asc" ? asc : desc;
  const items = await selectEntries()
    .where(where)
    .orderBy(order(SORT_COLUMNS[query.sort_by]), order(journalEntries.id))
    .limit(query.page_size)
    .offset(pageOffset(query.page, query.page_size));
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(where);
  return { items, total, page: query.page, page_size: query.page_size };
}

export async function getJournalEntry(id: number) {
  const [entry] = await selectEntries().where(eq(journalEntries.id, id));
  if (!entry) return null;
  const lines = await db
    .select({
      id: journalLines.id,
      line_no: journalLines.lineNo,
      account_id: journalLines.accountId,
      account_code: accounts.code,
      account_name: accounts.name,
      debit: journalLines.debit,
      credit: journalLines.credit,
      person_id: journalLines.personId,
      person_name: people.fullName,
      deal_id: journalLines.dealId,
      deal_code: deals.code,
      memo: journalLines.memo,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .leftJoin(people, eq(journalLines.personId, people.id))
    .leftJoin(deals, eq(journalLines.dealId, deals.id))
    .where(eq(journalLines.entryId, id))
    .orderBy(journalLines.lineNo);
  return { ...entry, lines };
}

function ledgerEntry(payload: JournalEntryPayload): LedgerEntry {
  return {
    entryDate: payload.entry_date,
    currency: payload.currency,
    description: payload.description,
    sourceType: "manual",
    lines: payload.lines.map((line) => ({
      accountId: line.account_id,
      debit: line.debit,
      credit: line.credit,
      personId: line.person_id ?? null,
      dealId: line.deal_id ?? null,
      memo: line.memo,
    })),
  };
}

async function audit(
  id: number,
  action: AuditAction,
  userId: number | undefined,
  newValue?: Record<string, unknown>,
) {
  const entry = await getJournalEntry(id);
  await recordAudit({
    entityType: "journal_entry",
    entityId: id,
    action,
    newValue: {
      code: entry?.code,
      status: entry?.status,
      total: entry?.total,
      currency: entry?.currency,
      ...newValue,
    },
    userId,
  });
  return entry;
}

export async function createManualEntry(
  payload: JournalEntryPayload,
  userId?: number,
) {
  const id = await db.transaction((tx) =>
    writeEntry(tx, ledgerEntry(payload), { post: payload.post, userId }),
  );
  return audit(id, payload.post ? "posted" : "created", userId);
}

export async function updateManualEntry(
  id: number,
  payload: JournalEntryPayload,
  userId?: number,
) {
  const done = await db.transaction((tx) =>
    replaceDraft(tx, id, ledgerEntry(payload), { post: payload.post, userId }),
  );
  if (!done) return null;
  return audit(id, payload.post ? "posted" : "updated", userId);
}

export async function postEntry(id: number, userId?: number) {
  const done = await db.transaction((tx) => postDraft(tx, id, userId));
  if (!done) return null;
  return audit(id, "posted", userId);
}

export async function deleteEntry(id: number, userId?: number) {
  const row = await db.transaction((tx) => deleteDraft(tx, id));
  if (!row) return null;
  await recordAudit({
    entityType: "journal_entry",
    entityId: id,
    action: "deleted",
    oldValue: { code: row.code, description: row.description },
    userId,
  });
  return { id };
}

export async function reverseJournalEntry(
  id: number,
  input: { entry_date?: string; reason: string },
  userId?: number,
) {
  const reversalId = await db.transaction(async (tx) => {
    // An entry a document posted (a receipt, a payment) is undone by voiding
    // the document, which keeps the two in step.
    const [source] = await tx
      .select({
        code: journalEntries.code,
        sourceType: journalEntries.sourceType,
      })
      .from(journalEntries)
      .where(eq(journalEntries.id, id));
    if (source && !["manual", "reversal"].includes(source.sourceType))
      throw new DomainError(
        409,
        `القيد ${source.code} قيد مستند؛ يُلغى المستند نفسه فيُعكس قيده.`,
        "ENTRY_FROM_DOCUMENT",
      );
    return reverseEntry(
      tx,
      id,
      { entryDate: input.entry_date, reason: input.reason },
      userId,
    );
  });
  if (!reversalId) return null;
  return audit(reversalId, "posted", userId, {
    reversal_of_id: id,
    reason: input.reason,
  });
}

/**
 * An account's posted lines in a date range, with the balance before it and
 * a running balance on the account's normal side (debit for assets and
 * expenses, credit for the rest). Exact: summed in SQL numeric.
 */
export async function accountStatement(
  accountId: number,
  range: { from?: string; to?: string },
) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId));
  if (!account) return null;
  const sign =
    normalSide(account.accountType as AccountType) === "debit" ? 1 : -1;
  const LIMIT = 2000;
  const posted = and(
    eq(journalLines.accountId, accountId),
    eq(journalEntries.status, "posted"),
  );
  const [opening] = await db
    .select({
      debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)::numeric(18,2)::text`,
      credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)::numeric(18,2)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      range.from
        ? and(posted, sql`${journalEntries.entryDate} < ${range.from}`)
        : sql`false`,
    );
  const openingBalance = fromMinor(
    (toMinor(opening.debit) - toMinor(opening.credit)) * BigInt(sign),
  );
  const lines = await db
    .select({
      entry_id: journalEntries.id,
      code: journalEntries.code,
      entry_date: journalEntries.entryDate,
      description: journalEntries.description,
      memo: journalLines.memo,
      debit: journalLines.debit,
      credit: journalLines.credit,
      balance: sql<string>`(${openingBalance}::numeric + sum((${journalLines.debit} - ${journalLines.credit}) * ${sign}) over (order by ${journalEntries.entryDate}, ${journalEntries.id}, ${journalLines.lineNo}))::numeric(18,2)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        posted,
        range.from ? gte(journalEntries.entryDate, range.from) : undefined,
        range.to ? lte(journalEntries.entryDate, range.to) : undefined,
      ),
    )
    .orderBy(journalEntries.entryDate, journalEntries.id, journalLines.lineNo)
    .limit(LIMIT + 1);
  const shown = lines.slice(0, LIMIT);
  return {
    account: {
      id: account.id,
      code: account.code,
      name: account.name,
      account_type: account.accountType,
      currency: account.currency as Currency | null,
      normal_side: normalSide(account.accountType as AccountType),
    },
    from: range.from ?? null,
    to: range.to ?? null,
    opening_balance: openingBalance,
    closing_balance: shown.at(-1)?.balance ?? openingBalance,
    lines: shown,
    truncated: lines.length > LIMIT,
  };
}

export async function listPeriods() {
  return db
    .select({
      period: accountingPeriods.period,
      closed_at: accountingPeriods.closedAt,
      closed_by_name: users.displayName,
      notes: accountingPeriods.notes,
    })
    .from(accountingPeriods)
    .leftJoin(users, eq(accountingPeriods.closedBy, users.id))
    .orderBy(desc(accountingPeriods.period));
}

export async function closeAccountingPeriod(
  period: string,
  notes: string | null,
  userId?: number,
) {
  const closed = await db.transaction((tx) =>
    closePeriod(tx, period, notes, userId),
  );
  await recordAudit({
    entityType: "accounting_period",
    entityId: Number(period.replace("-", "")),
    action: "closed",
    newValue: { period, notes, drafts_left: closed.drafts_left },
    userId,
  });
  return { period, drafts_left: closed.drafts_left };
}

export async function reopenAccountingPeriod(period: string, userId?: number) {
  const [removed] = await db
    .delete(accountingPeriods)
    .where(eq(accountingPeriods.period, period))
    .returning();
  if (!removed)
    throw new DomainError(404, `الشهر ${period} غير مقفل.`, "PERIOD_OPEN");
  await recordAudit({
    entityType: "accounting_period",
    entityId: Number(period.replace("-", "")),
    action: "reopened",
    oldValue: { period, closed_at: removed.closedAt },
    userId,
  });
  return { period };
}
