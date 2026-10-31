import { z } from "zod";
import { isoDate, optionalText } from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";
import {
  BUNDLED_FONTS,
  SYSTEM_FONTS,
  TEMPLATE_KEYS,
} from "../../shared/contract-document/index.js";

/**
 * The contract document is validated field by field: unknown keys are
 * dropped, text loses control characters, numbers are bounded, images must
 * be base64 data of an image type, and field keys must look like keys. The
 * renderer never sends HTML; rich text is runs of plain text and fields.
 */

// eslint-disable-next-line no-control-regex -- text runs keep \t and \n only
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const cleanText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.replace(CONTROL, ""));

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const color = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
const FONTS = new Set<string>([...BUNDLED_FONTS, ...SYSTEM_FONTS]);
const font = z.string().refine((name) => FONTS.has(name), "خط غير مدعوم.");
const align = z.enum(["start", "center", "end", "justify"]);
const marks = {
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
};

const run = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: cleanText(20_000), ...marks }),
  z.object({
    type: z.literal("field"),
    key: z.string().regex(/^[a-z0-9_]{1,32}\.[a-z0-9_]{1,48}$/),
    ...marks,
  }),
]);
const paragraph = z.array(run).max(400);
const richText = z.array(paragraph).max(200);

const blockStyle = z
  .object({
    font_family: font.optional(),
    font_size: z.number().min(6).max(48).optional(),
    bold: z.boolean().optional(),
    color: color.optional(),
    align: align.optional(),
    line_height: z.number().min(0.8).max(3).optional(),
    space_before: z.number().min(0).max(72).optional(),
    space_after: z.number().min(0).max(72).optional(),
    indent: z.number().min(0).max(80).optional(),
    padding: z.number().min(0).max(30).optional(),
    border: z
      .object({
        width: z.number().min(0.25).max(6),
        color,
        style: z.enum(["solid", "dashed", "double"]),
        sides: z.enum(["all", "top", "bottom", "block"]),
      })
      .nullable()
      .optional(),
    background: color.nullable().optional(),
    width: z.number().min(20).max(100).optional(),
  })
  .optional();

const blockBase = {
  id,
  style: blockStyle,
  hidden: z.boolean().optional(),
  required: z.boolean().optional(),
};

/** 2 MB of base64, an image of about 1.5 MB. */
const imageData = z
  .string()
  .max(2_800_000)
  .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/);

const block = z.discriminatedUnion("type", [
  z.object({
    ...blockBase,
    type: z.literal("letterhead"),
    start: richText,
    end: richText,
    logo: z.boolean(),
    logo_width: z.number().min(10).max(80),
  }),
  z.object({
    ...blockBase,
    type: z.literal("heading"),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    text: paragraph,
  }),
  z.object({ ...blockBase, type: z.literal("text"), text: richText }),
  z.object({ ...blockBase, type: z.literal("clauses") }),
  z.object({
    ...blockBase,
    type: z.literal("table"),
    rows: z.array(z.array(richText).min(1).max(8)).min(1).max(200),
    header_row: z.boolean(),
    widths: z.array(z.number().min(0.1).max(10)).min(1).max(8),
    borders: z.boolean(),
  }),
  z.object({ ...blockBase, type: z.literal("schedule") }),
  z.object({
    ...blockBase,
    type: z.literal("signatures"),
    signers: z
      .array(z.object({ id, title: paragraph, name: paragraph }))
      .min(1)
      .max(8),
    show_date: z.boolean(),
  }),
  z.object({
    ...blockBase,
    type: z.literal("image"),
    source: z.enum(["logo", "embedded"]),
    data: imageData.nullable().optional(),
    width: z.number().min(5).max(180),
    align,
  }),
  z.object({ ...blockBase, type: z.literal("separator") }),
  z.object({ ...blockBase, type: z.literal("page_break") }),
]);

const clause = z.object({
  id,
  title: paragraph,
  body: richText,
  numbered: z.boolean(),
  hidden: z.boolean().optional(),
  required: z.boolean().optional(),
  origin: z.string().max(64).nullable().optional(),
});

const band = z.object({
  enabled: z.boolean(),
  text: paragraph,
  align,
  font_size: z.number().min(6).max(14),
  page_numbers: z.boolean().optional(),
});

