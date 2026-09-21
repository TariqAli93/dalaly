import { z } from "zod";

const optionalText = z.string().trim().optional().nullable().transform((value) => value || null);
export const documentPayloadSchema = z.object({
  customer_id: z.coerce.number().int().positive(),
  document_type_id: z.coerce.number().int().positive().optional().nullable(),
  document_name: z.string().trim().min(1),
  data: z.string().min(1),
  file_type: z.string().trim().min(1).default("application/octet-stream"),
  original_name: optionalText,
  expires_at: z.coerce.date().optional().nullable(),
  notes: optionalText,
});
export const documentUpdateSchema = z.object({
  document_type_id: z.coerce.number().int().positive().optional().nullable(),
  document_name: z.string().trim().min(1),
  expires_at: z.coerce.date().optional().nullable(),
  status: z.enum(["active", "archived"]).default("active"),
  notes: optionalText,
});
export const documentFiltersSchema = z.object({
  customer_id: z.coerce.number().int().positive().optional(),
  document_type_id: z.coerce.number().int().positive().optional(),
  status: z.enum(["active", "archived", "expired"]).optional(),
});
export const documentTypePayloadSchema = z.object({
  key: z.string().trim().min(1).regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(1),
  transaction_scope: z.enum(["general", "buy", "sell", "rent", "lease"]).default("general"),
  is_required: z.coerce.boolean().default(false),
  is_active: z.coerce.boolean().default(true),
});
export type DocumentPayload = z.infer<typeof documentPayloadSchema>;
export type DocumentUpdate = z.infer<typeof documentUpdateSchema>;
export type DocumentFilters = z.infer<typeof documentFiltersSchema>;
export type DocumentTypePayload = z.infer<typeof documentTypePayloadSchema>;
