import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  contractLegalSnapshots,
  contractTemplates,
} from "../../infrastructure/database/schema.js";
import { allowedKeys } from "./legal-validation.js";
import {
  conditionsMatch,
  interpolateLegalText,
  type ContractDocument,
} from "./legal-content.engine.js";
import {
  brandingSchema,
  layoutSchema,
  renderVisual,
  type VisualSnapshot,
} from "./contract-visual.engine.js";
import { legalError } from "./legal-content.service.js";
import type { LegalRevisionPayload } from "./legal-content.schema.js";

export async function previewLegalRevision(
  input: LegalRevisionPayload,
  visualId: number,
  contractId?: number,
  additionalConditions = "",
) {
  const [t] = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.id, visualId));
  if (!t || t.contractType !== input.contract_type || !t.isActive)
    throw legalError("اختر تصميماً فعالاً لنوع العقد نفسه.");
  let values = Object.fromEntries(
    allowedKeys.map((k) => [k, "بيانات تجريبية"]),
  );
  Object.assign(values, {
    "contract.amount": "١٬٠٠٠٬٠٠٠ د.ع",
    "contract.paid_amount": "٢٥٠٬٠٠٠ د.ع",
    "contract.remaining_amount": "٧٥٠٬٠٠٠ د.ع",
    "contract.date": new Date().toLocaleDateString("ar-IQ", {
      timeZone: "Asia/Baghdad",
    }),
    "property.name": "عقار تجريبي",
    "office.name": "مكتب تجريبي",
    "office.involvement": "وبوساطة مكتب تجريبي",
    "property.area_unit":
      input.property_type === "agricultural_land" ? "دونم" : "متر",
    "contract.jurisdiction": input.jurisdiction,
    "contract.transaction_kind": input.transaction_kind,
  });
  let facts: Record<string, unknown> = {
    area_unit: values["property.area_unit"],
    amount: 1000000,
    paid_amount: 250000,
    remaining_amount: 750000,
    rent_period: "monthly",
    legal_type: "بيانات تجريبية",
    intended_use: "بيانات تجريبية",
    registration_reference: "",
  };
  let data: ContractDocument["data"] = {
    code: "معاينة تجريبية",
    contract_type: input.contract_type,
    agreement_mode: "office",
    explanation:
      "اتفاق المكتب العقاري لا يغني عن إجراءات التصديق أو التسجيل الرسمية المطلوبة.",
    title:
      input.contract_type === "rental" ? "اتفاق إيجار عقار" : "اتفاق بيع عقار",
    office: {
      name: "مكتب تجريبي",
      address: "عنوان تجريبي",
      phone: "٠٧٧٠٠٠٠٠٠٠٠",
    },
    parties: (input.contract_type === "rental"
      ? [
          ["lessor", "المؤجر"],
          ["lessee", "المستأجر"],
        ]
      : [
          ["seller", "البائع"],
          ["buyer", "المشتري"],
        ]
    ).map(([role, label]) => ({
      role,
      label,
      name: `${label} التجريبي`,
      identity_number: "بيانات تجريبية",
      phone: "بيانات تجريبية",
      address: "عنوان تجريبي",
    })),
    assets: [
      {
        id: 0,
        property_type: input.property_type,
        details: [
          { label: "العقار", value: "عقار تجريبي" },
          { label: "جنس العقار", value: input.property_type },
          {
            label: "المساحة",
            value:
              input.property_type === "agricultural_land"
                ? "٢ دونم"
                : "١٥٠ متر",
          },
        ],
      },
    ],
    financial: [
      { label: "المبلغ الإجمالي", value: "١٬٠٠٠٬٠٠٠ د.ع" },
      { label: "المدفوع", value: "٢٥٠٬٠٠٠ د.ع" },
      { label: "المتبقي", value: "٧٥٠٬٠٠٠ د.ع" },
    ],
    dates: [{ label: "تاريخ العقد", value: values["contract.date"] }],
    attachments: [],
    legal_context: {
      jurisdiction: input.jurisdiction,
      transaction_kind: input.transaction_kind,
    },
    additional_conditions: additionalConditions,
  };
  for (const p of data.parties) values[`${p.role}.full_name`] = p.name;
  for (const [key, source] of Object.entries({
    contract_amount: "contract.amount",
    paid_amount: "contract.paid_amount",
    remaining_amount: "contract.remaining_amount",
    contract_date: "contract.date",
    company_name: "office.name",
    company_address: "office.address",
    company_phone: "office.phone",
  }))
    values[key] = values[source];
  if (contractId) {
    const [saved] = await db
      .select()
      .from(contractLegalSnapshots)
      .where(eq(contractLegalSnapshots.contractId, contractId));
    const model = saved?.documentModel as ContractDocument | undefined;
    if (!model?.data || model.data.contract_type !== input.contract_type)
      throw legalError(
        "العقد المحدد لا يطابق نوع الصيغة أو لا يملك نموذج معاينة محفوظاً.",
      );
    if (
      model.data.legal_context.jurisdiction !== input.jurisdiction ||
      model.data.legal_context.transaction_kind !== input.transaction_kind
    )
      throw legalError("اختصاص العقد ومعاملته لا يطابقان نطاق الصيغة.");
    const asset = model.data.assets.find(
      (a) =>
        input.property_type === "all_properties" ||
        a.property_type === input.property_type,
    );
    const stored = model.data.preview_values?.find(
      (v) => v.asset_id === asset?.id,
    );
    if (!asset || !stored)
      throw legalError(
        "جنس العقار لا يطابق الصيغة أو يلزم إعادة تجهيز المسودة لتوفير بيانات المعاينة.",
      );
    data = structuredClone(model.data);
    data.assets = [asset];
    data.additional_conditions =
      additionalConditions || model.data.additional_conditions;
    values = stored.values;
    facts = stored.facts;
  }
  const rendered = [];
  const warnings = ["معاينة محرر الصيغة — لا تمثل إصداراً أو اعتماداً."];
  for (const c of [...input.clauses].sort(
    (a, b) =>
      a.clause_order - b.clause_order ||
      a.clause_code.localeCompare(b.clause_code),
  )) {
    try {
      if (conditionsMatch(c.conditions_json, facts))
        rendered.push({
          code: c.clause_code,
          title: c.clause_title,
          text: interpolateLegalText(c.clause_content_ar, values),
          version: 0,
          required: c.is_required,
        });
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }
  const model: ContractDocument = {
    schema_version: 1,
    ready: false,
    warnings,
    review_required: true,
    data,
    legal_versions: [],
    sections: [
      {
        asset_id: data.assets[0].id,
        property_type: input.property_type,
        template_id: 0,
        version: 0,
        approval_status: "draft",
        title: input.title,
        legal_basis: input.legal_basis,
        applicability_notes: input.applicability_notes,
        clauses: rendered,
      },
    ],
  };
  const visual: VisualSnapshot = {
    id: t.id,
    template_code: t.templateCode ?? "",
    name: t.name,
    version: t.version,
    renderer_version: 1,
    layout_config: layoutSchema.parse(t.layoutConfig),
    branding_config: brandingSchema.parse(t.brandingConfig),
  };
  const variableKeys = [
    ...new Set(
      input.clauses.flatMap((c) =>
        [...c.clause_content_ar.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(
          (m) => m[1],
        ),
      ),
    ),
  ];
  return {
    ...renderVisual(model, visual),
    model,
    rendered_clauses: rendered,
    variables: variableKeys.map((key) => ({ key, value: values[key] ?? "" })),
  };
}
