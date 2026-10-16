import fs from "node:fs/promises";
import { legalWording, generateDocumentFile } from "./document-generation.service.js";
import { sha256 } from "./docx.engine.js";
import { residentialAddress, partyDocumentNumbers } from "./agreement-data.js";
import {
  SALE_EXPLANATION,
  RENTAL_PROCEDURES_NOTE,
  proceduresFor,
} from "./agreement.schema.js";
import { db } from "../../infrastructure/database/db.js";
import {
  documentTypes,
} from "../../infrastructure/database/schema.js";
import { resolveManagedFile } from "../documents/documents.storage.js";
import { snapshotAssetImages } from "./contract-asset-images.js";
import {
  legalPropertyType,
  type ContractDocument,
} from "./legal-content.engine.js";
import {
  layoutSchema,
  brandingSchema,
  renderVisual,
  type VisualSnapshot,
} from "./contract-visual.engine.js";
import type { ContractPayload } from "./contracts.schema.js";
import type {
  loadValidationData,
  buildRenderValues,
} from "./contracts.service.js";

type Loaded = Awaited<ReturnType<typeof loadValidationData>>;
const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleDateString("ar-IQ", {
        timeZone: "Asia/Baghdad",
      })
    : "";
const money = (v: unknown) => `${Number(v ?? 0).toLocaleString("ar-IQ")} د.ع`;
const place = (a: Record<string, unknown>) =>
  [
    a.governorate,
    a.district,
    a.neighborhood,
    a.addressDetails,
    a.address_details,
  ]
    .filter(Boolean)
    .join("، ");
