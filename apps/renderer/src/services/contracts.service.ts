import type { ContractBundle, ContractRecord } from "../types";
import { request } from "./api.service";
export function listContracts(filters: Record<string, string | number | undefined> = {}) { const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return request<ContractRecord[]>(`/contracts${query.toString() ? `?${query}` : ""}`); }
export function getContract(id: number) { return request<ContractBundle>(`/contracts/${id}`); }
export function createContract(payload: unknown) { return request<{ contract: ContractRecord; missing_documents: unknown[] }>("/contracts", { method: "POST", body: JSON.stringify(payload) }); }
export function updateContract(id: number, payload: unknown) { return request<ContractBundle>(`/contracts/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function generateContract(id: number) { return request<ContractBundle>(`/contracts/${id}/generate`, { method: "POST" }); }
export function listTemplates() { return request<Array<{ id: number; contract_type: string; name: string; body: string; is_active: boolean }>>("/contracts/templates"); }
export function updateTemplate(type: string, payload: unknown) { return request(`/contracts/templates/${type}`, { method: "PUT", body: JSON.stringify(payload) }); }
