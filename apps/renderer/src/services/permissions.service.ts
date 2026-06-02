import type { PermissionRecord } from "../types";
import { request } from "./api.service";

type PermissionPayload = {
  key: string;
  name: string;
  description: string;
  module: string;
};

export function listPermissions() {
  return request<PermissionRecord[]>("/permissions");
}

export function createPermission(payload: PermissionPayload) {
  return request<PermissionRecord>("/permissions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePermission(id: number, payload: PermissionPayload) {
  return request<PermissionRecord>(`/permissions/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletePermission(id: number) {
  return request<{ deleted: boolean }>(`/permissions/${id}`, {
    method: "DELETE",
  });
}
