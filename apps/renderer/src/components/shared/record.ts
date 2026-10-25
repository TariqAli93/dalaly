/** حقيقة في شريط هوية السجل (RecordFacts). */
export type RecordFact = {
  key: string;
  label: string;
  value?: string | null;
  /** سطر ثانٍ صغير تحت القيمة. */
  hint?: string | null;
  /** القيمة لاتينية كلها (رمز، رقم): اتجاهها LTR معزول. */
  ltr?: boolean;
  /** الحقيقة الأولى في الصف (السعر عادةً): أكبر وبلون الأساسي. */
  emphasis?: boolean;
};

/** حقل في قائمة تفاصيل السجل (DetailList). */
export type DetailItem = {
  label: string;
  value?: string | number | null;
  ltr?: boolean;
};

/** مجموعة حقول بعنوان؛ الحقول الفارغة لا تُعرض، والمجموعة الفارغة كذلك. */
export type DetailSection = { title: string; items: DetailItem[] };
