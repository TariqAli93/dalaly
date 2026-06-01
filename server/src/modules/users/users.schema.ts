import { z } from "zod";

export const createUserSchema = z.object({
  username: z.string().trim().min(3),
  pin: z.string().trim().min(4).max(12),
  display_name: z.string().trim().min(1),
  is_active: z.boolean().default(true),
  role_ids: z.array(z.coerce.number().int().positive()).default([])
});

export const updateUserSchema = z.object({
  username: z.string().trim().min(3),
  pin: z.string().trim().min(4).max(12).optional().or(z.literal("")),
  display_name: z.string().trim().min(1),
  is_active: z.boolean().default(true),
  role_ids: z.array(z.coerce.number().int().positive()).default([])
});

export type CreateUserPayload = z.infer<typeof createUserSchema>;
export type UpdateUserPayload = z.infer<typeof updateUserSchema>;