const propertyLabels: Record<string, string> = {
  house: "بيت",
  apartment: "شقة",
  residential_land: "أرض سكنية",
  agricultural_land: "أرض زراعية / مزرعة",
  commercial: "عقار تجاري",
  warehouse: "مخزن",
  building: "بناية",
  villa: "فيلا",
  other: "أخرى",
  shop: "محل",
  office: "مكتب",
};
const fieldLabels: Record<string, string> = {
  plotNumber: "رقم القطعة",
  plotLetter: "حرف القطعة",
  subdistrictNumber: "رقم المقاطعة",
  subdistrictName: "اسم المقاطعة",
  mahalla: "المحلة",
  alley: "الزقاق",
  houseNumber: "رقم الدار",
  frontage: "الواجهة",
  nazal: "النزال",
  roomsCount: "الغرف",
  floorsCount: "الطوابق",
  nearestLandmark: "أقرب معلم",
};
const labels: Record<string, string> = {
  seller: "البائع",
  buyer: "المشتري",
  lessor: "المؤجر",
  lessee: "المستأجر",
};
export async function buildContractDocument(
  payload: ContractPayload,
  loaded: Loaded,
  values: ReturnType<typeof buildRenderValues>,
  code = "",
  executor: any = db,
) {
  const context = {
    ...payload.legal_context,
    transaction_kind:
      payload.legal_context.transaction_kind ??
      (payload.contract_type === "rental" ? "lease" : "preliminary_sale"),
  };
  const warnings: string[] = [],
    sections: ContractDocument["sections"] = [],
    versions: ContractDocument["legal_versions"] = [];
  const optionalClauses: Array<{
    code: string;
    title: string;
    asset_id: number;
  }> = [];
  const assets = ([...loaded.assets] as Array<Record<string, unknown>>).sort(
    (a, b) => Number(a.id) - Number(b.id),
  );
  const previewValues: NonNullable<ContractDocument["data"]["preview_values"]> =
    [];
  const multiValues = { ...values, "property.address": assets.map(place).filter(Boolean).join("؛ "), "office.owner_name": loaded.office?.ownerName ?? "", "office.involvement": payload.agreement_details.office_capacity === "broker" ? `وبوساطة مكتب ${loaded.office?.companyName ?? ""}` : `وبحضور مكتب ${loaded.office?.companyName ?? ""} بصفته ${labels[payload.agreement_details.office_capacity]}` };
  const wording = await legalWording(payload.contract_type, multiValues, payload.formulation_override, executor);
  sections.push({
    asset_id: Number(assets[0]?.id ?? 0), property_type: "all_properties",
    template_id: wording.row.id, version: wording.row.version, approval_status: "approved",
    title: wording.row.title, legal_basis: "", applicability_notes: "",
    clauses: [{ code: "formulation", title: wording.row.title, text: wording.text, version: wording.row.version, required: true }],
  });
  versions.push({ source: "formulation", id: wording.row.id, name: wording.row.title,
    version: wording.row.version, property_type: "all_properties", approval_status: "approved", approved_by: null, approved_at: null });
  const formulationSnapshot = { id: wording.row.id, title: wording.row.title, contract_type: wording.row.contractType,
    version: wording.row.version, content: wording.source, rendered_content: wording.text, hash: sha256(wording.source) };
  let logo = "";
  if (loaded.office?.logoFilePath) {
    const extension = loaded.office.logoFilePath
      .split(".")
      .pop()
      ?.toLowerCase();
    const mime = (
      { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp" } as Record<
        string,
        string
      >
    )[extension ?? ""];
    if (mime) {
      try {
        const file = await fs.readFile(
          resolveManagedFile(loaded.office.logoFilePath),
        );
        if (file.length <= 2 * 1024 * 1024)
          logo = `data:image/${mime};base64,${file.toString("base64")}`;
        else
          warnings.push("حجم شعار العقد يتجاوز ٢ ميغابايت؛ أعد رفع شعار أصغر.");
      } catch {
        warnings.push("تعذر تضمين شعار المكتب؛ أعد رفعه قبل الإصدار.");
      }
    } else warnings.push("يجب أن يكون شعار العقد بصيغة PNG أو JPEG أو WebP.");
  }
  const types = await executor.select().from(documentTypes);
  const assetImages = await snapshotAssetImages(
    payload.contract_type,
    assets.map((asset) => Number(asset.id)),
    executor,
  );
  const model: ContractDocument = {
    schema_version: 1,
    ready: warnings.length === 0,
    warnings,
    review_required: false,
    review_reasons: [],
    legal_versions: versions,
    sections,
    data: {
      code,
      contract_type: payload.contract_type,
      title:
        payload.contract_type === "rental"
          ? "اتفاق إيجار عقار"
          : "اتفاق بيع عقار",
      agreement_mode: "office",
      explanation:
        payload.contract_type === "rental"
          ? payload.agreement_details.rental_procedures_note
            ? RENTAL_PROCEDURES_NOTE
            : ""
          : SALE_EXPLANATION,
      agreement_terms: [
        { label: "شروط الدفع", value: payload.agreement_details.payment_terms },
        {
          label: "الموعد المتفق عليه لاستكمال نقل الملكية",
          value: payload.agreement_details.transfer_due_date
            ? date(payload.agreement_details.transfer_due_date)
            : "",
        },
        {
          label: "شروط التسليم",
          value: payload.agreement_details.handover_conditions,
        },
        ...(payload.contract_type === "rental"
          ? [
              {
                label: "شروط الإشغال",
                value: payload.agreement_details.occupancy_conditions,
              },
              {
                label: "مسؤوليات الماء والكهرباء والخدمات",
                value: payload.agreement_details.utilities_responsibilities,
              },
              {
                label: "مركز الشرطة المعني عند الاقتضاء",
                value: payload.agreement_details.police_station,
              },
              {
                label: "بيانات الموافقة الأمنية أو السكنية المتاحة",
                value: payload.agreement_details.security_approval_reference,
              },
            ]
          : []),
      ].filter((r) => r.value),
      witnesses: payload.agreement_details.witnesses,
      procedure_labels: proceduresFor(payload.contract_type).map(
        (p) => p.label,
      ),
      legal_context: context,
      additional_conditions: payload.notes ?? "",
      preview_values: previewValues,
      office: {
        name: loaded.office?.companyName ?? "",
        owner_name: loaded.office?.ownerName ?? "",
        role:
          payload.agreement_details.office_capacity === "broker"
            ? "الوسيط العقاري"
            : `طرف بصفة ${labels[payload.agreement_details.office_capacity]}`,
        address: loaded.office?.address ?? "",
        phone: loaded.office?.phonePrimary ?? "",
        phone_secondary: loaded.office?.phoneSecondary ?? "",
        email: loaded.office?.email ?? "",
        license_number: loaded.office?.licenseNumber ?? "",
        additional_contact: loaded.office?.additionalContact ?? "",
        logo_data_uri: logo,
      },
      parties: loaded.partyData.map((p) => ({
        role: p.role,
        label: labels[p.role],
        name: p.person.fullName,
        identity_number: partyDocumentNumbers(
          p.person,
          p.selected,
          loaded.documentTypes,
        ).identity,
        residence_card_number: partyDocumentNumbers(
          p.person,
          p.selected,
          loaded.documentTypes,
        ).residence,
        phone: p.person.phonePrimary ?? "",
        address: residentialAddress(p.person),
      })),
      assets: assets.map((a) => ({
        id: Number(a.id),
        property_type: legalPropertyType(a),
        ...(assetImages.has(Number(a.id))
          ? { image_data_uri: assetImages.get(Number(a.id)) }
          : {}),
        details: [
          { label: "العقار", value: String(a.name ?? a.code ?? "") },
          { label: "رمز العقار", value: String(a.code ?? "") },
          {
            label: "جنس العقار",
            value:
              propertyLabels[String(a.propertyType)] ??
              String(a.propertyType ?? ""),
          },
          { label: "العنوان", value: place(a) },
          {
            label: "المساحة",
            value: `${a.areaValue ?? ""} ${a.areaUnit ?? ""}`,
          },
          { label: "نوع السند", value: String(a.legalType ?? "") },
          {
            label: "وصف العقار",
            value: String(a.description ?? a.notes ?? ""),
          },
          {
            label: "تفاصيل الملكية المتاحة",
            value: String(a.ownershipDetails ?? ""),
          },
          { label: "المبلغ", value: money(a.totalPrice ?? a.rentPrice) },
          {
            label: "دورية الأجرة",
            value:
              (
                {
                  monthly: "شهري",
                  semi_annual: "نصف سنوي",
                  annual: "سنوي",
                } as Record<string, string>
              )[String(a.rentPeriod)] ?? "",
          },
          ...Object.entries(fieldLabels)
            .filter(([key]) => a[key] != null && a[key] !== "")
            .map(([key, label]) => ({ label, value: String(a[key]) })),
        ],
      })),
      financial: [
        {
          label:
            payload.contract_type === "rental"
              ? assets.every((a) => a.rentPeriod === "monthly")
                ? "الأجرة الشهرية المتفق عليها"
                : "الأجرة المتفق عليها للدورية المبينة"
              : "سعر البيع المتفق عليه",
          value: money(payload.amount),
        },
        {
          label:
            payload.contract_type === "rental"
              ? "الدفعة المقدمة"
              : "المدفوع عند التوقيع",
          value: money(payload.paid_amount),
        },
        {
          label: "المتبقي",
          value: money(Number(payload.amount) - payload.paid_amount),
        },
        {
          label: "معلومات الدفع",
          value: Object.entries(payload.payment_info)
            .filter(([key]) => key !== "paid_amount")
            .map(
              ([key, value]) =>
                `${({ schedule: "جدول الدفع", payment_method: "طريقة الدفع", notes: "تفاصيل", reference: "مرجع الدفع", reference_number: "رقم مرجع الدفع", method: "طريقة الدفع", date: "تاريخ الدفع" } as Record<string, string>)[key] ?? key}: ${typeof value === "object" ? JSON.stringify(value) : (({ annual: "سنوي", monthly: "شهري", semi_annual: "نصف سنوي" } as Record<string, string>)[String(value)] ?? String(value))}`,
            )
            .join("، "),
        },
      ],
      dates: [
        {
          label: "تاريخ العقد",
          value: date(payload.contract_date ?? new Date()),
        },
        { label: "بداية المدة", value: date(payload.start_date) },
        { label: "نهاية المدة", value: date(payload.end_date) },
        { label: "الاستخدام المتفق عليه", value: context.intended_use },
        { label: "مرجع التسجيل", value: context.registration_reference },
      ],
      attachments: loaded.partyData.flatMap((p) =>
        p.selected.map((doc) => ({
          party: labels[p.role],
          name:
            types.find(
              (t: typeof documentTypes.$inferSelect) =>
                t.id === doc.documentTypeId,
            )?.name ?? doc.documentName,
          number: doc.documentNumber ?? "",
        })),
      ),
    },
  };
  const t = loaded.template!;
  const visual: VisualSnapshot = {
    id: t.id,
    template_code: t.templateCode ?? "",
    name: t.name,
    version: t.version,
    renderer_version: payload.contract_type === "purchase" ? 1 : 2,
    layout_config: layoutSchema.parse(t.layoutConfig),
    branding_config: brandingSchema.parse(t.brandingConfig),
  };
  const file = await generateDocumentFile(t, model, multiValues);
  model.document_file_hash = file.docxHash;
  return { model, visual, optionalClauses, formulationSnapshot, ...file, ...renderVisual(model, visual) };
}
