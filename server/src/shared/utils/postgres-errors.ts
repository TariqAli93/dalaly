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
