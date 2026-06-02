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
        : "هذه القطعة مسجلة مسبقاً."
    );
    this.name = "DuplicatePlotError";
  }
}
