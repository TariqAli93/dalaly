import type { StatsSummary } from "../types";
import { request } from "./api.service";

export function fetchSummary() {
  return request<StatsSummary>("/stats/summary");
}
