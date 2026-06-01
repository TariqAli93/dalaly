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
    address_details: optionalText,
    owner_name: z.string().trim().min(1),
    owner_phone: z.string().trim().min(1),
    owner_notes: optionalText,
    status: z.enum(STATUSES).default("available"),
    notes: optionalText
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
  price_min: z.coerce.number().optional(),
  price_max: z.coerce.number().optional(),
  q: z.string().optional()
});

export type PropertyPayload = z.infer<typeof propertyPayloadSchema>;
export type PropertyFilters = z.infer<typeof propertyFiltersSchema>;
