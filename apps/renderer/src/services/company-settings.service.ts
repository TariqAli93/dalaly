import type { CompanySettingsRecord } from "../types";
import { API_BASE, getToken, request } from "./api.service";
export function getCompanySettings() {
  return request<CompanySettingsRecord>("/office");
}
export function updateCompanySettings(payload: unknown) {
  return request<CompanySettingsRecord>("/office", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function uploadLogo(payload: unknown) {
  return request<CompanySettingsRecord>("/office/logo", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function logoUrl() {
  return `${API_BASE}/office/logo?token=${encodeURIComponent(getToken())}`;
}
