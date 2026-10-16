import { z } from "zod";

export const legalContextSchema = z
  .object({
    jurisdiction: z.enum(["iq_federal", "iq_kurdistan"]).default("iq_federal"),
    transaction_kind: z
      .enum(["lease", "preliminary_sale", "registered_transfer_record"])
      .optional(),
    registration_reference: z.string().trim().max(500).default(""),
    intended_use: z.string().trim().max(500).default(""),
  })
  .strict();
export const conditionSchema = z
  .object({
    all: z
      .array(
        z
          .object({
            field: z.enum([
              "legal_type",
              "area_unit",
              "rent_period",
              "intended_use",
              "amount",
              "paid_amount",
              "remaining_amount",
              "registration_reference",
            ]),
            op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "present"]),
            value: z
              .union([z.string().max(500), z.number().finite(), z.boolean()])
              .optional(),
          })
          .strict()
          .superRefine((v, ctx) => {
            if (v.op !== "present" && v.value === undefined)
              ctx.addIssue({ code: "custom", message: "قيمة الشرط مطلوبة." });
            if (
              ["gt", "gte", "lt", "lte"].includes(v.op) &&
              typeof v.value !== "number"
            )
              ctx.addIssue({
                code: "custom",
                message: "الشرط العددي يتطلب رقماً.",
              });
          }),
      )
      .max(20)
      .default([]),
  })
  .strict();
