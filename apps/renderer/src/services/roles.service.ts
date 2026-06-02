import type { RoleRecord } from "../types";
import { request } from "./api.service";

type RolePayload = {
  name: string;
  description: string;
};

export function listRoles() {
  return request<RoleRecord[]>("/roles");
}

export function createRole(payload: RolePayload) {
  return request<RoleRecord>("/roles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRole(id: number, payload: RolePayload) {
  return request<RoleRecord>(`/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function updateRolePermissions(id: number, permission_ids: number[]) {
  return request<RoleRecord>(`/roles/${id}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permission_ids }),
  });
}

export function deleteRole(id: number) {
  return request<{ deleted: boolean }>(`/roles/${id}`, { method: "DELETE" });
}
