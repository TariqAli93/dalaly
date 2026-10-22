import { z } from "zod";
import { optionalText } from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";

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
  // الحالة المحسوبة: "active" = نشط غير منتهٍ، "expired" = نشط انتهى تاريخه.
  status: z.enum(["active", "archived", "expired"]).optional(),
});

// مفاتيح الترتيب المسموحة في /documents/paged.
export const DOCUMENT_SORT_KEYS = [
  "uploaded_at",
  "expires_at",
  "code",
  "person_name",
  "document_type_name",
  "document_name",
  "document_number",
  "computed_status",
] as const;

export const documentPageQuerySchema = documentFiltersSchema.extend({
  ...pageFields,
  sort_by: z.enum(DOCUMENT_SORT_KEYS).default("uploaded_at"),
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
export type DocumentPageQuery = z.infer<typeof documentPageQuerySchema>;
export type DocumentSortKey = (typeof DOCUMENT_SORT_KEYS)[number];
export type DocumentTypePayload = z.infer<typeof documentTypePayloadSchema>;
