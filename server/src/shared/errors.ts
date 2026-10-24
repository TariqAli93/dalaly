/** Machine-readable `code` of an error response, by HTTP status. */
const statusErrorCodes: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
  503: "SERVICE_UNAVAILABLE",
};

export function errorCodeForStatus(status: number) {
  return (
    statusErrorCodes[status] ??
    (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST")
  );
}

/**
 * A failure the user should read: an HTTP status and an Arabic message. The
 * central error handler (server.ts) answers it with `{ code, message }`.
 * Anything else a route throws becomes a 500 with a generic message, so
 * driver or file-system text never reaches the user.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(
    readonly statusCode: number,
    message: string,
    code?: string,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code ?? errorCodeForStatus(statusCode);
  }
}

/**
 * خطأ تكرار القطعة: تُرفع عند محاولة تسجيل قطعة مطابقة لقطعة موجودة
 * (نفس المحافظة/المنطقة/الحي/رقم القطعة/حرف القطعة بعد التطبيع).
 * يحمل اسم مالك العرض المسجَّل مسبقاً لعرضه في رسالة 409.
 */
export class DuplicatePlotError extends DomainError {
  constructor(public readonly ownerName: string | null) {
    super(
      409,
      ownerName
        ? `هذه القطعة مسجلة مسبقاً باسم: ${ownerName}`
        : "هذه القطعة مسجلة مسبقاً.",
      "DUPLICATE_PLOT",
    );
    this.name = "DuplicatePlotError";
  }
}
