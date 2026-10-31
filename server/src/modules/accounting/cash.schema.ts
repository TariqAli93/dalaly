import { z } from "zod";
import { CURRENCIES, moneyField, parseMoney } from "../../shared/money.js";
import {
  isoDate,
  optionalId,
  optionalText,
} from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";

export const transferPayloadSchema = z.object({
  transfer_date: isoDate,
  currency: z.enum(CURRENCIES),
  from_account_id: z.coerce.number().int().positive(),
  to_account_id: z.coerce.number().int().positive(),
  amount: moneyField,
  description: z
    .string()
    .trim()
    .min(1, "بيان التحويل مطلوب.")
    .max(500, "بيان التحويل أطول من 500 حرف."),
  reference: optionalText,
});
export type TransferPayload = z.infer<typeof transferPayloadSchema>;

export const transferVoidSchema = z.object({
  /** Defaults to the office's today. */
  void_date: isoDate.optional(),
  reason: z.string().trim().min(1, "اذكر سبب إلغاء التحويل.").max(300),
});

export const transferPageQuerySchema = z.object({
  ...pageFields,
  sort_by: z
    .enum(["transfer_date", "code", "amount", "created_at"])
    .default("transfer_date"),
  currency: z.enum(CURRENCIES).optional(),
  status: z.enum(["posted", "voided"]).optional(),
  account_id: optionalId,
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
});
export type TransferPageQuery = z.infer<typeof transferPageQuerySchema>;

/** A balance that may be negative (a bank overdraft), with two decimals. */
const signedMoney = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const text = String(value).trim().replace(/,/g, "");
    const negative = text.startsWith("-");
    const parsed = parseMoney(negative ? text.slice(1) : text);
    if (parsed === null) {
      ctx.addIssue({
        code: "custom",
        message: "الرصيد رقم بمنزلتين عشريتين على الأكثر.",
      });
      return z.NEVER;
    }
    return negative && parsed !== "0.00" ? `-${parsed}` : parsed;
  });

export const reconciliationPayloadSchema = z.object({
  account_id: z.coerce.number().int().positive(),
  statement_date: isoDate,
  /** What was counted, or what the bank statement shows. */
  statement_balance: signedMoney,
  /** Post the difference as a shortage or an overage. */
  adjust: z.boolean().default(false),
  notes: optionalText,
});
export type ReconciliationPayload = z.infer<typeof reconciliationPayloadSchema>;

export const reconciliationQuerySchema = z.object({
  account_id: optionalId,
});

export const expenseCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "اسم التصنيف مطلوب.")
      .max(120, "اسم التصنيف أطول من 120 حرفاً."),
    iqd_account_id: optionalId,
    usd_account_id: optionalId,
    is_active: z.boolean().default(true),
  })
  .refine((value) => value.iqd_account_id || value.usd_account_id, {
    message: "اختر حساب المصروف بالدينار أو بالدولار.",
    path: ["iqd_account_id"],
  });
export type ExpenseCategoryPayload = z.infer<typeof expenseCategorySchema>;

export const balancesQuerySchema = z.object({
  as_of: isoDate.optional(),
});
