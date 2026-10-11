import type { LegalRevisionPayload } from "./legal-content.schema.js";
export const allowedKeys = [
  "contract.transaction_kind",
  "contract.jurisdiction",
  "contract.registration_reference",
  "contract.intended_use",
  ...[
    "legal_type",
    "plot_number",
    "plot_letter",
    "subdistrict_number",
    "subdistrict_name",
    "mahalla",
    "alley",
    "house_number",
    "area_unit",
    "area_value",
    "rent_period",
  ].map((k) => `property.${k}`),
  "contract.type",
  "contract.date",
  "contract.amount",
  "contract.paid_amount",
  "contract.remaining_amount",
  "contract.start_date",
  "contract.end_date",
  "contract.notes",
  "office.name",
  "office.address",
  "office.phone",
  "office.phone_secondary",
  "office.email",
  "office.license_number",
  "office.additional_contact",
  "property.code",
  "property.name",
  "property.type",
  "property.area",
  "property.price",
  "property.address",
  "property.names",
  "property.addresses",
  "property.total",
  "seller_name",
  "buyer_name",
  "landlord_name",
  "tenant_name",
  "property_address",
  "contract_amount",
  "paid_amount",
  "remaining_amount",
  "contract_date",
  "start_date",
  "end_date",
  "notes",
  "company_name",
  "company_address",
  "company_phone",
  ...["seller", "buyer", "lessor", "lessee"].flatMap((r) =>
    ["full_name", "identity_number", "phone", "address", "email"].map(
      (k) => `${r}.${k}`,
    ),
  ),
];

export const normalize = (s: string) =>
  s.normalize("NFC").trim().replace(/\s+/gu, " ");
export const canonicalConditions = (conditions: {
  all?: Array<{ field: string; op: string; value?: unknown }>;
}) =>
  JSON.stringify(
    (conditions.all ?? []).map((c) => ({
      field: c.field,
      op: c.op,
      ...(c.value === undefined ? {} : { value: c.value }),
    })),
  );
export function legalTerms(v: LegalRevisionPayload) {
  return JSON.stringify({
    scope: [
      v.contract_type,
      v.property_type,
      v.jurisdiction,
      v.transaction_kind,
    ],
    basis: normalize(v.legal_basis),
    applicability: normalize(v.applicability_notes),
    clauses: [...v.clauses]
      .sort(
        (a, b) =>
          a.clause_order - b.clause_order ||
          a.clause_code.localeCompare(b.clause_code),
      )
      .map((c) => ({
        code: c.clause_code,
        title: normalize(c.clause_title),
        text: normalize(c.clause_content_ar),
        required: c.is_required,
        conditions: canonicalConditions(c.conditions_json),
      })),
  });
}
export function validateLegal(v: LegalRevisionPayload) {
  const issues: string[] = [];
  if (!v.legal_basis.trim()) issues.push("الأساس القانوني مطلوب.");
  if (!v.applicability_notes.trim()) issues.push("نطاق التطبيق مطلوب.");
  if (!v.clauses.some((c) => c.is_required))
    issues.push("أضف بنداً أساسياً واحداً على الأقل.");
  if (v.property_type === "*")
    issues.push("حدد جنس العقار؛ النص السابق محفوظ للمراجعة.");
  const seen = new Map<string, string>();
  for (const c of v.clauses) {
    const text = normalize(c.clause_content_ar);
    const duplicate = seen.get(text);
    if (duplicate)
      issues.push(
        "البند " + c.clause_title + " يكرر نص البند " + duplicate + ".",
      );
    seen.set(text, c.clause_title);
    const stripped = c.clause_content_ar.replace(
      /{{\s*([^{}]+?)\s*}}/g,
      (_m, key) => {
        if (!allowedKeys.includes(key))
          issues.push("متغير غير معروف في " + c.clause_title + ": " + key);
        const wrongRole =
          v.contract_type === "rental"
            ? /^(seller[_.]|buyer[_.])/.test(key)
            : /^(lessor\.|lessee\.|landlord_|tenant_)/.test(key);
        if (wrongRole)
          issues.push(
            "متغير طرف لا يطابق نوع العقد في " + c.clause_title + ": " + key,
          );
        return "";
      },
    );
    if (/[{}]/.test(stripped))
      issues.push(
        "صيغة متغير غير مكتملة في " +
          c.clause_title +
          ". استخدم {{اسم_المتغير}}.",
      );
  }
  return { valid: issues.length === 0, issues };
}
