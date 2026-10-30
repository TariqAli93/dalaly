import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accountingPeriods,
  accounts,
  journalEntries,
  journalLines,
} from "../../infrastructure/database/schema.js";
import {
  lockRecordCodes,
  type Transaction,
} from "../../infrastructure/database/record-codes.js";
import { DomainError } from "../../shared/errors.js";
import type { Currency } from "../../shared/money.js";
import type { ChartAccount } from "./accounting.rules.js";
import {
  entryError,
  periodOf,
  reversalLines,
  type EntryLine,
} from "./journal.rules.js";
import type { JournalSource } from "./journal.schema.js";

/**
 * The one way into the ledger. Manual entries, receipts, payments and
 * commissions all write through `writeEntry`, inside their own transaction,
 * so a document and its entry are saved together or not at all. The rules
 * are checked here first (journal.rules.ts) for an Arabic message; the
 * database triggers of 0009 refuse the same again.
 */

export type LedgerLine = EntryLine & {
  personId?: number | null;
  dealId?: number | null;
  memo?: string | null;
};

export type LedgerEntry = {
  entryDate: string;
  currency: Currency;
  description: string;
  sourceType: JournalSource;
  sourceId?: number | null;
  /** The same key never posts twice: the first entry is returned. */
  idempotencyKey?: string | null;
  reversalOfId?: number | null;
  lines: LedgerLine[];
};

async function checkEntry(
  tx: Transaction,
  entry: LedgerEntry,
  posting: boolean,
) {
  const ids = [...new Set(entry.lines.map((line) => line.accountId))];
  const rows = ids.length
    ? await tx.select().from(accounts).where(inArray(accounts.id, ids))
    : [];
  const chart = new Map(rows.map((row) => [row.id, row as ChartAccount]));
  const closed = new Set(
    (
      await tx
        .select({ period: accountingPeriods.period })
        .from(accountingPeriods)
        .where(eq(accountingPeriods.period, periodOf(entry.entryDate)))
    ).map((row) => row.period),
  );
  const error = entryError(entry, chart, closed, { posting });
  if (error) throw new DomainError(400, error, "LEDGER_RULE");
}

