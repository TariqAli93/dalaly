/**
 * SQLSTATE and constraint of a PostgreSQL error, whether pg threw it directly
 * or Drizzle wrapped it (DrizzleQueryError keeps the pg error as `cause`).
 */
export function postgresError(
  error: unknown,
): { code: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object") return null;
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    // SQLSTATE codes are five digits/capitals; Fastify and Node codes are not.
    if (
      typeof candidate.code === "string" &&
      /^[0-9A-Z]{5}$/.test(candidate.code)
    )
      return {
        code: candidate.code,
        constraint:
          typeof candidate.constraint === "string"
            ? candidate.constraint
            : undefined,
      };
    current = candidate.cause;
  }
  return null;
}

// What pg-pool and pg say when no connection came within the pool's
// connectionTimeoutMillis: every one was busy, or a new one did not open.
// Neither error has a code.
const POOL_TIMEOUT_MESSAGES = new Set([
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
]);

/** The request found no free database connection in time (also through Drizzle's `cause`). */
export function isPoolTimeout(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!(current instanceof Error)) return false;
    if (POOL_TIMEOUT_MESSAGES.has(current.message)) return true;
    current = current.cause;
  }
  return false;
}
