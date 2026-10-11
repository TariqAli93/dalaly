import { z } from "zod";
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
