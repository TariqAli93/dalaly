import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import type { Transaction } from "../../infrastructure/database/record-codes.js";
import {
  accounts,
  journalEntries,
  journalLines,
} from "../../infrastructure/database/schema.js";
import { DomainError } from "../../shared/errors.js";
import { toApiObject } from "../../shared/utils/case.js";
import { recordAudit } from "../audit/audit.service.js";
import {
  accountChangeError,
  type AccountShape,
  type ChartAccount,
} from "./accounting.rules.js";
import type { AccountPayload } from "./accounting.schema.js";

type AccountRow = typeof accounts.$inferSelect;

const accountApi = (row: AccountRow) =>
  toApiObject(row) as Record<string, unknown>;

/** Stored rows as the rules see them: the checks keep type and currency valid. */
const asChart = (rows: AccountRow[]) => rows as ChartAccount[];

/** The whole chart by code; the renderer builds the tree from `parent_id`. */
export async function listAccounts() {
  const rows = await db.select().from(accounts).orderBy(asc(accounts.code));
  return rows.map(accountApi);
}

const shapeOf = (payload: AccountPayload): AccountShape => ({
  code: payload.code,
  accountType: payload.account_type,
  parentId: payload.parent_id ?? null,
  currency: payload.currency,
  isPostable: payload.is_postable,
  isActive: payload.is_active,
});

/**
 * Chart edits take a lock that blocks other chart edits (not reads, and not
 * postings that only refer to accounts), so two saves cannot together put
 * an account under its own child or reuse a code.
 */
async function lockChart(tx: Transaction) {
  await tx.execute(sql`LOCK TABLE accounts IN SHARE ROW EXCLUSIVE MODE`);
  return tx.select().from(accounts);
}

function checkCode(chart: AccountRow[], code: string, ownId: number | null) {
  if (chart.some((account) => account.code === code && account.id !== ownId))
    throw new DomainError(
      409,
      `الرمز ${code} لحساب آخر.`,
      "ACCOUNT_CODE_TAKEN",
    );
}

export async function createAccount(payload: AccountPayload, userId?: number) {
  const next = shapeOf(payload);
  const row = await db.transaction(async (tx) => {
    const chart = await lockChart(tx);
    checkCode(chart, next.code, null);
    const error = accountChangeError(asChart(chart), null, next);
    if (error) throw new DomainError(400, error, "ACCOUNT_RULE");
    const [created] = await tx
      .insert(accounts)
      .values({
        code: next.code,
        name: payload.name,
        accountType: next.accountType,
        parentId: next.parentId,
        currency: next.currency,
        isPostable: next.isPostable,
        isActive: next.isActive,
        description: payload.description,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      })
      .returning();
    return created;
  });
  await recordAudit({
    entityType: "account",
    entityId: row.id,
    action: "created",
    newValue: { code: row.code, name: row.name },
    userId,
  });
  return accountApi(row);
}

export async function updateAccount(
  id: number,
  payload: AccountPayload,
  userId?: number,
) {
  const next = shapeOf(payload);
  const result = await db.transaction(async (tx) => {
    const chart = await lockChart(tx);
    const before = chart.find((account) => account.id === id);
    if (!before) return null;
    checkCode(chart, next.code, id);
    const [lines] = await tx
      .select({ id: journalLines.id })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalLines.accountId, id),
          eq(journalEntries.status, "posted"),
        ),
      )
      .limit(1);
    const error = accountChangeError(
      asChart(chart),
      before as ChartAccount,
      next,
      { hasLines: Boolean(lines) },
    );
    if (error) throw new DomainError(400, error, "ACCOUNT_RULE");
    const [updated] = await tx
      .update(accounts)
      .set({
        code: next.code,
        name: payload.name,
        accountType: next.accountType,
        parentId: next.parentId,
        currency: next.currency,
        isPostable: next.isPostable,
        isActive: next.isActive,
        description: payload.description,
        updatedBy: userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, id))
      .returning();
    return { before, updated };
  });
  if (!result) return null;
  const changed = (row: AccountRow) => ({
    code: row.code,
    name: row.name,
    account_type: row.accountType,
    parent_id: row.parentId,
    currency: row.currency,
    is_postable: row.isPostable,
    is_active: row.isActive,
  });
  await recordAudit({
    entityType: "account",
    entityId: id,
    action: "updated",
    oldValue: changed(result.before),
    newValue: changed(result.updated),
    userId,
  });
  return accountApi(result.updated);
}
