import fs from "node:fs/promises";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  legalContractTemplates,
  legalContractClauses,
  documentTypes,
} from "../../infrastructure/database/schema.js";
import { resolveManagedFile } from "../documents/documents.storage.js";
import {
  conditionsMatch,
  interpolateLegalText,
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
const fields: Record<string, string> = {
  legal_type: "legalType",
  plot_number: "plotNumber",
  plot_letter: "plotLetter",
  subdistrict_number: "subdistrictNumber",
  subdistrict_name: "subdistrictName",
  mahalla: "mahalla",
  alley: "alley",
  house_number: "houseNumber",
  area_unit: "areaUnit",
  area_value: "areaValue",
  rent_period: "rentPeriod",
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
  for (const asset of assets) {
    const type = legalPropertyType(asset);
    const candidates = await executor
      .select()
      .from(legalContractTemplates)
      .where(
        and(
          eq(
            legalContractTemplates.contractType,
            payload.contract_type === "rental" ? "rental" : "sale",
          ),
          eq(legalContractTemplates.propertyType, type),
          eq(legalContractTemplates.jurisdiction, context.jurisdiction),
          eq(legalContractTemplates.transactionKind, context.transaction_kind),
        ),
      )
      .orderBy(desc(legalContractTemplates.version));
    const approved = candidates.filter(
      (r: typeof legalContractTemplates.$inferSelect) =>
        r.approvalStatus === "approved" && r.publicationStatus === "active",
    );
    const familyCodes = new Set(
      approved.map(
        (r: typeof legalContractTemplates.$inferSelect) => r.familyCode,
      ),
    );
    if (familyCodes.size > 1) {
      warnings.push(
        `يوجد أكثر من نطاق قانوني معتمد للعقار ${asset.code}؛ يلزم تحديد الصيغة.`,
      );
      continue;
    }
    const selected = (approved[0] ?? candidates[0]) as
      | typeof legalContractTemplates.$inferSelect
      | undefined;
    if (!selected) {
      warnings.push(
        `لا توجد صيغة قانونية مطابقة لجنس العقار ${type} ونوع المعاملة والاختصاص.`,
      );
      continue;
    }
    if (
      selected.approvalStatus !== "approved" ||
      selected.publicationStatus !== "active"
    )
      warnings.push(
        `الصيغة ${selected.title}، الإصدار ${selected.version} تحتاج اعتماداً وتفعيلاً.`,
      );
    const rows = await executor
      .select()
      .from(legalContractClauses)
      .where(eq(legalContractClauses.legalTemplateId, selected.id))
      .orderBy(
        asc(legalContractClauses.clauseOrder),
        asc(legalContractClauses.clauseCode),
      );
    const section: ContractDocument["sections"][number] = {
      asset_id: Number(asset.id),
      property_type: type,
      template_id: selected.id,
      version: selected.version,
      approval_status: selected.approvalStatus,
      title: selected.title,
      legal_basis: selected.legalBasis,
      applicability_notes: selected.applicabilityNotes,
      clauses: [],
    };
    const facts = {
      legal_type: asset.legalType,
      area_unit: asset.areaUnit,
      rent_period: asset.rentPeriod,
      intended_use: context.intended_use,
      amount: payload.amount,
      paid_amount: payload.paid_amount,
      remaining_amount: Number(payload.amount) - payload.paid_amount,
      registration_reference: context.registration_reference,
    };
    const assetValues = {
      ...values,
      "property.code": String(asset.code ?? ""),
      "property.name": String(asset.name ?? ""),
      "property.type":
        propertyLabels[String(asset.propertyType)] ??
        String(asset.propertyType ?? ""),
      "property.area": `${asset.areaValue ?? ""} ${asset.areaUnit ?? ""}`,
      "property.price": String(asset.totalPrice ?? asset.rentPrice ?? ""),
      "property.address": place(asset),
      ...Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [
          `property.${key}`,
          String(asset[field] ?? ""),
        ]),
      ),
    };
    previewValues.push({
      asset_id: Number(asset.id),
      values: assetValues,
      facts,
    });
    for (const c of rows as Array<typeof legalContractClauses.$inferSelect>) {
      try {
        if (!conditionsMatch(c.conditionsJson, facts)) continue;
        if (!c.isRequired) {
          optionalClauses.push({
            code: c.clauseCode,
            title: c.clauseTitle,
            asset_id: Number(asset.id),
          });
          if (!payload.optional_clause_codes.includes(c.clauseCode)) continue;
        }
        section.clauses.push({
          code: c.clauseCode,
          title: c.clauseTitle,
          text: interpolateLegalText(c.clauseContentAr, assetValues),
          version: c.version,
          required: c.isRequired,
        });
      } catch (error) {
        warnings.push(`${c.clauseTitle}: ${(error as Error).message}`);
      }
    }
    if (!section.clauses.some((c) => c.required))
      warnings.push(`لا توجد بنود إلزامية منطبقة على العقار ${asset.code}.`);
    sections.push(section);
    versions.push({
      id: selected.id,
      version: selected.version,
      property_type: type,
      approval_status: selected.approvalStatus,
      approved_by: selected.approvedBy,
      approved_at: selected.approvedAt?.toISOString() ?? null,
    });
  }
  for (const c of payload.optional_clause_codes)
    if (!optionalClauses.some((o) => o.code === c))
      warnings.push(`البند الإضافي ${c} غير منطبق على بيانات العقد.`);
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
  const model: ContractDocument = {
    schema_version: 1,
    ready: warnings.length === 0,
    warnings,
    review_required: Boolean(payload.notes?.trim()),
    review_reasons: payload.notes?.trim()
      ? ["الشروط الإضافية الحرة تتطلب مراجعة مختصة لهذا العقد."]
      : [],
    legal_versions: versions,
    sections,
    data: {
      code,
      contract_type: payload.contract_type,
      title:
        context.transaction_kind === "lease"
          ? "عقد إيجار عقار"
          : context.transaction_kind === "preliminary_sale"
            ? "اتفاق أولي لبيع عقار — لا يمثل نقل ملكية مسجلاً"
            : "توثيق بيانات تصرف مسجل — وفق مرجع التسجيل العقاري",
      legal_context: context,
      additional_conditions: payload.notes ?? "",
      preview_values: previewValues,
      office: {
        name: loaded.office?.companyName ?? "",
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
        identity_number:
          p.person.nationalId ??
          p.selected.find((d) => d.documentNumber)?.documentNumber ??
          "",
        phone: p.person.phonePrimary ?? "",
        address: p.person.address ?? "",
      })),
      assets: assets.map((a) => ({
        id: Number(a.id),
        property_type: legalPropertyType(a),
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
        { label: "المبلغ الإجمالي", value: money(payload.amount) },
        { label: "المدفوع", value: money(payload.paid_amount) },
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
                `${({ schedule: "جدول الدفع", payment_method: "طريقة الدفع", notes: "تفاصيل" } as Record<string, string>)[key] ?? key}: ${typeof value === "object" ? JSON.stringify(value) : (({ annual: "سنوي", monthly: "شهري", semi_annual: "نصف سنوي" } as Record<string, string>)[String(value)] ?? String(value))}`,
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
    renderer_version: 1,
    layout_config: layoutSchema.parse(t.layoutConfig),
    branding_config: brandingSchema.parse(t.brandingConfig),
  };
  return { model, visual, optionalClauses, ...renderVisual(model, visual) };
}
