import { z } from "zod";
import { optionalId, optionalText } from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";

export const PERSON_ROLES = [
  "buyer",
  "seller",
  "tenant",
  "landlord",
  "owner",
  "investor",
  "other",
] as const;
export const PERSON_SOURCES = [
  "walk_in",
  "phone",
  "referral",
  "social",
  "listing_ad",
  "other",
] as const;

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
  // Left out, these keep their value (older clients do not send them).
  roles: z
    .array(z.enum(PERSON_ROLES))
    .max(PERSON_ROLES.length)
    .transform((roles) => [...new Set(roles)])
    .optional(),
  source: z.enum(PERSON_SOURCES).nullable().optional(),
  assigned_user_id: optionalId,
});

export const personFiltersSchema = z.object({
  q: z.string().trim().optional(),
  person_type: z.enum(["individual", "company", "other"]).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  role: z.enum(PERSON_ROLES).optional(),
  /** "me", "unassigned", or a user id. */
  assigned: z
    .union([z.enum(["me", "unassigned"]), z.coerce.number().int().positive()])
    .optional(),
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

/** Numbers and ID to look for in other customers before saving one. */
export const personDuplicatesQuerySchema = z.object({
  phone: z.string().trim().max(40).optional(),
  phone_secondary: z.string().trim().max(40).optional(),
  national_id: z.string().trim().max(60).optional(),
  exclude_id: z.coerce.number().int().positive().optional(),
});

export type PersonPayload = z.infer<typeof personPayloadSchema>;
export type PersonFilters = z.infer<typeof personFiltersSchema>;
export type PersonPageQuery = z.infer<typeof personPageQuerySchema>;
export type PersonSortKey = (typeof PERSON_SORT_KEYS)[number];
