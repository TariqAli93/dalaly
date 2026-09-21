import { z } from "zod";
import { AREA_UNITS, RENTAL_PROPERTY_TYPES, RENTAL_STATUSES, RENT_PERIODS } from "../../shared/constants/domain.js";

const optionalText = z.string().trim().optional().nullable().transform((value) => value || null);
const optionalCount = z.coerce.number().int().nonnegative().optional().nullable();
const optionalId = z.coerce.number().int().positive().optional().nullable();

export const rentalPayloadSchema = z.object({
  name: optionalText,
  property_type: z.enum(RENTAL_PROPERTY_TYPES),
  rent_price: z.coerce.number().positive(),
  rent_period: z.enum(RENT_PERIODS),
  area_value: z.coerce.number().positive(),
  area_unit: z.enum(AREA_UNITS),
  floors_count: optionalCount,
  rooms_count: optionalCount,
  bathrooms_count: optionalCount,
  amenities: z.record(z.string(), z.unknown()).default({}),
  other_details: optionalText,
  governorate_id: optionalId,
  district_id: optionalId,
  neighborhood_id: optionalId,
  governorate: optionalText,
  district: optionalText,
  neighborhood: optionalText,
  address_details: optionalText,
  owner_customer_id: optionalId,
  owner_name: z.string().trim().min(1),
  owner_phone: z.string().trim().min(1),
  owner_notes: optionalText,
  status: z.enum(RENTAL_STATUSES).default("available"),
  is_negotiable: z.coerce.boolean().default(false),
  notes: optionalText
});

export const rentalFiltersSchema = z.object({
  property_type: z.enum(RENTAL_PROPERTY_TYPES).optional(),
  rent_period: z.enum(RENT_PERIODS).optional(),
  rent_price_min: z.coerce.number().nonnegative().optional(),
  rent_price_max: z.coerce.number().nonnegative().optional(),
  area_min: z.coerce.number().nonnegative().optional(),
  area_max: z.coerce.number().nonnegative().optional(),
  rooms_count: z.coerce.number().int().nonnegative().optional(),
  bathrooms_count: z.coerce.number().int().nonnegative().optional(),
  floors_count: z.coerce.number().int().nonnegative().optional(),
  governorate_id: z.coerce.number().int().positive().optional(),
  district_id: z.coerce.number().int().positive().optional(),
  neighborhood_id: z.coerce.number().int().positive().optional(),
  status: z.enum(RENTAL_STATUSES).optional(),
  negotiable: z.enum(["true", "false"]).optional(),
  amenities: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});

export type RentalPayload = z.infer<typeof rentalPayloadSchema>;
export type RentalFilters = z.infer<typeof rentalFiltersSchema>;
