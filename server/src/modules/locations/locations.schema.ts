import { z } from "zod";

export const governoratePayloadSchema = z.object({
  name: z.string().trim().min(1),
  is_active: z.boolean().default(true)
});

export const districtPayloadSchema = z.object({
  governorate_id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1),
  is_active: z.boolean().default(true)
});

export const districtUpdateSchema = z.object({
  name: z.string().trim().min(1),
  is_active: z.boolean().default(true)
});

export type GovernoratePayload = z.infer<typeof governoratePayloadSchema>;
export type DistrictPayload = z.infer<typeof districtPayloadSchema>;
export type DistrictUpdatePayload = z.infer<typeof districtUpdateSchema>;
