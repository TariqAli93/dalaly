import type { FollowupRecord, FollowupType } from "../types";
import { request } from "./api.service";

type FollowupPayload = {
  type: FollowupType;
  notes?: string | null;
  scheduled_at?: string | null;
};

export function listFollowups(propertyId: number) {
  return request<FollowupRecord[]>(`/properties/${propertyId}/followups`);
}

export function createFollowup(propertyId: number, payload: FollowupPayload) {
  return request<FollowupRecord>(`/properties/${propertyId}/followups`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFollowup(
  propertyId: number,
  followupId: number,
  payload: FollowupPayload,
) {
  return request<FollowupRecord>(
    `/properties/${propertyId}/followups/${followupId}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function deleteFollowup(propertyId: number, followupId: number) {
  return request<{ deleted: boolean }>(
    `/properties/${propertyId}/followups/${followupId}`,
    { method: "DELETE" },
  );
}
