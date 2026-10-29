import { z } from "zod";
import { optionalId } from "../../shared/validation/fields.js";
import { taskFieldsSchema } from "../tasks/tasks.schema.js";

/** A customer's activity or task; it may also concern one of their requests. */
export const activityPayloadSchema = taskFieldsSchema.extend({
  person_id: z.coerce.number().int().positive(),
  purchase_request_id: optionalId,
  rental_request_id: optionalId,
  /** A step of one of this customer's deals (a viewing, a negotiation). */
  deal_id: optionalId,
});

export const activityFiltersSchema = z
  .object({
    person_id: z.coerce.number().int().positive().optional(),
    purchase_request_id: z.coerce.number().int().positive().optional(),
    rental_request_id: z.coerce.number().int().positive().optional(),
    deal_id: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      value.person_id ||
      value.purchase_request_id ||
      value.rental_request_id ||
      value.deal_id,
    "حدد الزبون أو الطلب أو الصفقة.",
  );

export type ActivityPayload = z.infer<typeof activityPayloadSchema>;
export type ActivityFilters = z.infer<typeof activityFiltersSchema>;
