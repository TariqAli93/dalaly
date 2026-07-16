import { z } from "zod";
import {
  AREA_UNITS,
  LEGAL_TYPES,
  PRICING_METHODS,
  PROPERTY_TYPES,
  STATUSES
} from "../../shared/constants/domain.js";

const optionalText = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const optionalId = z.coerce.number().int().positive().optional().nullable();
const optionalCount = z.coerce.number().int().nonnegative().optional().nullable();

export const propertyPayloadSchema = z
  .object({
    property_type: z.enum(PROPERTY_TYPES),
    legal_type: z.enum(LEGAL_TYPES),
    area_value: z.coerce.number().positive(),
    area_unit: z.enum(AREA_UNITS),
    pricing_method: z.enum(PRICING_METHODS),
    unit_price: z.coerce.number().nonnegative().optional().nullable(),
    total_price: z.coerce.number().nonnegative().optional().nullable(),
    governorate: optionalText,
    city: optionalText,
    district: optionalText,
    governorate_id: optionalId,
    district_id: optionalId,
    neighborhood_id: optionalId,
    governorate_text: optionalText,
    district_text: optionalText,
    neighborhood_text: optionalText,
    address_details: optionalText,
    owner_name: z.string().trim().min(1),
    owner_phone: z.string().trim().min(1),
    owner_notes: optionalText,
    status: z.enum(STATUSES).default("available"),
    notes: optionalText,
    // حقول عراقية اختيارية إضافية
    nazal: optionalText,
    plot_number: optionalText,
    plot_letter: optionalText,
    subdistrict_number: optionalText,
    subdistrict_name: optionalText,
    mahalla: optionalText,
    alley: optionalText,
    house_number: optionalText,
    nearest_landmark: optionalText,
    street_width: optionalText,
    frontage: optionalText,
    rooms_count: optionalCount,
    bathrooms_count: optionalCount,
    is_negotiable: z.coerce.boolean().optional().default(false)
  })
  .superRefine((value, ctx) => {
    if (
      value.pricing_method !== "سعر إجمالي مباشر" &&
      (!value.unit_price || value.unit_price <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["unit_price"],
        message: "سعر الوحدة مطلوب ويجب أن يكون أكبر من صفر."
      });
    }

    if (
      value.pricing_method === "سعر إجمالي مباشر" &&
      (!value.total_price || value.total_price <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["total_price"],
        message: "السعر الإجمالي المباشر مطلوب ويجب أن يكون أكبر من صفر."
      });
    }
  });

export const propertyFiltersSchema = z.object({
  property_type: z.enum(PROPERTY_TYPES).optional(),
  legal_type: z.enum(LEGAL_TYPES).optional(),
  area_unit: z.enum(AREA_UNITS).optional(),
  pricing_method: z.enum(PRICING_METHODS).optional(),
  status: z.enum(STATUSES).optional(),
  district: z.string().optional(),
  governorate_id: z.coerce.number().int().positive().optional(),
  district_id: z.coerce.number().int().positive().optional(),
  neighborhood_id: z.coerce.number().int().positive().optional(),
  plot_number: z.string().optional(),
  plot_letter: z.string().optional(),
  area_min: z.coerce.number().optional(),
  area_max: z.coerce.number().optional(),
  price_min: z.coerce.number().optional(),
  price_max: z.coerce.number().optional(),
  q: z.string().optional(),
  search: z.string().optional(),
  // جاهزية الـ pagination من قاعدة البيانات (اختياري؛ بدونها تُرجع كل النتائج).
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});

export type PropertyPayload = z.infer<typeof propertyPayloadSchema>;
export type PropertyFilters = z.infer<typeof propertyFiltersSchema>;
