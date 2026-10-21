import { z } from "zod";

export const FOLLOWUP_TYPES = [
  "phone_call",
  "meeting",
  "visit",
  "negotiation",
  "other",
] as const;

export const followupPayloadSchema = z.object({
  type: z.enum(FOLLOWUP_TYPES),
  notes: z.string().trim().optional().nullable(),
  scheduled_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type FollowupPayload = z.infer<typeof followupPayloadSchema>;

/** موعد المتابعة كتاريخ، أو null عند غيابه أو عدم صلاحيته. */
export function normalizeScheduledAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
