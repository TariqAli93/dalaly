/**
 * خطأ تكرار القطعة: تُرفع عند محاولة تسجيل قطعة مطابقة لقطعة موجودة
 * (نفس المحافظة/المنطقة/الحي/رقم القطعة/حرف القطعة بعد التطبيع).
 * يحمل اسم مالك العرض المسجَّل مسبقاً لعرضه في رسالة 409.
 */
export class DuplicatePlotError extends Error {
  constructor(public readonly ownerName: string | null) {
    super(
      ownerName
        ? `هذه القطعة مسجلة مسبقاً باسم: ${ownerName}`
        : "هذه القطعة مسجلة مسبقاً.",
    );
    this.name = "DuplicatePlotError";
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
}
export class DocumentError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 409 | 422 | 503 = 400,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}
