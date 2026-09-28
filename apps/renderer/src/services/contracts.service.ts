import type { ContractBundle, ContractRecord, ContractTemplateRecord, ContractValidation } from "../types";
import { request } from "./api.service";

export function listContracts(filters: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  return request<ContractRecord[]>(`/contracts${query.toString() ? `?${query}` : ""}`);
}
export function getContract(id: number) { return request<ContractBundle>(`/contracts/${id}`); }
export function validateContract(payload: unknown) { return request<ContractValidation>("/contracts/validate", { method: "POST", body: JSON.stringify(payload) }); }
export function previewContract(payload: unknown) { return request<{ content: string }>("/contracts/preview", { method: "POST", body: JSON.stringify(payload) }); }
export function createContract(payload: unknown) { return request<ContractBundle>("/contracts", { method: "POST", body: JSON.stringify(payload) }); }
export function updateContract(id: number, payload: unknown) { return request<ContractBundle>(`/contracts/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function generateContract(id: number) { return request<ContractBundle>(`/contracts/${id}/generate`, { method: "POST" }); }
export function listTemplates(contractType?: "sale" | "rental") { return request<ContractTemplateRecord[]>(`/contracts/templates${contractType ? `?contract_type=${contractType}` : ""}`); }
export function createTemplate(payload: unknown) { return request<ContractTemplateRecord>("/contracts/templates", { method: "POST", body: JSON.stringify(payload) }); }
export function updateTemplate(id: number, payload: unknown) { return request<ContractTemplateRecord>(`/contracts/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
