import { z } from "zod";
import { isActivePermissionKey } from "../rbac/key-policy.js";

export const permissionPayloadSchema = z.object({
  key: z
    .string()
    .trim()
    .min(3)
    .refine(
      isActivePermissionKey,
      "مساحة أسماء هذه الصلاحية متقاعدة ولا يمكن إعادة استخدامها.",
    ),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  module: z.string().trim().min(1),
});

export type PermissionPayload = z.infer<typeof permissionPayloadSchema>;
