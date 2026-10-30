import { z } from "zod";
import { CURRENCIES } from "../../shared/money.js";
import { optionalId } from "../../shared/validation/fields.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD.")
  .refine(
    (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
    "تاريخ غير صحيح.",
  );

const currency = z.enum(CURRENCIES).optional();

/** A period: from `from` to `to`, both included (defaults: the year to date). */
const periodFields = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  currency,
};
const orderedPeriod = (value: { from?: string; to?: string }) =>
  !value.from || !value.to || value.from <= value.to;
const ORDER_MESSAGE = {
  message: "بداية الفترة بعد نهايتها.",
  path: ["from"],
};

export const periodQuerySchema = z
  .object(periodFields)
  .refine(orderedPeriod, ORDER_MESSAGE);
export type PeriodQuery = z.infer<typeof periodQuerySchema>;

/** Income and expenses: optionally month by month. */
export const incomeStatementQuerySchema = z
  .object({ ...periodFields, group: z.enum(["none", "month"]).default("none") })
  .refine(orderedPeriod, ORDER_MESSAGE);
export type IncomeStatementQuery = z.infer<typeof incomeStatementQuerySchema>;

/** Commissions recorded in a period, optionally one employee's. */
export const commissionsReportQuerySchema = z
  .object({ ...periodFields, user_id: optionalId })
  .refine(orderedPeriod, ORDER_MESSAGE);
export type CommissionsReportQuery = z.infer<
  typeof commissionsReportQuerySchema
>;

/** A position on a day (defaults to the office's today). */
export const asOfQuerySchema = z.object({
  as_of: isoDate.optional(),
  currency,
});
export type AsOfQuery = z.infer<typeof asOfQuerySchema>;
