import { z } from "zod";
import {
  CURRENCIES,
  moneyField,
  optionalMoneyField,
} from "../../shared/money.js";
import {
  isoDate,
  optionalId,
  optionalText,
} from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";
import { TASK_PRIORITIES } from "../tasks/tasks.schema.js";
import { DEAL_STAGES } from "./deals.rules.js";
import { TEMPLATE_KEYS } from "../../shared/contract-document/index.js";

const closeDate = isoDate
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/**
 * A deal's own fields. The stage is not here: it moves through
 * POST /deals/:id/stage, which checks the move and records it.
 */
export const dealPayloadSchema = z.object({
  deal_type: z.enum(["sale", "rent"]),
  title: optionalText,
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  property_id: optionalId,
  rental_id: optionalId,
  client_person_id: z.coerce.number().int().positive(),
  owner_person_id: optionalId,
  assigned_user_id: optionalId,
  purchase_request_id: optionalId,
  rental_request_id: optionalId,
  currency: z.enum(CURRENCIES).default("IQD"),
  asking_price: optionalMoneyField,
  agreed_price: optionalMoneyField,
  expected_commission: optionalMoneyField,
  expected_close_date: closeDate,
  notes: optionalText,
});

export const dealStageSchema = z.object({
  stage: z.enum(DEAL_STAGES),
  reason: optionalText,
  lost_reason: optionalText,
});

export const dealOfferSchema = z.object({
  party: z.enum(["client", "owner"]),
  amount: moneyField,
  notes: optionalText,
});

export const dealOfferStatusSchema = z.object({
  status: z.enum(["countered", "accepted", "rejected", "withdrawn"]),
});

/** The contract template a deal's contract is prepared from. */
export const dealAgreementSchema = z.object({
  template_key: z.enum(TEMPLATE_KEYS),
});

export const DEAL_SORT_KEYS = [
  "updated_at",
  "created_at",
  "stage_changed_at",
  "expected_close_date",
  "asking_price",
  "agreed_price",
  "code",
] as const;

export const dealFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  deal_type: z.enum(["sale", "rent"]).optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  /** "open": any open stage; "closed": won, lost or cancelled. */
  state: z.enum(["open", "closed"]).optional(),
  assigned: z
    .union([z.enum(["me", "unassigned"]), z.coerce.number().int().positive()])
    .optional(),
  person_id: z.coerce.number().int().positive().optional(),
  property_id: z.coerce.number().int().positive().optional(),
  rental_id: z.coerce.number().int().positive().optional(),
  /** Open deals with no stage move and no activity for this many days. */
  stalled_days: z.coerce.number().int().min(1).max(365).optional(),
});

export const dealPageQuerySchema = dealFiltersSchema.extend({
  ...pageFields,
  sort_by: z.enum(DEAL_SORT_KEYS).default("updated_at"),
});

export type DealPayload = z.infer<typeof dealPayloadSchema>;
export type DealFilters = z.infer<typeof dealFiltersSchema>;
export type DealPageQuery = z.infer<typeof dealPageQuerySchema>;
export type DealSortKey = (typeof DEAL_SORT_KEYS)[number];
