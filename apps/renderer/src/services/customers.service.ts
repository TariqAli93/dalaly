import type { CustomerRecord } from "../types";
import { request } from "./api.service";
export function listCustomers(filters: Record<string, string> = {}) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  );
  const suffix = query.toString() ? `?${query}` : "";
  return request<CustomerRecord[]>(`/customers${suffix}`);
}
export function createCustomer(payload: Partial<CustomerRecord>) {
  return request<CustomerRecord>("/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateCustomer(id: number, payload: Partial<CustomerRecord>) {
  return request<CustomerRecord>(`/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function archiveCustomer(id: number) {
  return request<CustomerRecord>(`/customers/${id}/archive`, {
    method: "PATCH",
  });
}
export function restoreCustomer(id: number) {
  return request<CustomerRecord>(`/customers/${id}/restore`, {
    method: "PATCH",
  });
}
