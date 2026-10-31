import { z } from "zod";
import { CURRENCIES, optionalMoneyField } from "../../shared/money.js";
import {
  isoDate,
  optionalId,
  optionalText,
} from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";

export const JOURNAL_SOURCES = [
  "manual",
  "reversal",
  "receipt",
  "payment",
  "commission",
  "expense",
  "transfer",
  "lease",
  "reconciliation",
] as const;
export type JournalSource = (typeof JOURNAL_SOURCES)[number];

/** One line: an amount on the debit side or the credit side. */
const journalLineSchema = z.object({
  account_id: z.coerce.number().int().positive(),
  debit: optionalMoneyField.transform((value) => value ?? "0.00"),
  credit: optionalMoneyField.transform((value) => value ?? "0.00"),
  person_id: optionalId,
  deal_id: optionalId,
  memo: optionalText,
});

/** A manual entry: saved as a draft, or posted at once with `post`. */
export const journalEntrySchema = z.object({
  entry_date: isoDate,
  currency: z.enum(CURRENCIES),
  description: z
    .string()
    .trim()
    .min(1, "وصف القيد مطلوب.")
    .max(500, "وصف القيد أطول من 500 حرف."),
  lines: z
    .array(journalLineSchema)
    .min(2, "للقيد سطران على الأقل: مدين ودائن.")
    .max(200, "للقيد 200 سطر على الأكثر."),
  post: z.boolean().default(false),
});
export type JournalEntryPayload = z.infer<typeof journalEntrySchema>;

export const journalReverseSchema = z.object({
  /** Defaults to the office's today. */
  entry_date: isoDate.optional(),
  reason: z.string().trim().min(1, "اذكر سبب عكس القيد.").max(300),
});

export const journalPageQuerySchema = z.object({
  ...pageFields,
  sort_by: z.enum(["entry_date", "code", "created_at"]).default("entry_date"),
  currency: z.enum(CURRENCIES).optional(),
  status: z.enum(["draft", "posted"]).optional(),
  source_type: z.enum(JOURNAL_SOURCES).optional(),
  account_id: optionalId,
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
});
export type JournalPageQuery = z.infer<typeof journalPageQuerySchema>;

export const accountStatementQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const periodSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر بصيغة YYYY-MM."),
  notes: optionalText,
});
