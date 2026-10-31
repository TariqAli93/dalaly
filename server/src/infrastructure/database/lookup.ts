import { sql } from "drizzle-orm";

/**
 * One value of another table's row, as a scalar subquery: `(SELECT column
 * FROM table WHERE id = key)`. Lists use these instead of a join per linked
 * record. With a dozen joins PostgreSQL spends tens of milliseconds choosing
 * a join order for every page, against about a millisecond to read it; a
 * scalar subquery is planned on its own and runs only for the rows of the
 * page (docs/PERFORMANCE.md, "Business benchmarks").
 *
 * `key` is SQL text, so pass the outer column through `qualified`:
 * unqualified, a column of the same name in `table` would win inside the
 * subquery. Table and column names are this code's own, never input.
 */
export const lookupValue = (table: string, column: string, key: string) =>
  sql.raw(`(SELECT ${column} FROM ${table} WHERE id = ${key})`);

/** `"table"."column"`: an outer column as a subquery must name it. */
export const qualified = (table: string, column: string) =>
  `"${table}"."${column}"`;
