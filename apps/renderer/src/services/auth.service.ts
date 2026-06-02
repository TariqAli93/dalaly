import type {
  AuthPayload,
  CurrentUserPayload,
  LoginCredentials,
} from "../types";
import { publicRequest, request } from "./api.service";

export function login(credentials: LoginCredentials) {
  return publicRequest<AuthPayload>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function logout() {
  return request<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function fetchCurrentUser() {
  return request<CurrentUserPayload>("/auth/me");
}

export function changePin(currentPin: string, newPin: string) {
  return request<{ ok: boolean }>("/auth/change-pin", {
    method: "POST",
    body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
  });
}
