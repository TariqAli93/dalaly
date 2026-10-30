import { z } from "zod";
import {
  CURRENCIES,
  moneyField,
  optionalMoneyField,
} from "../../shared/money.js";
import {
  booleanField,
  optionalId,
  optionalText,
} from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";
import { LEASE_FREQUENCIES } from "./leases.rules.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD.");
const id = z.coerce.number().int().positive();

/** What a schedule is computed from. */
const scheduleFields = {
  currency: z.enum(CURRENCIES),
  rent_amount: moneyField,
  frequency: z.enum(LEASE_FREQUENCIES),
  start_date: isoDate,
  end_date: isoDate,
};

export const leaseScheduleSchema = z.object(scheduleFields);

/**
 * A lease entered by hand: one in force without a contract in the system.
 * One from a contract is activated with leaseActivateSchema instead.
 */
export const leasePayloadSchema = z.object({
  ...scheduleFields,
  rental_id: optionalId,
  landlord_person_id: id,
  tenant_person_id: id,
  deposit: optionalMoneyField,
  office_collects: booleanField.default(false),
  notes: optionalText,
});
export type LeasePayload = z.infer<typeof leasePayloadSchema>;

/** Puts an issued rent contract in force, with the terms of its revision. */
export const leaseActivateSchema = z.object({
  agreement_id: id,
  office_collects: booleanField.default(false),
  notes: optionalText,
});

export const leaseCancelSchema = z.object({
  reason: z.string().trim().min(1, "اذكر سبب إلغاء الإيجار.").max(300),
});

export const LEASE_STATES = [
  "upcoming",
  "current",
  "ended",
  "cancelled",
] as const;

export const leasePageQuerySchema = z.object({
  ...pageFields,
  sort_by: z
    .enum(["start_date", "end_date", "code", "created_at"])
    .default("start_date"),
  state: z.enum(LEASE_STATES).optional(),
  person_id: optionalId,
  rental_id: optionalId,
  q: z.string().trim().max(100).optional(),
});
export type LeasePageQuery = z.infer<typeof leasePageQuerySchema>;
