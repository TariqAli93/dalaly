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

const booleanInputs = new Map<unknown, boolean>([
  ["true", true],
  ["false", false],
  ["1", true],
  ["0", false],
  [1, true],
  [0, false],
  [null, false],
]);

/**
 * حقل منطقي. z.coerce.boolean() هو Boolean(value)، فيجعل النص "false" صحيحاً؛
 * هذا يقبل true/false و"true"/"false" و1/0 (null = false) ويرفض ما سواها.
 */
export const booleanField = z.preprocess(
  (value) =>
    booleanInputs.get(
      typeof value === "string" ? value.trim().toLowerCase() : value,
    ) ?? value,
  z.boolean(),
);
