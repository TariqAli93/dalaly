import { createHash } from "node:crypto";
import { conditionSchema } from "./legal-content.schema.js";

export const DOCUMENT_PROCEDURE_NOTE =
  "تُملأ وفق الإجراءات المنجزة فعلاً. طباعة هذا الاتفاق لا تثبت اكتمالها.";

export type LegalSection = {
  asset_id: number;
  property_type: string;
  template_id: number;
  version: number;
  approval_status: string;
  title: string;
  legal_basis: string;
  applicability_notes: string;
  clauses: Array<{
    code: string;
    title: string;
    text: string;
    version: number;
    required: boolean;
  }>;
};
export type ContractDocument = {
  schema_version: 1;
  document_file_hash?: string;
  ready: boolean;
  warnings: string[];
  review_required?: boolean;
  review_reasons?: string[];
  data: {
    code: string;
    contract_type: string;
    title: string;
    agreement_mode?: "office";
    explanation?: string;
    agreement_terms?: Array<{ label: string; value: string }>;
    witnesses?: Array<{ name: string }>;
    procedure_labels?: string[];
    office: Record<string, string>;
    parties: Array<{
      role: string;
      label: string;
      name: string;
      identity_number: string;
      residence_card_number?: string;
      phone: string;
      address: string;
    }>;
    assets: Array<{
      id: number;
      property_type: string;
      image_data_uri?: string;
      details: Array<{ label: string; value: string }>;
    }>;
    financial: Array<{ label: string; value: string }>;
    dates: Array<{ label: string; value: string }>;
    attachments: Array<{ party: string; name: string; number: string }>;
    legal_context: Record<string, unknown>;
    additional_conditions: string;
    preview_values?: Array<{
      asset_id: number;
      values: Record<string, string>;
      facts: Record<string, unknown>;
    }>;
  };
  legal_versions: Array<{
    source?: "formulation";
    id: number;
    name?: string;
    version: number;
    property_type: string;
    approval_status: string;
    approved_by: number | null;
    approved_at: string | null;
  }>;
  sections: LegalSection[];
};

// Unknown categories retain their own scope. Never fall back to residential.
export function legalPropertyType(asset: Record<string, unknown>) {
  const type = String(asset.propertyType ?? "other");
  if (type === "أرض")
    return /زراعي/.test(String(asset.legalType ?? ""))
      ? "agricultural_land"
      : "land";
  return (
    (
      {
        "أرض سكنية": "residential_land",
        "أرض زراعية": "agricultural_land",
        بيت: "house",
        مزرعة: "agricultural_land",
        فيلا: "villa",
        شقة: "apartment",
        بناية: "building",
        "عقار تجاري": "commercial",
        مخزن: "warehouse",
        أخرى: "other",
        shop: "commercial",
        مكتب: "office",
      } as Record<string, string>
    )[type] ?? type
  );
}

export function conditionsMatch(raw: unknown, facts: Record<string, unknown>) {
  // Fail closed on invalid legacy/custom conditions; no JS/eval or arbitrary SQL.
  const parsed = conditionSchema.parse(raw);
  return parsed.all.every((c) => {
    const actual = facts[c.field];
    if (c.op === "present") return actual != null && actual !== "";
    if (actual == null || actual === "") return false;
    if (c.op === "eq") return actual === c.value;
    if (c.op === "neq") return actual !== c.value;
    if (typeof actual !== "number" || typeof c.value !== "number") return false;
    if (c.op === "gt") return actual > c.value;
    if (c.op === "gte") return actual >= c.value;
    if (c.op === "lt") return actual < c.value;
    return actual <= c.value;
  });
}

export function interpolateLegalText(
  text: string,
  values: Record<string, string>,
) {
  return text.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, key: string) => {
    if (!Object.hasOwn(values, key))
      throw new Error(`متغير قانوني غير معروف: ${key}`);
    return values[key];
  });
}

export function documentHash(document: ContractDocument) {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}

export function documentText(d: ContractDocument) {
  const officeAgreement = d.data.agreement_mode === "office";
  const facts = (rows: Array<{ label: string; value: string }>) =>
    rows
      .filter((r) => !officeAgreement || r.value.trim())
      .map((r) => `${r.label}: ${r.value}`)
      .join("\n");
  return [
    d.ready ? "" : "مسودة غير معتمدة — لا تصلح للإصدار",
    ...d.warnings,
    d.data.title,
    d.data.code,
    d.data.office.name,
    d.data.office.address,
    d.data.office.owner_name ? `صاحب المكتب: ${d.data.office.owner_name}` : "",
    d.data.agreement_mode === "office"
      ? `المكتب العقاري: ${d.data.office.role ?? "الوسيط"}`
      : "",
    [d.data.office.phone, d.data.office.phone_secondary]
      .filter(Boolean)
      .join(" / "),
    d.data.office.license_number
      ? `رقم الإجازة: ${d.data.office.license_number}`
      : "",
    ...d.data.parties.map(
      (p) =>
        `${p.label}: ${p.name}\nرقم الهوية: ${p.identity_number}\nبطاقة السكن: ${p.residence_card_number ?? ""}\nالهاتف: ${p.phone}\nالعنوان: ${p.address}`,
    ),
    ...d.data.assets.map((a) => facts(a.details)),
    facts(d.data.financial),
    facts(d.data.dates),
    facts(d.data.agreement_terms ?? []),
    ...d.sections.map((s) =>
      [
        officeAgreement
          ? s.title
          : `${s.title} · الإصدار ${s.version} · ${s.approval_status === "approved" ? "معتمد" : "غير معتمد"}`,
        ...s.clauses.map((c, i) => `${i + 1}. ${c.title}\n${c.text}`),
      ].join("\n"),
    ),
    d.data.additional_conditions
      ? `شروط إضافية متفق عليها:\n${d.data.additional_conditions}`
      : "",
    d.data.explanation ?? "",
    "المستمسكات المستخدمة",
    ...d.data.attachments.map((a) => `${a.party}: ${a.name} ${a.number}`),
    ...d.data.parties.map((p) => `توقيع ${p.label}: ____________________`),
    ...(d.data.witnesses ?? []).map(
      (w) => `الشاهد: ${w.name} · التوقيع: ____________________`,
    ),
    "توقيع صاحب المكتب أو الموظف المخول والختم: ____________________",
    ...(d.data.procedure_labels ?? []).map(
      (label) => `متابعة: ${label} · التاريخ: __________ · المرجع: __________`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}
