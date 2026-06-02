import type { ManagedUserRecord, UserFormPayload } from "../types";
import { request } from "./api.service";

export function listUsers() {
  return request<ManagedUserRecord[]>("/users");
}

export function createUser(payload: UserFormPayload) {
  return request<ManagedUserRecord>("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(id: number, payload: Partial<UserFormPayload>) {
  return request<ManagedUserRecord>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function activateUser(id: number) {
  return request<ManagedUserRecord>(`/users/${id}/activate`, {
    method: "PATCH",
  });
}

export function deactivateUser(id: number) {
  return request<ManagedUserRecord>(`/users/${id}/deactivate`, {
    method: "PATCH",
  });
}

export function deleteUser(id: number) {
  return request<{ deleted: boolean }>(`/users/${id}`, { method: "DELETE" });
}
