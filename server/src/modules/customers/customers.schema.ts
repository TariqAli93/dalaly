import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || null);

export const customerPayloadSchema = z.object({
  full_name: z.string().trim().min(1),
  phone_primary: z.string().trim().min(1),
  phone_secondary: optionalText,
  email: optionalText,
  address: optionalText,
  national_id: optionalText,
  customer_type: z
    .enum(["individual", "company", "other"])
    .default("individual"),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  notes: optionalText,
});

export const customerFiltersSchema = z.object({
  q: z.string().trim().optional(),
  customer_type: z.enum(["individual", "company", "other"]).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
});

export type CustomerPayload = z.infer<typeof customerPayloadSchema>;
export type CustomerFilters = z.infer<typeof customerFiltersSchema>;
