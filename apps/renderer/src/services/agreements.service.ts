import type { ContractDocument, TemplateKey } from "@contract-document/index";
import type {
  AgreementDocxFile,
  AgreementExportRecord,
  AgreementListItem,
  AgreementRecord,
  AgreementRevisionRecord,
  AgreementSavePayload,
  AgreementSaveResult,
  AgreementSortKey,
  AgreementStatus,
  AgreementTemplateRecord,
  AgreementTemplateSummary,
  AgreementTemplateVersion,
  AgreementTemplateVersionDetail,
  PageQuery,
  PagedResult,
} from "../types";
import { request } from "./api.service";
import { queryString } from "../utils/query";

// ─── Templates ──────────────────────────────────────────────────────────
// A template's definition changes only through the calls below, so it is
// cached per version and replaced when one of them answers.
const templateCache = new Map<TemplateKey, AgreementTemplateRecord>();
function remember(template: AgreementTemplateRecord) {
  templateCache.set(template.key, template);
  return template;
}

export function listTemplates() {
  return request<AgreementTemplateSummary[]>("/agreements/templates");
}

export async function getTemplate(key: TemplateKey, version?: number) {
  const cached = templateCache.get(key);
  if (cached && version !== undefined && cached.version === version)
    return cached;
  return remember(
    await request<AgreementTemplateRecord>(`/agreements/templates/${key}`),
  );
}

export async function saveTemplate(
  key: TemplateKey,
  baseVersion: number,
  definition: ContractDocument,
  note: string | null = null,
) {
  return remember(
    await request<AgreementTemplateRecord>(`/agreements/templates/${key}`, {
      method: "PUT",
      body: JSON.stringify({ base_version: baseVersion, definition, note }),
    }),
  );
}

export async function resetTemplate(
  key: TemplateKey,
  mode: "design" | "all",
  baseVersion: number,
) {
  return remember(
    await request<AgreementTemplateRecord>(
      `/agreements/templates/${key}/reset`,
      {
        method: "POST",
        body: JSON.stringify({ mode, base_version: baseVersion }),
      },
    ),
  );
}

export function listTemplateVersions(key: TemplateKey) {
  return request<AgreementTemplateVersion[]>(
    `/agreements/templates/${key}/versions`,
  );
}

export function getTemplateVersion(key: TemplateKey, version: number) {
  return request<AgreementTemplateVersionDetail>(
    `/agreements/templates/${key}/versions/${version}`,
  );
}

export async function restoreTemplateVersion(
  key: TemplateKey,
  version: number,
  baseVersion: number,
) {
  return remember(
    await request<AgreementTemplateRecord>(
      `/agreements/templates/${key}/versions/${version}/restore`,
      { method: "POST", body: JSON.stringify({ base_version: baseVersion }) },
    ),
  );
}

// ─── Contracts ──────────────────────────────────────────────────────────

export function listAgreementsPage(
  filters: {
    q?: string;
    status?: AgreementStatus;
    template_key?: TemplateKey;
    person_id?: number;
    property_id?: number;
    rental_id?: number;
  },
  page: PageQuery<AgreementSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<AgreementListItem>>(
    `/agreements/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
}

export function getAgreement(id: number) {
  return request<AgreementRecord>(`/agreements/${id}`);
}

export function createAgreement(templateKey: TemplateKey) {
  return request<AgreementRecord>("/agreements", {
    method: "POST",
    body: JSON.stringify({ template_key: templateKey }),
  });
}

export function saveAgreement(id: number, payload: AgreementSavePayload) {
  return request<AgreementSaveResult>(`/agreements/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteAgreement(id: number) {
  return request<null>(`/agreements/${id}`, { method: "DELETE" });
}

export function duplicateAgreement(id: number) {
  return request<AgreementRecord>(`/agreements/${id}/duplicate`, {
    method: "POST",
  });
}

export function changeAgreementStatus(
  id: number,
  action: "submit_review" | "return_draft",
  baseRev: number,
) {
  return request<AgreementRecord>(`/agreements/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ action, base_rev: baseRev }),
  });
}

export function issueAgreement(id: number, baseRev: number) {
  return request<AgreementRecord>(`/agreements/${id}/issue`, {
    method: "POST",
    body: JSON.stringify({ base_rev: baseRev }),
  });
}

export function amendAgreement(id: number, reason: string) {
  return request<AgreementRecord>(`/agreements/${id}/amend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function cancelAgreement(id: number, reason: string) {
  return request<AgreementRecord>(`/agreements/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function getAgreementRevision(id: number, revision: number) {
  return request<AgreementRevisionRecord>(
    `/agreements/${id}/revisions/${revision}`,
  );
}

/** The Word file of a revision, or of the draft when no revision is given. */
export function getAgreementDocx(id: number, revision?: number | null) {
  return request<AgreementDocxFile>(
    `/agreements/${id}/docx${queryString({ revision: revision ?? undefined })}`,
  );
}

export function recordAgreementExport(
  id: number,
  input: {
    format: AgreementExportRecord["format"];
    revision: number | null;
    file_name: string | null;
  },
) {
  return request<AgreementExportRecord>(`/agreements/${id}/exports`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
