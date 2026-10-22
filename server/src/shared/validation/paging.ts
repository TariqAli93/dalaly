import { z } from "zod";

/** أكبر حجم صفحة تقبله القوائم المقسّمة (أكبر خيار في جداول الواجهة). */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;

/**
 * حقول الصفحة المشتركة لقوائم /paged. مفتاح الترتيب sort_by يعرّفه كل module
 * بقائمته البيضاء الخاصة.
 */
export const pageFields = {
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
  favorites_only: z.enum(["true", "false"]).optional(),
};
