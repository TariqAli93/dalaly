import type { DashboardSummary } from "../types";
import { request } from "./api.service";

export function fetchDashboard() {
  return request<DashboardSummary>("/dashboard/summary");
}
