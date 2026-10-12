import { request } from "./api.service";
export type Condition = {
  field: string;
  op: string;
  value?: string | number | boolean;
};
export type LegalClause = {
  id?: number;
  source_clause_id?: number | null;
  clause_code: string;
  clause_title: string;
  clause_content_ar: string;
  clause_order: number;
  is_required: boolean;
  conditions_json: { all: Condition[] };
};
export type LegalRevision = {
  id: number;
  family_code: string;
  wording_origin: "office_standard" | "specialist";
  contract_type: "sale" | "rental";
  property_type: string;
  jurisdiction: string;
  transaction_kind: string;
  title: string;
  version: number;
  approval_status: string;
  legal_basis: string;
  applicability_notes: string;
  approved_by: number | null;
  approved_at: string | null;
  parent_id: number | null;
  based_on_id: number | null;
  change_kind: string;
  review_required: boolean;
  publication_status: string;
  workflow_status: string;
  is_default: boolean;
  is_system: boolean;
  deleted_at: string | null;
  deleted_by: number | null;
  target_at: string | null;
  priority: number;
  updated_at: string;
  clauses: LegalClause[];
};
export type LegalEvent = {
  id: number;
  legal_template_id: number;
  action: string;
  actor_id: number | null;
  comment: string;
  created_at: string;
  reviewer_snapshot: Record<string, unknown> | null;
  details: Record<string, unknown>;
};
export const propertyScopes = [
  {
    title: "جميع أجناس العقارات — صيغة المكتب العامة",
    value: "all_properties",
  },
  { title: "مكتب", value: "office" },
  { title: "أرض غير محددة الاستخدام", value: "land" },
  { title: "بيت", value: "house" },
  { title: "شقة", value: "apartment" },
  { title: "أرض سكنية", value: "residential_land" },
  { title: "أرض زراعية / مزرعة", value: "agricultural_land" },
  { title: "عقار تجاري", value: "commercial" },
  { title: "مخزن", value: "warehouse" },
  { title: "بناية", value: "building" },
  { title: "فيلا", value: "villa" },
  { title: "أخرى", value: "other" },
];
export const jurisdictions = [
  { title: "العراق الاتحادي", value: "iq_federal" },
  { title: "إقليم كوردستان", value: "iq_kurdistan" },
];
export const transactionKinds = [
  { title: "إيجار", value: "lease" },
  { title: "اتفاق بيع أولي", value: "preliminary_sale" },
  { title: "توثيق تصرف مسجل", value: "registered_transfer_record" },
];
export const statusLabels: Record<string, string> = {
  draft: "مسودة",
  ready: "جاهزة للاعتماد",
  specialist_review: "بانتظار المراجعة",
  approved: "معتمدة",
  active: "مفعلة",
  archived: "غير مفعلة",
};
export const changeLabels: Record<string, string> = {
  new_legal: "صيغة جديدة",
  administrative: "تعديل إداري على نص مراجع مسبقاً",
  substantive: "تغيير في الأحكام القانونية",
};
export const priorities = [
  { title: "عادية", value: 0 },
  { title: "متوسطة", value: 1 },
  { title: "عالية", value: 2 },
];
export type RevisionInput = Pick<
  LegalRevision,
  | "contract_type"
  | "property_type"
  | "jurisdiction"
  | "transaction_kind"
  | "title"
  | "legal_basis"
  | "applicability_notes"
  | "clauses"
  | "target_at"
  | "priority"
> & { revision_note: string };
export type Validation = {
  valid: boolean;
  issues: string[];
  change_kind: string;
  review_required: boolean;
  based_on_id: number | null;
  baseline_version: number | null;
};
export type LegalOptions = {
  property_scopes: string[];
  variables: string[];
  clause_library: Array<
    LegalClause & {
      usage_count: number;
      contract_type: string;
      contract_types: string[];
      scopes: string[];
    }
  >;
};
export type LegalNotice = {
  id: number;
  legal_template_id: number;
  kind: string;
  target_at: string;
  read_at: string | null;
  title: string;
  contract_type: string;
  property_type: string;
};
export function payloadOf(row: LegalRevision): RevisionInput {
  return {
    contract_type: row.contract_type,
    property_type: row.property_type,
    jurisdiction: row.jurisdiction,
    transaction_kind: row.transaction_kind,
    title: row.title,
    legal_basis: row.legal_basis,
    applicability_notes: row.applicability_notes,
    target_at: row.target_at,
    priority: row.priority,
    revision_note: "",
    clauses: row.clauses.map((c) => ({
      clause_code: c.clause_code,
      clause_title: c.clause_title,
      clause_content_ar: c.clause_content_ar,
      clause_order: c.clause_order,
      is_required: c.is_required,
      conditions_json: JSON.parse(
        JSON.stringify(
          c.conditions_json?.all ? c.conditions_json : { all: [] },
        ),
      ),
      source_clause_id: c.id ?? c.source_clause_id ?? null,
    })),
  };
}
export function options() {
  return request<LegalOptions>("/legal-content/options");
}
export function validate(payload: RevisionInput) {
  return request<Validation>("/legal-content/validate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function preview(
  revision: RevisionInput,
  visualId: number,
  contractId?: number,
  additionalConditions = "",
) {
  return request<{
    html: string;
    content: string;
    variables: Array<{ key: string; value: string }>;
    rendered_clauses: Array<{ code: string; title: string; text: string }>;
  }>("/legal-content/preview", {
    method: "POST",
    body: JSON.stringify({
      revision,
      visual_id: visualId,
      contract_id: contractId,
      additional_conditions: additionalConditions,
    }),
  });
}
export function compare(left: number, right: number) {
  return request<{
    differences: Array<{ field: string; before: string; after: string }>;
    legal_changed: boolean;
  }>(`/legal-content/compare?left=${left}&right=${right}`);
}
export function restore(id: number) {
  return request<LegalRevision>(`/legal-content/${id}/restore`, {
    method: "POST",
  });
}
export function schedule(
  id: number,
  target_at: string | null,
  priority: number,
) {
  return request<LegalRevision>(`/legal-content/${id}/schedule`, {
    method: "PATCH",
    body: JSON.stringify({ target_at, priority }),
  });
}
export function notifications() {
  return request<LegalNotice[]>("/legal-content/notifications");
}
export function readNotice(id: number) {
  return request<{ ok: boolean }>(`/legal-content/notifications/${id}/read`, {
    method: "POST",
  });
}
export function listLegalContent() {
  return request<LegalRevision[]>("/legal-content");
}
export function legalHistory() {
  return request<LegalEvent[]>("/legal-content/history");
}
export function saveRevision(id: number | null, payload: unknown) {
  return request<LegalRevision>(
    id ? `/legal-content/${id}/revisions` : "/legal-content",
    { method: "POST", body: JSON.stringify(payload) },
  );
}
export function decision(id: number, action: string, comment: string) {
  return request<LegalRevision>(`/legal-content/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ action, comment }),
  });
}
export function deleteTemplate(id: number) {
  return request<{ ok: boolean }>(`/legal-content/${id}`, { method: "DELETE" });
}
