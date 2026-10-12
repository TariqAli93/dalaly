import { z } from "zod";
import { agreementDetailsSchema } from "./agreement.schema.js";
import { legalContextSchema } from "./legal-content.schema.js";
import { layoutSchema, brandingSchema } from "./contract-visual.engine.js";

const optionalDate = z.coerce.date().optional().nullable();
const optionalText = z
  .string()
  .trim()
  .max(10000)
  .optional()
  .nullable()
  .transform((value) => value || null);

export const CONTRACT_TYPES = ["sale", "rental"] as const;
// Backend compatibility only. The renderer deliberately filters this value
// out and offers only sale/rental creation.
export const BACKEND_CONTRACT_TYPES = ["sale", "rental", "purchase"] as const;
export const CONTRACT_ROLES = ["seller", "buyer", "lessor", "lessee"] as const;
export const CONTRACT_STATUSES = [
  "draft",
  "active",
  "completed",
  "cancelled",
  "expired",
] as const;

export const contractPartyPayloadSchema = z.object({
  person_id: z.coerce.number().int().positive(),
  role: z.enum(CONTRACT_ROLES),
  identity_document_ids: z
    .array(z.coerce.number().int().positive())
    .default([]),
});

export const contractPayloadSchema = z
  .object({
    contract_type: z.enum(BACKEND_CONTRACT_TYPES),
    // Singular ids remain accepted for old clients and old draft workflows.
    property_id: z.coerce.number().int().positive().optional().nullable(),
    rental_id: z.coerce.number().int().positive().optional().nullable(),
    property_ids: z.array(z.coerce.number().int().positive()).default([]),
    rental_ids: z.array(z.coerce.number().int().positive()).default([]),
    template_id: z.coerce.number().int().positive().optional().nullable(),
    status: z.enum(CONTRACT_STATUSES).default("draft"),
    contract_date: optionalDate,
    start_date: optionalDate,
    end_date: optionalDate,
    amount: z.coerce.number().nonnegative().optional().nullable(),
    paid_amount: z.coerce.number().nonnegative().default(0),
    payment_info: z.record(z.string(), z.unknown()).default({}),
    notes: optionalText,
    agreement_details: agreementDetailsSchema.prefault({}),
    legal_context: legalContextSchema.default({
      jurisdiction: "iq_federal",
      registration_reference: "",
      intended_use: "",
    }),
    optional_clause_codes: z
      .array(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/))
      .max(100)
      .default([]),
    parties: z.array(contractPartyPayloadSchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (
      value.contract_type === "rental" &&
      (!value.start_date || !value.end_date)
    )
      ctx.addIssue({
        code: "custom",
        path: ["start_date"],
        message: "تاريخ بداية الإيجار ونهايته مطلوبان.",
      });
    const kind = value.legal_context.transaction_kind;
    if (kind && (value.contract_type === "rental") !== (kind === "lease"))
      ctx.addIssue({
        code: "custom",
        path: ["legal_context"],
        message: "نوع المعاملة القانونية لا يطابق نوع العقد.",
      });
    if (
      kind === "registered_transfer_record" &&
      !value.legal_context.registration_reference
    )
      ctx.addIssue({
        code: "custom",
        path: ["legal_context", "registration_reference"],
        message: "مرجع التسجيل العقاري مطلوب لتوثيق تصرف مسجل.",
      });
    const expectedRoles =
      value.contract_type === "sale" || value.contract_type === "purchase"
        ? ["seller", "buyer"]
        : ["lessor", "lessee"];
    const roles = value.parties.map((party) => party.role);
    if (
      value.agreement_details.office_capacity !== "broker" &&
      !expectedRoles.includes(value.agreement_details.office_capacity)
    )
      ctx.addIssue({
        code: "custom",
        path: ["agreement_details", "office_capacity"],
        message: "صفة المكتب كطرف لا تطابق نوع الاتفاق.",
      });
    for (const role of expectedRoles) {
      if (!roles.includes(role as (typeof CONTRACT_ROLES)[number]))
        ctx.addIssue({
          code: "custom",
          path: ["parties"],
          message: `الدور المطلوب غير موجود: ${role}.`,
        });
    }
    if (new Set(roles).size !== roles.length)
      ctx.addIssue({
        code: "custom",
        path: ["parties"],
        message: "لا يمكن تكرار دور الطرف داخل العقد.",
      });

    const propertyIds = value.property_ids.length
      ? value.property_ids
      : value.property_id
        ? [value.property_id]
        : [];
    const rentalIds = value.rental_ids.length
      ? value.rental_ids
      : value.rental_id
        ? [value.rental_id]
        : [];
    if (
      (value.contract_type === "sale" || value.contract_type === "purchase") &&
      !propertyIds.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["property_ids"],
        message: "اختر عقاراً واحداً على الأقل لعقد البيع.",
      });
    if (value.contract_type === "rental" && !rentalIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["rental_ids"],
        message: "اختر عرضاً إيجارياً واحداً على الأقل لعقد الإيجار.",
      });
    if (propertyIds.length && rentalIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["rental_ids"],
        message: "لا يمكن ربط العقد بعقارات وعروض إيجارية معاً.",
      });
    if (value.amount == null || value.amount <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "المبلغ الإجمالي مطلوب ويجب أن يكون أكبر من صفر.",
      });
    if (value.paid_amount > (value.amount ?? 0))
      ctx.addIssue({
        code: "custom",
        path: ["paid_amount"],
        message: "لا يمكن أن يتجاوز المبلغ المدفوع المبلغ الإجمالي.",
      });
    if (value.end_date && value.start_date && value.end_date < value.start_date)
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.",
      });
  });

