import type { RentalFollowupRecord, TaskFieldsPayload } from "../types";
import { request } from "./api.service";
export function listRentalFollowups(id: number) {
  return request<RentalFollowupRecord[]>(`/rentals/${id}/followups`);
}
export function createRentalFollowup(id: number, payload: TaskFieldsPayload) {
  return request<RentalFollowupRecord>(`/rentals/${id}/followups`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateRentalFollowup(
  id: number,
  followupId: number,
  payload: TaskFieldsPayload,
) {
  return request<RentalFollowupRecord>(
    `/rentals/${id}/followups/${followupId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}
export function deleteRentalFollowup(id: number, followupId: number) {
  return request<{ deleted: boolean }>(
    `/rentals/${id}/followups/${followupId}`,
    { method: "DELETE" },
  );
}
