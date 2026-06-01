import { z } from "zod";

export const rolePayloadSchema = z.object({
  name: z.string().trim().min(2),
  description: z.string().trim().optional().nullable()
});

export const rolePermissionsSchema = z.object({
  permission_ids: z.array(z.coerce.number().int().positive()).default([])
});

export type RolePayload = z.infer<typeof rolePayloadSchema>;
