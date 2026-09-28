import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null);

export const personPayloadSchema = z.object({
  full_name: z.string().trim().min(1),
  phone_primary: optionalText,
  phone_secondary: optionalText,
  email: optionalText,
  address: optionalText,
  national_id: optionalText,
  person_type: z.enum(["individual", "company", "other"]).default("individual"),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  notes: optionalText,
});

export const personFiltersSchema = z.object({
  q: z.string().trim().optional(),
  person_type: z.enum(["individual", "company", "other"]).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
});

export type PersonPayload = z.infer<typeof personPayloadSchema>;
export type PersonFilters = z.infer<typeof personFiltersSchema>;
