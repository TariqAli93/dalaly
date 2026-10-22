import { z } from "zod";
import { optionalText } from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";

export const personPayloadSchema = z.object({
  full_name: z.string().trim().min(1),
  phone_primary: optionalText,
  phone_secondary: optionalText,
  email: optionalText,
  address: optionalText,
  national_id: optionalText,
  governorate: optionalText,
  district: optionalText,
  neighborhood: optionalText,
  alley: optionalText,
  house_number: optionalText,
  residence_card_number: optionalText,

  person_type: z.enum(["individual", "company", "other"]).default("individual"),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  notes: optionalText,
});

export const personFiltersSchema = z.object({
  q: z.string().trim().optional(),
  person_type: z.enum(["individual", "company", "other"]).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
});

// مفاتيح الترتيب المسموحة في /people/paged.
export const PERSON_SORT_KEYS = [
  "updated_at",
  "created_at",
  "full_name",
  "code",
  "phone_primary",
  "person_type",
  "status",
] as const;

// صفحة من الدليل: نفس الفلاتر مع صفحة وحجم وترتيب (الافتراضي آخر تحديث).
export const personPageQuerySchema = personFiltersSchema.extend({
  ...pageFields,
  sort_by: z.enum(PERSON_SORT_KEYS).default("updated_at"),
});

export type PersonPayload = z.infer<typeof personPayloadSchema>;
export type PersonFilters = z.infer<typeof personFiltersSchema>;
export type PersonPageQuery = z.infer<typeof personPageQuerySchema>;
export type PersonSortKey = (typeof PERSON_SORT_KEYS)[number];
