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
export const legalClauseSchema = z
  .object({
    clause_code: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),
    clause_title: z.string().trim().min(1).max(200),
    clause_content_ar: z
      .string()
      .trim()
      .min(1)
      .max(20000)
      .regex(/[\u0600-\u06ff]/),
    clause_order: z.number().int().nonnegative(),
    is_required: z.boolean().default(true),
    conditions_json: conditionSchema.default({ all: [] }),
    source_clause_id: z.number().int().positive().nullable().optional(),
  })
  .strict();
export const legalRevisionSchema = z
  .object({
    contract_type: z.enum(["sale", "rental"]),
    property_type: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((v) => v !== "*", "حدد جنس العقار صراحة."),
    jurisdiction: z.enum(["iq_federal", "iq_kurdistan"]),
    transaction_kind: z.enum([
      "lease",
      "preliminary_sale",
      "registered_transfer_record",
    ]),
    title: z.string().trim().min(1).max(200),
    legal_basis: z.string().trim().max(10000),
    applicability_notes: z.string().trim().max(10000),
    revision_note: z.string().trim().min(1).max(2000),
    clauses: z.array(legalClauseSchema).max(100),
    target_at: z.iso.datetime({ offset: true }).nullable().optional(),
    priority: z.number().int().min(0).max(2).default(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.contract_type === "rental") !== (v.transaction_kind === "lease"))
      ctx.addIssue({
        code: "custom",
        message: "نوع المعاملة لا يطابق نوع العقد.",
      });
    if (new Set(v.clauses.map((c) => c.clause_code)).size !== v.clauses.length)
      ctx.addIssue({ code: "custom", message: "رموز البنود مكررة." });
  });
export const legalDecisionSchema = z
  .object({
    action: z.enum([
      "submit",
      "approve",
      "approve_publish",
      "publish",
      "archive",
      "default",
      "reject",
    ]),
    comment: z.string().trim().min(1).max(5000),
  })
  .strict();
export type LegalRevisionPayload = z.infer<typeof legalRevisionSchema>;
