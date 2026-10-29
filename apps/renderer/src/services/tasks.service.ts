import type {
  AssigneeRecord,
  PageQuery,
  TaskFilters,
  TaskPage,
  TaskPatch,
  TaskRecord,
  TaskSortKey,
  TaskSource,
} from "../types";
import { request } from "./api.service";

function buildQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.toString() ? `?${query}` : "";
}

/** One page of the follow-ups and activities the user may read. */
export function listTasksPage(
  filters: TaskFilters,
  page: PageQuery<TaskSortKey>,
  signal?: AbortSignal,
) {
  return request<TaskPage>(
    `/tasks/paged${buildQuery({ ...filters, ...page })}`,
    {
      signal,
    },
  );
}

/** Active users a task can be given to. */
export function listAssignees() {
  return request<AssigneeRecord[]>("/tasks/assignees");
}

/** Completes, reopens, cancels, reschedules or reassigns one task. */
export function patchTask(source: TaskSource, id: number, patch: TaskPatch) {
  return request<TaskRecord>(`/tasks/${source}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
