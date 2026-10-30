import { z } from "zod";
import { CURRENCIES } from "../../shared/money.js";
import { optionalId, optionalText } from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";
import { PAYER_ROLES, SHARE_BASES } from "./commissions.rules.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD.");
const decimalText = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((value) =>
    value === null || value === undefined || value === ""
      ? null
      : String(value).trim().replace(/,/g, ""),
  );

const shareFields = {
  basis: z.enum(SHARE_BASES),
  /** A percentage ("2.5") for "percent". */
  rate: decimalText,
  /** An amount for "fixed". */
  amount: decimalText,
};

/**
 * A commission on a deal, owed by its client or its owner: a fixed amount
 * or a percentage of the agreed price, with employees' shares. The currency
 * defaults to the deal's (and a percentage is always in it).
 */
export const commissionPayloadSchema = z.object({
  deal_id: z.coerce.number().int().positive(),
  payer_role: z.enum(PAYER_ROLES),
  ...shareFields,
  currency: z.enum(CURRENCIES).optional(),
  commission_date: isoDate,
  description: optionalText,
  splits: z
    .array(
      z.object({ user_id: z.coerce.number().int().positive(), ...shareFields }),
    )
    .max(20, "عشرون حصة على الأكثر.")
    .default([]),
});
export type CommissionPayload = z.infer<typeof commissionPayloadSchema>;

export const commissionCancelSchema = z.object({
  /** Defaults to the office's today. */
  cancel_date: isoDate.optional(),
  reason: z.string().trim().min(1, "اذكر سبب إلغاء العمولة.").max(300),
});

export const commissionPageQuerySchema = z.object({
  ...pageFields,
  sort_by: z
    .enum(["commission_date", "code", "amount", "created_at"])
    .default("commission_date"),
  deal_id: optionalId,
  person_id: optionalId,
  user_id: optionalId,
  currency: z.enum(CURRENCIES).optional(),
  /** open: something left to collect; settled: all collected. */
  state: z.enum(["open", "settled", "cancelled"]).optional(),
  q: z.string().trim().max(100).optional(),
});
export type CommissionPageQuery = z.infer<typeof commissionPageQuerySchema>;

export const commissionPayableQuerySchema = z.object({
  user_id: optionalId,
});
