import type { ActivityPayload, ActivityRecord } from "../types";
import { request } from "./api.service";

export function createActivity(payload: ActivityPayload) {
  return request<ActivityRecord>("/activities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateActivity(id: number, payload: ActivityPayload) {
  return request<ActivityRecord>(`/activities/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