export const documentSchema = z
  .object({
    schema: z.literal(1),
    page: z.object({
      size: z.literal("A4"),
      margins: z.object({
        top: z.number().min(5).max(60),
        bottom: z.number().min(5).max(60),
        start: z.number().min(5).max(60),
        end: z.number().min(5).max(60),
      }),
    }),
    header: band,
    footer: band,
    theme: z.object({
      font_family: font,
      font_size: z.number().min(8).max(24),
      line_height: z.number().min(1).max(3),
      color,
      accent: color,
      paragraph_spacing: z.number().min(0).max(36),
    }),
    clause_settings: z.object({
      numbering: z.enum(["ordinal", "number", "none"]),
      prefix: cleanText(30),
      title_style: blockStyle.default({}),
      body_style: blockStyle.default({}),
    }),
    blocks: z.array(block).min(1).max(300),
    clauses: z.array(clause).max(300),
  })
  .superRefine((document, ctx) => {
    if (document.blocks.filter((item) => item.type === "clauses").length !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "يجب أن يحتوي العقد على قسم بنود واحد.",
      });
    const ids = new Set<string>();
    for (const item of [...document.blocks, ...document.clauses]) {
      if (ids.has(item.id))
        ctx.addIssue({
          code: "custom",
          path: ["blocks"],
          message: "معرّفات عناصر العقد مكررة.",
        });
      ids.add(item.id);
    }
  });

const termDate = isoDate.nullable().default(null);
const amount = z.number().nonnegative().max(1e15).nullable().default(null);
const termText = (max = 2000) => cleanText(max).nullable().default(null);

export const termsSchema = z.object({
  contract_date: termDate,
  contract_place: termText(120),
  currency: z.enum(["IQD", "USD"]).default("IQD"),
  sale_price: amount,
  payment_terms: termText(),
  delivery_date: termDate,
  delivery_terms: termText(),
  down_payment: amount,
  installment_count: z.number().int().min(1).max(600).nullable().default(null),
  installment_frequency: z
    .enum(["monthly", "quarterly", "semi_annual", "annual"])
    .default("monthly"),
  first_due_date: termDate,
  late_terms: termText(),
  rent_amount: amount,
  rent_period: z.enum(["monthly", "semi_annual", "annual"]).default("monthly"),
  start_date: termDate,
  end_date: termDate,
  deposit: amount,
  payment_due: termText(300),
  renewal_terms: termText(),
  notice_days: z.number().int().min(0).max(3650).nullable().default(null),
  utilities_terms: termText(),
  permitted_use: termText(300),
  commission: amount,
  commission_terms: termText(),
  representatives: z
    .partialRecord(
      z.enum(["seller", "buyer", "landlord", "tenant"]),
      z.object({ name: termText(200), capacity: termText(300) }),
    )
    .default({}),
  witnesses: z
    .array(
      z.object({
        name: termText(200),
        national_id: termText(60),
        address: termText(300),
      }),
    )
    .max(2)
    .default([]),
});

export const templateKeySchema = z.enum(TEMPLATE_KEYS);

export const createAgreementSchema = z.object({
  template_key: templateKeySchema,
});

const partiesSchema = z
  .array(
    z.object({
      role: z.enum(["seller", "buyer", "landlord", "tenant"]),
      person_id: z.number().int().positive(),
    }),
  )
  .max(2);

/** A draft save. Every part is optional; base_rev must be the edited one. */
export const saveAgreementSchema = z.object({
  base_rev: z.number().int().positive(),
  document: documentSchema.optional(),
  terms: termsSchema.optional(),
  parties: partiesSchema.optional(),
  property_id: z.number().int().positive().nullable().optional(),
  rental_id: z.number().int().positive().nullable().optional(),
});

export const issueAgreementSchema = z.object({
  base_rev: z.number().int().positive(),
});

export const statusActionSchema = z.object({
  action: z.enum(["submit_review", "return_draft"]),
  base_rev: z.number().int().positive(),
});

export const reasonSchema = z.object({
  reason: cleanText(1000).pipe(z.string().trim().min(3)),
});

export const exportRecordSchema = z.object({
  format: z.enum(["pdf", "docx", "print"]),
  revision: z.number().int().positive().nullable().default(null),
  file_name: cleanText(260).nullable().default(null),
});

export const docxQuerySchema = z.object({
  revision: z.coerce.number().int().positive().optional(),
});

export const AGREEMENT_SORT_KEYS = [
  "updated_at",
  "created_at",
  "code",
  "status",
  "contract_date",
] as const;

export const agreementPageQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["draft", "review", "issued", "cancelled"]).optional(),
  template_key: templateKeySchema.optional(),
  person_id: z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional(),
  rental_id: z.coerce.number().int().positive().optional(),
  ...pageFields,
  sort_by: z.enum(AGREEMENT_SORT_KEYS).default("updated_at"),
});

export const saveTemplateSchema = z.object({
  base_version: z.number().int().nonnegative(),
  definition: documentSchema,
  note: optionalText,
});

export const resetTemplateSchema = z.object({
  base_version: z.number().int().nonnegative(),
  mode: z.enum(["design", "all"]),
});

export const restoreVersionSchema = z.object({
  base_version: z.number().int().nonnegative(),
});

export type SaveAgreementPayload = z.infer<typeof saveAgreementSchema>;
export type AgreementPageQuery = z.infer<typeof agreementPageQuerySchema>;
export type AgreementSortKey = (typeof AGREEMENT_SORT_KEYS)[number];
