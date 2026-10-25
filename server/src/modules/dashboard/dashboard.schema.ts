import { z } from "zod";

/** The idle periods the dashboard offers for "listings without activity". */
export const STALE_DAYS = [14, 30, 60, 90] as const;

export const overviewQuerySchema = z.object({
  stale_days: z.coerce
    .number()
    .int()
    .refine((value) => (STALE_DAYS as readonly number[]).includes(value), {
      message: "مدة الركود غير مدعومة.",
    })
    .default(30),
});

export const MATCH_KINDS = ["all", "sale", "rental"] as const;

export const matchingQuerySchema = z.object({
  kind: z.enum(MATCH_KINDS).default("all"),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(50).default(8),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type MatchingQuery = z.infer<typeof matchingQuerySchema>;
