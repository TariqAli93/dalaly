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

/**
 * Record codes are "last code + 1", so two saves at the same moment can pick
 * the same one. Retries the insert (which must generate the code itself) when
 * it hits that code's unique constraint.
 */
export async function withUniqueCodeRetry<T>(
  constraint: string,
  insert: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await insert();
    } catch (error) {
      const pg = postgresError(error);
      const codeTaken = pg?.code === "23505" && pg.constraint === constraint;
      if (!codeTaken || attempt >= attempts) throw error;
    }
  }
}
