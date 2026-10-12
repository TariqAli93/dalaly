import { z } from "zod";

const text = z.string().trim().max(3000).default("");
export const agreementDetailsSchema = z
  .object({
    office_capacity: z
      .enum(["broker", "seller", "buyer", "lessor", "lessee"])
      .default("broker"),
    payment_terms: text,
    transfer_due_date: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !v ||
          (!Number.isNaN(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
        "التاريخ غير صحيح.",
      )
      .default(""),
    handover_conditions: text,
    occupancy_conditions: text,
    utilities_responsibilities: text,
    rental_procedures_note: z.boolean().default(true),
    police_station: text,
    security_approval_reference: text,
    identity_both_sides_required: z.boolean().default(false),
    witnesses: z
      .array(z.object({ name: z.string().trim().min(1).max(200) }).strict())
      .max(4)
      .default([]),
  })
  .strict();

export const SALE_PROCEDURES = [
  { key: "signed", label: "تم توقيع الاتفاق" },
  {
    key: "notarized",
    label: "تم تصديق الاتفاق لدى الكاتب العدل، إن كان مطلوباً أو مختاراً",
    optional: true,
  },
  { key: "registered", label: "تم استكمال إجراءات التسجيل العقاري" },
  { key: "ownership_transferred", label: "تم نقل الملكية" },
  { key: "handed_over", label: "تم تسليم العقار" },
] as const;
export const RENTAL_PROCEDURES = [
  { key: "signed", label: "تم توقيع الاتفاق" },
  {
    key: "lease_registered",
    label: "تم تصديق أو تسجيل عقد الإيجار لدى الجهة المختصة، عند الاقتضاء",
    optional: true,
  },
  { key: "documents_submitted", label: "تم تقديم مستمسكات الطرفين" },
  {
    key: "security_requested",
    label: "تم تقديم طلب الموافقة الأمنية أو السكنية، عند اشتراطها",
    optional: true,
  },
  { key: "security_approved", label: "تم الحصول على الموافقة", optional: true },
  { key: "handed_over", label: "تم تسليم العقار" },
] as const;
export function proceduresFor(type: string) {
  return type === "rental" ? RENTAL_PROCEDURES : SALE_PROCEDURES;
}
export const procedureInputSchema = z
  .object({
    step_key: z.string().min(1).max(80),
    status: z.enum(["pending", "completed", "not_applicable"]),
    completed_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    reference: z.string().trim().max(500).default(""),
    notes: text,
    expected_updated_at: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === "completed" && !v.completed_on)
      ctx.addIssue({ code: "custom", message: "تاريخ استكمال الإجراء مطلوب." });
    if (v.status !== "completed" && v.completed_on)
      ctx.addIssue({
        code: "custom",
        message: "أدخل التاريخ للإجراء المكتمل فقط.",
      });
  });
export const procedureAttachmentSchema = z
  .object({
    step_key: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(200),
    data: z.string().min(1).max(15_000_000),
    file_type: z.enum([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
  })
  .strict();

export const SALE_EXPLANATION =
  "يُعد هذا الاتفاق توثيقاً لما تم الاتفاق عليه بين الطرفين بواسطة المكتب العقاري، ولا يُعد سنداً ناقلاً لملكية العقار، إذ يتم نقل الملكية وفق الإجراءات القانونية لدى دائرة التسجيل العقاري المختصة.";
export const RENTAL_PROCEDURES_NOTE =
  "يلتزم الطرفان باستكمال إجراءات تسجيل أو تصديق عقد الإيجار والحصول على الموافقات الأمنية أو السكنية لدى الجهات المختصة، متى كانت مطلوبة وفق التعليمات النافذة في منطقة العقار.";
