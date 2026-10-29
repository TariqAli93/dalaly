/**
 * What the log keeps of an error. Drizzle's query errors carry the statement's
 * bound values, in their message ("params: …") and as a `params` property;
 * those are customers' data and PIN hashes, so they are replaced. The SQL text
 * and the database's own error (the `cause`, with its SQLSTATE) stay.
 */
export type SerializedError = {
  type: string;
  message: string;
  stack: string;
  [key: string]: unknown;
};

export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error))
    return { type: typeof error, message: String(error), stack: "" };
  const fields = error as Error & {
    code?: unknown;
    statusCode?: unknown;
    params?: unknown;
    cause?: unknown;
  };
  const hasParams = Array.isArray(fields.params);
  const redact = (text = "") =>
    hasParams
      ? text.replace(/\nparams: [\s\S]*$/, "\nparams: [redacted]")
      : text;
  const cause = fields.cause;
  return {
    type: error.name,
    message: redact(error.message),
    // A query error's stack starts with its message, bound values included.
    stack: redact(hasParams ? error.stack?.split("\n    at ")[0] : error.stack),
    ...(fields.code === undefined ? {} : { code: fields.code }),
    ...(fields.statusCode === undefined
      ? {}
      : { statusCode: fields.statusCode }),
    ...(cause === undefined ? {} : { cause: serializeError(cause) }),
  };
}
