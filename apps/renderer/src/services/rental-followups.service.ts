import type { FollowupRecord, FollowupType } from "../types";
import { request } from "./api.service";
export function listRentalFollowups(id: number) {
  return request<FollowupRecord[]>(`/rentals/${id}/followups`);
}
export function createRentalFollowup(
  id: number,
  payload: {
    type: FollowupType;
    notes?: string | null;
    scheduled_at?: string | null;
  },
) {
  return request<FollowupRecord>(`/rentals/${id}/followups`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateRentalFollowup(
  id: number,
  followupId: number,
  payload: {
    type: FollowupType;
    notes?: string | null;
    scheduled_at?: string | null;
  },
) {
  return request<FollowupRecord>(`/rentals/${id}/followups/${followupId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function deleteRentalFollowup(id: number, followupId: number) {
  return request<{ deleted: boolean }>(
    `/rentals/${id}/followups/${followupId}`,
    { method: "DELETE" },
  );
}
