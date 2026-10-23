import pg from "pg";

/**
 * Runs `work` and counts the SQL statements it sends. Every statement, from
 * the pool or from a transaction's client, goes through pg.Client#query.
 * Not safe with other database work running at the same time.
 */
export async function countQueries<T>(work: () => Promise<T>) {
  const original = pg.Client.prototype.query;
  let queries = 0;
  pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
    queries += 1;
    return (original as (...rest: unknown[]) => unknown).apply(this, args);
  } as typeof original;
  try {
    const result = await work();
    return { result, queries };
  } finally {
    pg.Client.prototype.query = original;
  }
}