export const contractFiltersSchema = z.object({
  contract_type: z.enum(BACKEND_CONTRACT_TYPES).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  person_id: z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional(),
  rental_id: z.coerce.number().int().positive().optional(),
});

export const contractCancellationSchema = z
  .object({
    reason: z.string().trim().min(1, "سبب الإلغاء مطلوب.").max(5000),
    cancellation_date: z
      .union([z.date(), z.string().trim().min(1)])
      .pipe(z.coerce.date()),
    notes: optionalText,
  })
  .strict()
  .superRefine((value, ctx) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const chosen = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value.cancellation_date);
    if (chosen > today)
      ctx.addIssue({
        code: "custom",
        path: ["cancellation_date"],
        message: "تاريخ الإلغاء لا يمكن أن يكون في المستقبل.",
      });
  });

export const contractPrintRecordSchema = z
  .object({ format: z.enum(["print", "pdf", "docx"]).default("print") })
  .strict();

export const contractSettlementSchema = z
  .object({
    kind: z.enum(["refund", "retained_payment", "remaining_obligation"]),
    amount: z.coerce
      .number()
      .positive()
      .max(Number.MAX_SAFE_INTEGER / 100)
      .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
        "المبلغ يقبل منزلتين عشريتين فقط.",
      ),
    reference: z.string().trim().min(1, "مرجع التسوية مطلوب.").max(500),
    reason: z.string().trim().min(1, "سبب التسوية مطلوب.").max(5000),
    settlement_date: z
      .union([z.date(), z.string().trim().min(1)])
      .pipe(z.coerce.date()),
    request_id: z.uuid(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const format = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (format.format(value.settlement_date) > format.format(new Date()))
      ctx.addIssue({
        code: "custom",
        path: ["settlement_date"],
        message: "تاريخ التسوية لا يمكن أن يكون في المستقبل.",
      });
  });

export const contractTemplateSchema = z.object({
  contract_type: z.enum(BACKEND_CONTRACT_TYPES),
  name: z.string().trim().min(1),
  body: z.literal("{{document}}").default("{{document}}"),
  layout_config: layoutSchema,
  branding_config: brandingSchema,
  is_active: z.coerce.boolean().default(true),
});

export type ContractPayload = z.infer<typeof contractPayloadSchema>;
export type ContractFilters = z.infer<typeof contractFiltersSchema>;
export type ContractTemplatePayload = z.infer<typeof contractTemplateSchema>;
export type ContractCancellation = z.infer<typeof contractCancellationSchema>;
export type ContractSettlement = z.infer<typeof contractSettlementSchema>;
