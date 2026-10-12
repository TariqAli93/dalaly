import type {
  ContractBundle,
  ContractRecord,
  ContractTemplateRecord,
  ContractValidation,
} from "../types";
import { request } from "./api.service";

export function listContracts(
  filters: Record<string, string | number | undefined> = {},
) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
  return request<ContractRecord[]>(
    `/contracts${query.toString() ? `?${query}` : ""}`,
  );
}
export function getContract(id: number) {
  return request<ContractBundle>(`/contracts/${id}`);
}
export function validateContract(payload: unknown) {
  return request<ContractValidation>("/contracts/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function previewContract(payload: unknown) {
  return request<{ content: string; html: string }>("/contracts/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function createContract(payload: unknown) {
  return request<ContractBundle>("/contracts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateContract(id: number, payload: unknown) {
  return request<ContractBundle>(`/contracts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
export function generateContract(id: number) {
  return request<ContractBundle>(`/contracts/${id}/generate`, {
    method: "POST",
  });
}
export function listTemplates(contractType?: "sale" | "rental") {
  return request<ContractTemplateRecord[]>(
    `/contracts/templates${contractType ? `?contract_type=${contractType}` : ""}`,
  );
}
export function createTemplate(payload: unknown) {
  return request<ContractTemplateRecord>("/contracts/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function updateTemplate(id: number, payload: unknown) {
  return request<ContractTemplateRecord>(`/contracts/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function reviewContract(
  id: number,
  comment: string,
  contentHash: string,
) {
  return request<ContractBundle>(`/contracts/${id}/legal-review`, {
    method: "POST",
    body: JSON.stringify({ comment, content_hash: contentHash }),
  });
}
export function issueContract(id: number) {
  return request<ContractBundle>(`/contracts/${id}/issue`, { method: "POST" });
}

export function cancelContract(
  id: number,
  payload: { reason: string; cancellation_date: string; notes?: string },
) {
  return request<ContractBundle>(`/contracts/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordPrint(id: number, format: "print" | "pdf" | "docx") {
  return request<ContractBundle>(`/contracts/${id}/print-record`, {
    method: "POST",
    body: JSON.stringify({ format }),
  });
}

export function exportContractDocx(id: number) {
  return request<{ filename: string; data: string }>(`/contracts/${id}/docx`);
}

export type SettlementInput = {
  kind: "refund" | "retained_payment" | "remaining_obligation";
  amount: number;
  reference: string;
  reason: string;
  settlement_date: string;
  request_id: string;
};
export function recordSettlement(id: number, payload: SettlementInput) {
  return request<ContractBundle>(`/contracts/${id}/settlements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgreementProcedure(id: number, payload: unknown) {
  return request<import("../types/crm.types").AgreementFollowup>(
    `/contracts/${id}/procedures`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}
export function attachAgreementProcedure(id: number, payload: unknown) {
  return request<import("../types/crm.types").AgreementFollowup>(
    `/contracts/${id}/procedures/attachments`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}
