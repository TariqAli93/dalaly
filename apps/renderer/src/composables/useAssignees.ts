import { ref } from "vue";
import * as tasksService from "../services/tasks.service";
import type { AssigneeRecord } from "../types";
import { usePermissions } from "./usePermissions";

const assignees = ref<AssigneeRecord[]>([]);
let pending: Promise<void> | null = null;

/**
 * Who a task can be given to, loaded once per session and shared by every
 * task form and filter. Without a follow-up permission the list stays empty.
 */
export function useAssignees() {
  const { can } = usePermissions();

  function loadAssignees() {
    if (assignees.value.length) return Promise.resolve();
    if (!can("followups.read") && !can("rentals.followups.read"))
      return Promise.resolve();
    pending ??= tasksService
      .listAssignees()
      .then((rows) => {
        assignees.value = rows;
      })
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  return { assignees, loadAssignees };
}
