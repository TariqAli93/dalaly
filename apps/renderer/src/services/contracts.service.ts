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
  return request<{ content: string; html: string; docx_data: string }>(
    "/contracts/preview",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
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
export const previewDocument = (id: number) =>
  request<{ data: string; filename: string }>(
    `/contracts/${id}/document-preview`,
  );
export const previewPdf = (id: number) =>
  request<{ data: string }>(`/contracts/${id}/pdf-preview`);
export const exportContractPdf = (id: number) =>
  request<{ data: string; filename: string }>(`/contracts/${id}/pdf`);
export const previewDraftPdf = (payload: unknown) =>
  request<{ data: string }>("/contracts/preview-pdf", {
    method: "POST",
    body: JSON.stringify(payload),
  });
export const defaultFormulation = (kind: "sale" | "rental") =>
  request<{
    id: number;
    content: string;
    title: string;
    version: number;
  } | null>(`/contracts/formulation?contract_type=${kind}`);
export const templateFile = (id: number) =>
  request<{ data: string; filename: string }>(
    `/contracts/templates/${id}/file`,
  );
export const inspectTemplate = (filename: string, data: string) =>
  request<{ variables: string[]; text: string; hash: string }>(
    "/contracts/templates/inspect",
    { method: "POST", body: JSON.stringify({ filename, data }) },
  );
export const templatePdf = (filename: string, data: string) =>
  request<{ data: string }>("/contracts/templates/preview-pdf", {
    method: "POST",
    body: JSON.stringify({ filename, data }),
  });
export const importTemplate = (
  id: number,
  filename: string,
  data: string,
  version: number,
) =>
  request<ContractTemplateRecord>(`/contracts/templates/${id}/import`, {
    method: "POST",
    body: JSON.stringify({ filename, data, version }),
  });
export const restoreTemplate = (id: number) =>
  request<ContractTemplateRecord>(`/contracts/templates/${id}/restore`, {
    method: "POST",
  });

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
