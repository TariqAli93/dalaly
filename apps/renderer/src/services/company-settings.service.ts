import type { CompanySettingsRecord } from "../types";
import { API_BASE, getToken, request } from "./api.service";
export function getCompanySettings() {
  return request<CompanySettingsRecord>("/company-settings");
}
export function updateCompanySettings(payload: unknown) {
  return request<CompanySettingsRecord>("/company-settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function uploadLogo(payload: unknown) {
  return request<CompanySettingsRecord>("/company-settings/logo", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function logoUrl() {
  return `${API_BASE}/company-settings/logo?token=${encodeURIComponent(getToken())}`;
}
