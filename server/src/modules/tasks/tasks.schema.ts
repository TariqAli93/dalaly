import { z } from "zod";
import { optionalId } from "../../shared/validation/fields.js";
import { pageFields } from "../../shared/validation/paging.js";

/** What a follow-up or activity records; "task" is a to-do with no contact. */
export const TASK_TYPES = [
  "phone_call",
  "meeting",
  "message",
  "visit",
  "negotiation",
  "task",
  "other",
] as const;
export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
/** Where a task row lives; each has its own write routes and permissions. */
export const TASK_SOURCES = [
  "sale_followup",
  "rental_followup",
  "activity",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskSource = (typeof TASK_SOURCES)[number];

const scheduledAt = z
  .string()
  .datetime({ offset: true })
  .optional()
  .nullable()
  .or(z.literal(""));

/**
 * The task fields a follow-up or activity accepts. On an update, a field left
 * out keeps its value (older clients send only type, notes and date).
 */
export const taskFieldsSchema = z.object({
  type: z.enum(TASK_TYPES),
  notes: z.string().trim().optional().nullable(),
  scheduled_at: scheduledAt,
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigned_user_id: optionalId,
  person_id: optionalId,
  outcome: z.string().trim().max(2000).optional().nullable(),
});

export type TaskFields = z.infer<typeof taskFieldsSchema>;

/** A partial change from the tasks page: complete, reopen, reschedule, assign. */
export const taskPatchSchema = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    scheduled_at: scheduledAt,
    assigned_user_id: optionalId,
    outcome: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, "لا يوجد تعديل.");

export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const TASK_SORT_KEYS = [
  "scheduled_at",
  "priority",
  "created_at",
  "updated_at",
] as const;

export const taskPageQuerySchema = z.object({
  ...pageFields,
  sort_by: z.enum(TASK_SORT_KEYS).default("scheduled_at"),
  sort_order: z.enum(["asc", "desc"]).default("asc"),
  /** "overdue": open and past due; "all": every status. */
  status: z.enum([...TASK_STATUSES, "overdue", "all"]).default("open"),
  /** "me", "unassigned", or a user id. */
  assigned: z
    .union([z.enum(["me", "unassigned"]), z.coerce.number().int().positive()])
    .optional(),
  /** Due today, in the next 7 days, past due, or without a date. */
  due: z.enum(["today", "week", "overdue", "none"]).optional(),
  person_id: z.coerce.number().int().positive().optional(),
  source: z.enum(TASK_SOURCES).optional(),
  type: z.enum(TASK_TYPES).optional(),
  q: z.string().trim().max(200).optional(),
});

export type TaskPageQuery = z.infer<typeof taskPageQuerySchema>;

/** A follow-up or activity's date as a Date, or null without one. */
export function normalizeScheduledAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The status a new row gets when none is given: a dated follow-up is a task
 * still to do; one without a date records something that already happened.
 */
export function initialStatus(
  fields: Pick<TaskFields, "status" | "scheduled_at">,
): TaskStatus {
  return fields.status ?? (fields.scheduled_at ? "open" : "done");
}

/** `completed_at` after a change to `status`: set once done, cleared if not. */
export function completedAtFor(
  status: TaskStatus,
  previous: { status: string; completedAt: Date | null } | null,
  now = new Date(),
) {
  if (status !== "done") return null;
  return previous?.status === "done" ? previous.completedAt : now;
}
