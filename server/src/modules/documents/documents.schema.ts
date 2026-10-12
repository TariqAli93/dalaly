import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null);

export const identityDocumentPayloadSchema = z.object({
  person_id: z.coerce.number().int().positive(),
  document_type_id: z.coerce.number().int().positive().optional().nullable(),
  document_name: z.string().trim().min(1),
  document_number: optionalText,
  document_side: z.enum(["front", "back", "both", "unspecified"]).optional(),
  data: z.string().min(1),
  file_type: z.string().trim().min(1).default("application/octet-stream"),
  original_name: optionalText,
  expires_at: z.coerce.date().optional().nullable(),
  notes: optionalText,
});

export const identityDocumentUpdateSchema = z.object({
  document_type_id: z.coerce.number().int().positive().optional().nullable(),
  document_name: z.string().trim().min(1),
  document_number: optionalText,
  document_side: z.enum(["front", "back", "both", "unspecified"]).optional(),
  expires_at: z.coerce.date().optional().nullable(),
  status: z.enum(["active", "archived"]).default("active"),
  notes: optionalText,
});

export const documentFiltersSchema = z.object({
  person_id: z.coerce.number().int().positive().optional(),
  document_type_id: z.coerce.number().int().positive().optional(),
  status: z.enum(["active", "archived", "expired"]).optional(),
});

export const documentTypePayloadSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9_]+$/),
  // Document type names are displayed directly in the Arabic RTL interface.
  name: z
    .string()
    .trim()
    .min(1)
    .regex(/[\u0600-\u06ff]/, "يجب أن يكون اسم نوع المستمسك باللغة العربية."),
  transaction_scope: z.enum(["general", "sale", "rent"]).default("general"),
  is_required: z.coerce.boolean().default(false),
  is_active: z.coerce.boolean().default(true),
});

export type IdentityDocumentPayload = z.infer<
  typeof identityDocumentPayloadSchema
>;
export type IdentityDocumentUpdate = z.infer<
  typeof identityDocumentUpdateSchema
>;
export type DocumentFilters = z.infer<typeof documentFiltersSchema>;
export type DocumentTypePayload = z.infer<typeof documentTypePayloadSchema>;
