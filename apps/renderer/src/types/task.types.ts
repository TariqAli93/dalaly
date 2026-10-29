import type { PagedResult } from "./paging.types";
import type { FollowupType } from "./phase2.types";

export type TaskStatus = "open" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
/** Where a task lives; each has its own routes (TASK_SOURCES on the server). */
export type TaskSource = "sale_followup" | "rental_followup" | "activity";
export type TaskSortKey =
  "scheduled_at" | "priority" | "created_at" | "updated_at";

/** The task columns every follow-up and activity has. */
export type TaskFieldsRecord = {
  status: TaskStatus;
  priority: TaskPriority;
  completed_at: string | null;
  outcome: string | null;
  updated_at: string;
  person_id: number | null;
  person_name: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
};

/** What a follow-up or activity form sends; a field left out keeps its value. */
export type TaskFieldsPayload = {
  type: FollowupType;
  notes?: string | null;
  scheduled_at?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_user_id?: number | null;
  person_id?: number | null;
  outcome?: string | null;
};

/** What the task dialog edits: the payload, with the row's id when editing. */
export type TaskDialogValue = TaskFieldsPayload & { id?: number };

/** A row of /tasks/paged: a listing follow-up or a customer activity. */
export type TaskRecord = {
  source: TaskSource;
  id: number;
  type: FollowupType;
  notes: string | null;
  scheduled_at: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Open and past its date. */
  overdue: boolean;
  completed_at: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
  user_name: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  person_id: number | null;
  person_name: string | null;
  property_id: number | null;
  rental_id: number | null;
  listing_code: string | null;
  listing_name: string | null;
  purchase_request_id: number | null;
  rental_request_id: number | null;
  request_code: string | null;
};

export type TaskPage = PagedResult<TaskRecord>;

export type TaskFilters = {
  status?: TaskStatus | "overdue" | "all";
  assigned?: "me" | "unassigned" | number;
  due?: "today" | "week" | "overdue" | "none";
  person_id?: number;
  source?: TaskSource;
  type?: FollowupType;
  q?: string;
};

/** A change from the tasks list: complete, reopen, reschedule, reassign. */
export type TaskPatch = {
  status?: TaskStatus;
  priority?: TaskPriority;
  scheduled_at?: string | null;
  assigned_user_id?: number | null;
  outcome?: string | null;
};

/** A customer's activity or task that is not on a listing. */
export type ActivityRecord = TaskFieldsRecord & {
  id: number;
  person_id: number;
  person_name: string;
  purchase_request_id: number | null;
  purchase_request_code: string | null;
  rental_request_id: number | null;
  rental_request_code: string | null;
  user_id: number | null;
  user_name: string | null;
  type: FollowupType;
  notes: string | null;
  scheduled_at: string | null;
  created_at: string;
};

export type ActivityPayload = TaskFieldsPayload & {
  person_id: number;
  purchase_request_id?: number | null;
  rental_request_id?: number | null;
};

/** GET /people/:id/timeline: the customer's tasks, newest first. */
export type PersonTimeline = {
  items: TaskRecord[];
  total: number;
  last_interaction_at: string | null;
  next_followup_at: string | null;
  open_count: number;
  overdue_count: number;
};

export type AssigneeRecord = { id: number; display_name: string };
