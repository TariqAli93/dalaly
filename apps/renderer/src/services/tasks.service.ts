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
import { queryString } from "../utils/query";

/** One page of the follow-ups and activities the user may read. */
export function listTasksPage(
  filters: TaskFilters,
  page: PageQuery<TaskSortKey>,
  signal?: AbortSignal,
) {
  return request<TaskPage>(
    `/tasks/paged${queryString({ ...filters, ...page })}`,
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
