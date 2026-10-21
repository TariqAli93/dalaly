import { z } from "zod";

/** نص اختياري: يُقصّ، والنص الفارغ يُخزَّن null. */
export const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null);

export const optionalId = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .nullable();

export const optionalCount = z.coerce
  .number()
  .int()
  .nonnegative()
  .optional()
  .nullable();

export const optionalNumber = z.coerce
  .number()
  .nonnegative()
  .optional()
  .nullable();
