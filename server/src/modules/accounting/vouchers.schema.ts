import { z } from "zod";
import { CURRENCIES, moneyField } from "../../shared/money.js";
import { optionalId, optionalText } from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";
import {
  PAYMENT_PURPOSES,
  RECEIPT_PURPOSES,
  VOUCHER_KINDS,
} from "./vouchers.rules.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD.");

export const VOUCHER_PURPOSES = [
  ...new Set([
    ...Object.keys(RECEIPT_PURPOSES),
    ...Object.keys(PAYMENT_PURPOSES),
  ]),
] as [string, ...string[]];

/**
 * A receipt or payment as issued. The other account is optional: without it
 * the purpose's default account of the voucher's currency is used. The
 * party is a customer, or a name typed for someone who is not one.
 */
export const voucherPayloadSchema = z.object({
  kind: z.enum(VOUCHER_KINDS),
  voucher_date: isoDate,
  currency: z.enum(CURRENCIES),
  amount: moneyField,
  purpose: z.enum(VOUCHER_PURPOSES),
  money_account_id: z.coerce.number().int().positive(),
  other_account_id: optionalId,
  person_id: optionalId,
  party_name: optionalText,
  deal_id: optionalId,
  /** A receipt that collects this commission. */
  commission_id: optionalId,
  /** A payment of this employee's share of a commission. */
  commission_split_id: optionalId,
  /** What an expense payment was for: picks its expense account. */
  expense_category_id: optionalId,
  description: z
    .string()
    .trim()
    .min(1, "بيان السند مطلوب.")
    .max(500, "بيان السند أطول من 500 حرف."),
  reference: optionalText,
});
export type VoucherPayload = z.infer<typeof voucherPayloadSchema>;

export const voucherVoidSchema = z.object({
  /** Defaults to the office's today. */
  void_date: isoDate.optional(),
  reason: z.string().trim().min(1, "اذكر سبب إلغاء السند.").max(300),
});

export const voucherPageQuerySchema = z.object({
  ...pageFields,
  sort_by: z
    .enum(["voucher_date", "code", "amount", "created_at"])
    .default("voucher_date"),
  kind: z.enum(VOUCHER_KINDS).optional(),
  currency: z.enum(CURRENCIES).optional(),
  status: z.enum(["posted", "voided"]).optional(),
  purpose: z.enum(VOUCHER_PURPOSES).optional(),
  person_id: optionalId,
  deal_id: optionalId,
  money_account_id: optionalId,
  commission_id: optionalId,
  expense_category_id: optionalId,
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
});
export type VoucherPageQuery = z.infer<typeof voucherPageQuerySchema>;

export const clientFundsQuerySchema = z.object({
  person_id: z.coerce.number().int().positive(),
});
