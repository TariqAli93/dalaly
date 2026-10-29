import { taskFieldsSchema, type TaskFields } from "../tasks/tasks.schema.js";

export {
  TASK_TYPES as FOLLOWUP_TYPES,
  normalizeScheduledAt,
} from "../tasks/tasks.schema.js";

/** A listing follow-up is a task on that listing (tasks.schema.ts). */
export const followupPayloadSchema = taskFieldsSchema;

export type FollowupPayload = TaskFields;
