import { z } from "zod";
import { CURRENCIES } from "../../shared/money.js";
import { optionalId, optionalText } from "../../shared/validation/fields.js";
import { ACCOUNT_TYPES } from "./accounting.rules.js";

/**
 * An account as the chart editor saves it. A heading leaves `currency` empty
 * to span both currencies; a posting account names one. Rules that need the
 * rest of the chart (parent, children, system accounts) are in
 * accounting.rules.ts.
 */
export const accountPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{1,10}$/, "رمز الحساب أرقام فقط، من رقم واحد إلى عشرة."),
  name: z
    .string()
    .trim()
    .min(1, "اسم الحساب مطلوب.")
    .max(160, "اسم الحساب أطول من 160 حرفاً."),
  account_type: z.enum(ACCOUNT_TYPES),
  parent_id: optionalId,
  currency: z
    .enum(CURRENCIES)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  is_postable: z.boolean().default(true),
  is_active: z.boolean().default(true),
  description: optionalText,
});
export type AccountPayload = z.infer<typeof accountPayloadSchema>;
