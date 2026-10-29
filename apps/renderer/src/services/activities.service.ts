import type { ActivityPayload, ActivityRecord } from "../types";
import { request } from "./api.service";

/** A customer's activities (and those about one of their requests). */
export function listActivities(filters: {
  person_id?: number;
  purchase_request_id?: number;
  rental_request_id?: number;
}) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  return request<ActivityRecord[]>(`/activities?${query}`);
}

export function getActivity(id: number) {
  return request<ActivityRecord>(`/activities/${id}`);
}

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

export function deleteActivity(id: number) {
  return request<{ deleted: boolean }>(`/activities/${id}`, {
    method: "DELETE",
  });
}
