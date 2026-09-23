import { z } from "zod";

const optionalDate = z.coerce.date().optional().nullable();
const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null);
export const CONTRACT_TYPES = ["sale", "purchase", "rental", "lease"] as const;
export const contractPayloadSchema = z
  .object({
    contract_type: z.enum(CONTRACT_TYPES),
    customer_id: z.coerce.number().int().positive().optional().nullable(),
    property_id: z.coerce.number().int().positive().optional().nullable(),
    rental_id: z.coerce.number().int().positive().optional().nullable(),
    template_id: z.coerce.number().int().positive().optional().nullable(),
    status: z
      .enum(["draft", "active", "completed", "cancelled", "expired"])
      .default("draft"),
    contract_date: optionalDate,
    start_date: optionalDate,
    end_date: optionalDate,
    amount: z.coerce.number().nonnegative().optional().nullable(),
    payment_info: z.record(z.string(), z.unknown()).default({}),
    notes: optionalText,
    parties: z
      .array(
        z.object({
          customer_id: z.coerce.number().int().positive(),
          role: z.string().trim().min(1),
        }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => {
    if (!value.property_id && !value.rental_id)
      ctx.addIssue({
        code: "custom",
        path: ["property_id"],
        message: "اختر العقار أو العرض الإيجاري المرتبط بالعقد.",
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
  status: z
    .enum(["draft", "active", "completed", "cancelled", "expired"])
    .optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional(),
  rental_id: z.coerce.number().int().positive().optional(),
});
export const contractTemplateSchema = z.object({
  name: z.string().trim().min(1),
  body: z.string().min(1),
  is_active: z.coerce.boolean().default(true),
});
export type ContractPayload = z.infer<typeof contractPayloadSchema>;
export type ContractFilters = z.infer<typeof contractFiltersSchema>;
export type ContractTemplatePayload = z.infer<typeof contractTemplateSchema>;
