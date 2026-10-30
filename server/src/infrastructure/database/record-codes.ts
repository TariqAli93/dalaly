import { sql } from "drizzle-orm";
import { db } from "./db.js";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Two-key advisory locks have their own key space; 1802 marks record codes. */
const CODE_LOCK_NAMESPACE = 1802;

/**
 * Record codes are "last code + 1". Reading the last code and inserting the
 * new row inside one transaction that holds a per-table advisory lock makes
 * concurrent creates take turns, so each sees the code the previous one
 * committed. The lock is released when the transaction ends. Run the code
 * lookup on `tx`: a second pool connection while holding the lock could
 * exhaust the pool under load.
 */
export function withRecordCodeLock<T>(
  table: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockRecordCodes(tx, table);
    return work(tx);
  });
}

/** The same lock inside a transaction the caller already has. */
export async function lockRecordCodes(tx: Transaction, table: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${CODE_LOCK_NAMESPACE}, hashtext(${table}))`,
  );
}
