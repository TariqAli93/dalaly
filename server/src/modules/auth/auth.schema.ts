import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  pin: z.string().trim().min(4).max(12)
});

export const setupAdminSchema = z.object({
  username: z.string().trim().min(3),
  pin: z.string().trim().min(4).max(12)
});

export const changePinSchema = z.object({
  current_pin: z.string().trim().min(4).max(12),
  new_pin: z.string().trim().min(4).max(12)
});
