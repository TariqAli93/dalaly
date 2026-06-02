import { z } from "zod";

export const FOLLOWUP_TYPES = [
  "phone_call",
  "meeting",
  "visit",
  "negotiation",
  "other"
] as const;

export const followupPayloadSchema = z.object({
  type: z.enum(FOLLOWUP_TYPES),
  notes: z.string().trim().optional().nullable(),
  scheduled_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable()
    .or(z.literal(""))
});

export type FollowupPayload = z.infer<typeof followupPayloadSchema>;