async function nextEntryCode(tx: Transaction) {
  await lockRecordCodes(tx, "journal_entries");
  const [last] = await tx
    .select({ code: journalEntries.code })
    .from(journalEntries)
    .orderBy(desc(journalEntries.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `JE-${String(next).padStart(6, "0")}`;
}

async function insertLines(
  tx: Transaction,
  entryId: number,
  lines: LedgerLine[],
) {
  await tx.insert(journalLines).values(
    lines.map((line, index) => ({
      entryId,
      lineNo: index + 1,
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      personId: line.personId ?? null,
      dealId: line.dealId ?? null,
      memo: line.memo ?? null,
    })),
  );
}

async function markPosted(tx: Transaction, entryId: number, userId?: number) {
  await tx
    .update(journalEntries)
    .set({
      status: "posted",
      postedAt: new Date(),
      postedBy: userId ?? null,
      updatedBy: userId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(journalEntries.id, entryId));
}

/**
 * Writes an entry as a draft, or posted when `post`. Returns its id; with an
 * idempotency key already used, the earlier entry's id.
 */
export async function writeEntry(
  tx: Transaction,
  entry: LedgerEntry,
  { post, userId }: { post: boolean; userId?: number },
) {
  if (entry.idempotencyKey) {
    const [existing] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(eq(journalEntries.idempotencyKey, entry.idempotencyKey));
    if (existing) return existing.id;
  }
  await checkEntry(tx, entry, post);
  const [created] = await tx
    .insert(journalEntries)
    .values({
      code: await nextEntryCode(tx),
      entryDate: entry.entryDate,
      description: entry.description,
      currency: entry.currency,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
      reversalOfId: entry.reversalOfId ?? null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })
    .returning({ id: journalEntries.id });
  await insertLines(tx, created.id, entry.lines);
  if (post) await markPosted(tx, created.id, userId);
  return created.id;
}

type EntryRow = typeof journalEntries.$inferSelect;

async function lockEntry(tx: Transaction, id: number) {
  const [row] = await tx
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .for("update");
  return row ?? null;
}

async function entryLines(tx: Transaction, id: number): Promise<LedgerLine[]> {
  return (
    await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.entryId, id))
      .orderBy(journalLines.lineNo)
  ).map((line) => ({
    accountId: line.accountId,
    debit: line.debit,
    credit: line.credit,
    personId: line.personId,
    dealId: line.dealId,
    memo: line.memo,
  }));
}

const notDraft = (row: EntryRow) =>
  new DomainError(
    409,
    `القيد ${row.code} مرحَّل؛ لا يُعدَّل ولا يُحذف، ويُصحَّح بقيد عكسي.`,
    "ENTRY_POSTED",
  );

/** Replaces a draft's fields and lines; posts it too when `post`. */
export async function replaceDraft(
  tx: Transaction,
  id: number,
  entry: Omit<LedgerEntry, "sourceType">,
  { post, userId }: { post: boolean; userId?: number },
) {
  const row = await lockEntry(tx, id);
  if (!row) return null;
  if (row.status !== "draft") throw notDraft(row);
  await checkEntry(tx, { ...entry, sourceType: "manual" }, post);
  await tx
    .update(journalEntries)
    .set({
      entryDate: entry.entryDate,
      description: entry.description,
      currency: entry.currency,
      updatedBy: userId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(journalEntries.id, id));
  await tx.delete(journalLines).where(eq(journalLines.entryId, id));
  await insertLines(tx, id, entry.lines);
  if (post) await markPosted(tx, id, userId);
  return id;
}

export async function postDraft(tx: Transaction, id: number, userId?: number) {
  const row = await lockEntry(tx, id);
  if (!row) return null;
  if (row.status !== "draft") throw notDraft(row);
  await checkEntry(
    tx,
    {
      entryDate: row.entryDate,
      currency: row.currency as Currency,
      description: row.description,
      sourceType: row.sourceType as JournalSource,
      lines: await entryLines(tx, id),
    },
    true,
  );
  await markPosted(tx, id, userId);
  return id;
}

export async function deleteDraft(tx: Transaction, id: number) {
  const row = await lockEntry(tx, id);
  if (!row) return null;
  if (row.status !== "draft") throw notDraft(row);
  await tx.delete(journalEntries).where(eq(journalEntries.id, id));
  return row;
}

/**
 * Posts the entry that undoes a posted one: the same lines with their sides
 * swapped, dated `entryDate` (the office's today by default). An entry is
 * reversed once; a reversing entry is not reversed itself.
 */
export async function reverseEntry(
  tx: Transaction,
  id: number,
  { entryDate, reason }: { entryDate?: string; reason: string },
  userId?: number,
) {
  const row = await lockEntry(tx, id);
  if (!row) return null;
  if (row.status !== "posted")
    throw new DomainError(
      409,
      `القيد ${row.code} مسودة؛ احذفها أو عدّلها بدل عكسها.`,
      "ENTRY_NOT_POSTED",
    );
  if (row.sourceType === "reversal")
    throw new DomainError(
      409,
      `القيد ${row.code} قيد عكسي؛ لا يُعكس.`,
      "ENTRY_IS_REVERSAL",
    );
  const [reversed] = await tx
    .select({ code: journalEntries.code })
    .from(journalEntries)
    .where(eq(journalEntries.reversalOfId, id));
  if (reversed)
    throw new DomainError(
      409,
      `القيد ${row.code} معكوس أصلاً بالقيد ${reversed.code}.`,
      "ENTRY_REVERSED",
    );
  const date =
    entryDate ??
    (
      await tx.execute<{ today: string }>(
        sql`SELECT to_char(now() at time zone 'Asia/Baghdad', 'YYYY-MM-DD') AS today`,
      )
    ).rows[0]!.today;
  return writeEntry(
    tx,
    {
      entryDate: date,
      currency: row.currency as Currency,
      description: `عكس القيد ${row.code}: ${reason}`,
      sourceType: "reversal",
      reversalOfId: id,
      lines: reversalLines(await entryLines(tx, id)),
    },
    { post: true, userId },
  );
}

/**
 * Closes a month to postings. Postings in flight finish first and later ones
 * see the month closed: the share lock waits for them and holds new ones
 * until this commits.
 */
export async function closePeriod(
  tx: Transaction,
  period: string,
  notes: string | null,
  userId?: number,
) {
  await tx.execute(sql`LOCK TABLE journal_entries IN SHARE MODE`);
  const [drafts] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.status, "draft"),
        sql`to_char(${journalEntries.entryDate}, 'YYYY-MM') = ${period}`,
      ),
    );
  const [created] = await tx
    .insert(accountingPeriods)
    .values({ period, notes, closedBy: userId ?? null })
    .onConflictDoNothing()
    .returning();
  if (!created)
    throw new DomainError(409, `الشهر ${period} مقفل أصلاً.`, "PERIOD_CLOSED");
  return { ...created, drafts_left: drafts.count };
}
