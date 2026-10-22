import { z } from "zod";
import {
  RENTAL_PROPERTY_TYPES,
  RENT_PERIODS,
} from "../../shared/constants/domain.js";
import {
  optionalId,
  optionalNumber,
  optionalText,
} from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";

export const rentalRequestPayloadSchema = z
  .object({
    person_id: z.coerce.number().int().positive(),
    property_type: z.enum(RENTAL_PROPERTY_TYPES),
    rent_period: z.enum(RENT_PERIODS).optional().nullable(),
    budget_min: optionalNumber,
    budget_max: optionalNumber,
    area_unit: optionalText,
    area_min: optionalNumber,
    area_max: optionalNumber,
    floors_count: z.coerce.number().int().nonnegative().optional().nullable(),
    rooms_count: z.coerce.number().int().nonnegative().optional().nullable(),
    bathrooms_count: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional()
      .nullable(),
    governorate_id: optionalId,
    district_id: optionalId,
    neighborhood_id: optionalId,
    governorate: optionalText,
    district: optionalText,
    neighborhood: optionalText,
    amenities: z.record(z.string(), z.unknown()).default({}),
    other_requirements: optionalText,
    status: z.enum(["open", "matched", "closed", "archived"]).default("open"),
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    if (
      value.budget_min !== null &&
      value.budget_min !== undefined &&
      value.budget_max !== null &&
      value.budget_max !== undefined &&
      value.budget_min > value.budget_max
    )
      ctx.addIssue({
        code: "custom",
        path: ["budget_max"],
        message: "الحد الأعلى للميزانية يجب أن يكون أكبر من الحد الأدنى.",
      });
    if (
      value.area_min !== null &&
      value.area_min !== undefined &&
      value.area_max !== null &&
      value.area_max !== undefined &&
      value.area_min > value.area_max
    )
      ctx.addIssue({
        code: "custom",
        path: ["area_max"],
        message: "الحد الأعلى للمساحة يجب أن يكون أكبر من الحد الأدنى.",
      });
  });

export const rentalRequestFiltersSchema = z.object({
  person_id: z.coerce.number().int().positive().optional(),
  property_type: z.enum(RENTAL_PROPERTY_TYPES).optional(),
  rent_period: z.enum(RENT_PERIODS).optional(),
  status: z.enum(["open", "matched", "closed", "archived"]).optional(),
  governorate_id: z.coerce.number().int().positive().optional(),
  district_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().optional(),
});

// مفاتيح الترتيب المسموحة في /rental-requests/paged (أعمدة جدول الطلبات).
export const RENTAL_REQUEST_SORT_KEYS = [
  "updated_at",
  "created_at",
  "code",
  "person_name",
  "property_type",
  "rent_period",
  "budget_max",
  "district",
  "status",
] as const;

export const rentalRequestPageQuerySchema = rentalRequestFiltersSchema.extend({
  ...pageFields,
  sort_by: z.enum(RENTAL_REQUEST_SORT_KEYS).default("updated_at"),
});

export type RentalRequestPayload = z.infer<typeof rentalRequestPayloadSchema>;
export type RentalRequestFilters = z.infer<typeof rentalRequestFiltersSchema>;
export type RentalRequestPageQuery = z.infer<
  typeof rentalRequestPageQuerySchema
>;
export type RentalRequestSortKey = (typeof RENTAL_REQUEST_SORT_KEYS)[number];
