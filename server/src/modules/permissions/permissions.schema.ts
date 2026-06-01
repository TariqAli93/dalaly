import { z } from "zod";

export const permissionPayloadSchema = z.object({
  key: z.string().trim().min(3),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  module: z.string().trim().min(1)
});

export type PermissionPayload = z.infer<typeof permissionPayloadSchema>;
