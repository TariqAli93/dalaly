import { z } from "zod";

const optionalDate = z.coerce.date().optional().nullable();
const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null);

export const CONTRACT_TYPES = ["sale", "rental"] as const;
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
    contract_type: z.enum(CONTRACT_TYPES),
    property_id: z.coerce.number().int().positive().optional().nullable(),
    rental_id: z.coerce.number().int().positive().optional().nullable(),
    template_id: z.coerce.number().int().positive().optional().nullable(),
    status: z.enum(CONTRACT_STATUSES).default("draft"),
    contract_date: optionalDate,
    start_date: optionalDate,
    end_date: optionalDate,
    amount: z.coerce.number().nonnegative().optional().nullable(),
    payment_info: z.record(z.string(), z.unknown()).default({}),
    notes: optionalText,
    parties: z.array(contractPartyPayloadSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const expectedRoles =
      value.contract_type === "sale"
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
    if (value.contract_type === "sale" && !value.property_id)
      ctx.addIssue({
        code: "custom",
        path: ["property_id"],
        message: "اختر العقار المرتبط بعقد البيع.",
      });
    if (value.contract_type === "rental" && !value.rental_id)
      ctx.addIssue({
        code: "custom",
        path: ["rental_id"],
        message: "اختر العرض الإيجاري المرتبط بعقد الإيجار.",
      });
    if (value.property_id && value.rental_id)
      ctx.addIssue({
        code: "custom",
        path: ["rental_id"],
        message: "لا يمكن ربط العقد بعقار وعرض إيجاري معاً.",
      });
    if (value.end_date && value.start_date && value.end_date < value.start_date)
      ctx.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.",
      });
  });

export const contractFiltersSchema = z.object({
  contract_type: z.enum(CONTRACT_TYPES).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  person_id: z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional(),
  rental_id: z.coerce.number().int().positive().optional(),
});

export const contractTemplateSchema = z.object({
  contract_type: z.enum(CONTRACT_TYPES),
  name: z.string().trim().min(1),
  body: z.string().min(1),
  is_active: z.coerce.boolean().default(true),
});

export type ContractPayload = z.infer<typeof contractPayloadSchema>;
export type ContractFilters = z.infer<typeof contractFiltersSchema>;
export type ContractTemplatePayload = z.infer<typeof contractTemplateSchema>;
