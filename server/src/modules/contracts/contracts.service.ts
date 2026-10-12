import AdmZip from "adm-zip";
import {
  residentialAddress,
  residentialDetails,
  partyDocumentNumbers,
  identitySidesComplete,
} from "./agreement-data.js";
import { getAgreementFollowup } from "./agreement-followup.service.js";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { buildContractDocument } from "./contracts-document.service.js";
import { documentHash, type ContractDocument } from "./legal-content.engine.js";
import { legalError } from "./legal-content.service.js";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
  auditLogs,
  contractLegalSnapshots,
  legalContractTemplates,
  contractAssetSnapshots,
  contractAttachments,
  contractOfficeSnapshots,
  contractParties,
  contracts,
  contractTemplates,
  documentTypes,
  identityDocuments,
  officeProfiles,
  partySnapshots,
  people,
  properties,
  rentals,
  users,
} from "../../infrastructure/database/schema.js";
import { ContractValidationError } from "../../shared/errors.js";
import { toApiObject } from "../../shared/utils/case.js";
import type {
  ContractFilters,
  ContractPayload,
  ContractTemplatePayload,
  ContractCancellation,
  ContractSettlement,
} from "./contracts.schema.js";
import {
  contractCancellationSchema,
  contractSettlementSchema,
} from "./contracts.schema.js";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const ROLE_LABELS: Record<string, string> = {
  seller: "البائع",
  buyer: "المشتري",
  lessor: "المؤجر",
  lessee: "المستأجر",
};

function api(row: Record<string, unknown>) {
  return toApiObject(row);
}

function selectedAssetIds(payload: ContractPayload) {
  if (payload.contract_type !== "rental")
    return payload.property_ids.length
      ? payload.property_ids
      : payload.property_id
        ? [payload.property_id]
        : [];
  return payload.rental_ids.length
    ? payload.rental_ids
    : payload.rental_id
      ? [payload.rental_id]
      : [];
}

function assetSourceType(payload: ContractPayload) {
  return payload.contract_type === "rental" ? "rental" : "property";
}

async function generateCode(executor: Executor = db) {
  await executor.execute(sql`select pg_advisory_xact_lock(192819)`);
  const [last] = await executor
    .select({ code: contracts.code })
    .from(contracts)
    .orderBy(desc(contracts.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `CTR-${String(next).padStart(4, "0")}`;
}

export async function listTemplates(
  contractType?: "sale" | "rental" | "purchase",
) {
  const rows = await db
    .select()
    .from(contractTemplates)
    .where(
      contractType
        ? and(
            eq(contractTemplates.contractType, contractType),
            eq(contractTemplates.isActive, true),
          )
        : undefined,
    )
    .orderBy(asc(contractTemplates.contractType), asc(contractTemplates.name));
  return rows.map(api);
}

export async function createTemplate(payload: ContractTemplatePayload) {
  const [row] = await db
    .insert(contractTemplates)
    .values({
      contractType: payload.contract_type,
      name: payload.name,
      body: "{{document}}",
      templateCode: `custom_${randomUUID()}`,
      layoutConfig: payload.layout_config,
      brandingConfig: payload.branding_config,
      isActive: payload.is_active,
    })
    .returning();
  return api(row);
}

export async function updateTemplate(
  id: number,
  payload: ContractTemplatePayload,
) {
  const [existing] = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.id, id));
  if (!existing) return null;
  if (existing.contractType !== payload.contract_type)
    throw legalError("لا يمكن تغيير نوع القالب المرئي.");
  const [row] = await db
    .update(contractTemplates)
    .set({
      name: payload.name,
      body: "{{document}}",
      layoutConfig: payload.layout_config,
      brandingConfig: payload.branding_config,
      isActive: payload.is_active,
      version: sql`${contractTemplates.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(contractTemplates.id, id))
    .returning();
  return api(row);
}

async function bundle(id: number) {
  const [row] = await db
    .select({ contract: contracts, template: contractTemplates })
    .from(contracts)
    .leftJoin(contractTemplates, eq(contracts.templateId, contractTemplates.id))
    .where(eq(contracts.id, id))
    .limit(1);
  if (!row) return null;

  const partyRows = await db
    .select({
      party: contractParties,
      person: people,
      snapshot: partySnapshots,
    })
    .from(contractParties)
    .innerJoin(people, eq(contractParties.personId, people.id))
    .leftJoin(
      partySnapshots,
      eq(partySnapshots.contractPartyId, contractParties.id),
    )
    .where(eq(contractParties.contractId, id))
    .orderBy(contractParties.id);
  const [office] = await db
    .select()
    .from(contractOfficeSnapshots)
    .where(eq(contractOfficeSnapshots.contractId, id))
    .limit(1);
  const assets = await db
    .select()
    .from(contractAssetSnapshots)
    .where(eq(contractAssetSnapshots.contractId, id))
    .orderBy(contractAssetSnapshots.id);
  const attachments = await db
    .select()
    .from(contractAttachments)
    .where(eq(contractAttachments.contractId, id))
    .orderBy(contractAttachments.id);

  const [legal] = await db
    .select()
    .from(contractLegalSnapshots)
    .where(eq(contractLegalSnapshots.contractId, id));
  const history = await db
    .select({ entry: auditLogs, userName: users.displayName })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(
        eq(auditLogs.entityId, id),
        inArray(auditLogs.entityType, [
          "contract",
          "contract_legal_review",
          "contract_procedure",
        ]),
      ),
    )
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
  const archived = archiveDocument(row.contract);
  const financialRecords = history.filter(
    ({ entry }) =>
      entry.entityType === "contract" &&
      entry.action === "financial_settlement",
  );
  const allocated = (kind: string) =>
    financialRecords.reduce((sum, { entry }) => {
      const value = entry.newValue as { kind?: string; amount?: number } | null;
      return (
        sum +
        (value?.kind === kind ? Math.round(Number(value.amount) * 100) : 0)
      );
    }, 0) / 100;
  const refunded = allocated("refund"),
    retained = allocated("retained_payment"),
    obligation = allocated("remaining_obligation");
  const paid = Number(row.contract.paidAmount),
    remaining = Math.max(0, Number(row.contract.amount) - paid);
  return {
    followup: await getAgreementFollowup(id),
    legal_snapshot: legal ? api(legal) : null,
    contract: { ...api(row.contract), ...archived } as Record<string, unknown>,
    audit_history: history.map(({ entry, userName }) => ({
      ...api(entry),
      user_name: userName ?? null,
    })),
    financial_followup: {
      paid_amount: paid,
      remaining_amount: remaining,
      refunded_amount: refunded,
      retained_amount: retained,
      obligation_amount: obligation,
      unallocated_paid_amount: Math.max(
        0,
        Math.round((paid - refunded - retained) * 100) / 100,
      ),
      unallocated_remaining_amount: Math.max(
        0,
        Math.round((remaining - obligation) * 100) / 100,
      ),
      records: financialRecords.map(({ entry, userName }) => ({
        ...api(entry),
        user_name: userName ?? null,
      })),
    },
    template: row.template ? api(row.template) : null,
    parties: partyRows.map((item) => ({
      ...api(item.party),
      person: api(item.person),
      snapshot: item.snapshot ? api(item.snapshot) : null,
    })),
    office: office ? api(office) : null,
    // `asset` is retained for old renderer/API consumers; `assets` is the
    // complete immutable snapshot list for multi-asset contracts.
    asset: assets[0] ? api(assets[0]) : null,
    assets: assets.map(api),
    attachments: attachments.map(api),
  };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

// The original document and legal snapshot stay untouched. Every returned
// printable archive is visibly marked, including historical cancelled rows.
function archiveDocument(row: typeof contracts.$inferSelect) {
  if (row.status !== "cancelled") return {};
  const cancelledOn = row.cancelledAt
    ? formatDate(row.cancelledAt)
    : "غير مسجل تاريخياً";
  const heading = `ملغى — نسخة أرشيفية | تاريخ الإلغاء: ${cancelledOn}`;
  const notice =
    "الإلغاء إجراء إداري داخل النظام ولا يلغي تلقائياً العلاقة القانونية أو التسجيل الرسمي. المدفوعات والتسوية المالية تُعالج بإجراء مستقل موثق.";
  const banner = `<aside data-cancelled="true" style="border:3px solid #b42318;padding:12px;color:#b42318;font-weight:bold"><div>${escapeHtml(heading)}</div><div>${escapeHtml(row.cancellationReason ?? "")}</div><small>${escapeHtml(notice)}</small></aside><div aria-hidden="true" style="position:fixed;top:45%;left:10%;right:10%;text-align:center;color:#b42318;font-size:72px;opacity:.14;transform:rotate(-25deg);pointer-events:none;z-index:10">ملغى</div>`;
  const originalHtml = row.generatedHtml ?? "";
  const html = originalHtml
    ? /<body[^>]*>/i.test(originalHtml)
      ? originalHtml.replace(/<body[^>]*>/i, (body) => body + banner)
      : banner + originalHtml
    : `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:Tahoma,Arial;white-space:pre-wrap}</style></head><body>${banner}<pre>${escapeHtml(row.generatedContent ?? "")}</pre></body></html>`;
  return {
    generated_html: html,
    generated_content: `${heading}\n${row.cancellationReason ?? ""}\n${notice}\n\n${row.generatedContent ?? ""}`,
    archive_copy: true,
  };
}

export async function listContracts(filters: ContractFilters) {
  const where = [];
  if (filters.contract_type)
    where.push(eq(contracts.contractType, filters.contract_type));
  if (filters.status) where.push(eq(contracts.status, filters.status));
  if (filters.property_id)
    where.push(
      inArray(
        contracts.id,
        db
          .select({ id: contractAssetSnapshots.contractId })
          .from(contractAssetSnapshots)
          .where(
            and(
              eq(contractAssetSnapshots.sourceType, "property"),
              eq(contractAssetSnapshots.sourceId, filters.property_id),
            ),
          ),
      ),
    );
  if (filters.rental_id)
    where.push(
      inArray(
        contracts.id,
        db
          .select({ id: contractAssetSnapshots.contractId })
          .from(contractAssetSnapshots)
          .where(
            and(
              eq(contractAssetSnapshots.sourceType, "rental"),
              eq(contractAssetSnapshots.sourceId, filters.rental_id),
            ),
          ),
      ),
    );
  if (filters.person_id)
    where.push(
      inArray(
        contracts.id,
        db
          .select({ id: contractParties.contractId })
          .from(contractParties)
          .where(eq(contractParties.personId, filters.person_id)),
      ),
    );
  const rows = await db
    .select()
    .from(contracts)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(contracts.updatedAt), desc(contracts.id));
  return Promise.all(
    rows.map(async (row) => {
      const partyRows = await db
        .select({
          person: people,
          snapshot: partySnapshots,
          role: contractParties.role,
        })
        .from(contractParties)
        .innerJoin(people, eq(contractParties.personId, people.id))
        .leftJoin(
          partySnapshots,
          eq(partySnapshots.contractPartyId, contractParties.id),
        )
        .where(eq(contractParties.contractId, row.id))
        .orderBy(contractParties.id);
      const party = partyRows.find((item) =>
        ["seller", "lessor"].includes(item.role),
      );
      const assets = await db
        .select({ data: contractAssetSnapshots.data })
        .from(contractAssetSnapshots)
        .where(eq(contractAssetSnapshots.contractId, row.id))
        .orderBy(contractAssetSnapshots.id);
      const partyName = (item: (typeof partyRows)[number]) =>
        item.snapshot
          ? item.snapshot.fullName
          : row.status === "draft"
            ? item.person.fullName
            : "غير محفوظ في العقد التاريخي";
      return {
        ...api(row),
        primary_person_name: party ? partyName(party) : null,
        primary_party_role: party?.role ?? null,
        party_names: partyRows.map(partyName),
        property_name: assets
          .map(({ data }) => {
            const asset = data as Record<string, unknown>;
            return String(asset.name ?? asset.code ?? "");
          })
          .filter(Boolean)
          .join("، "),
      };
    }),
  );
}

export async function getContract(id: number) {
  return bundle(id);
}

export async function contractAttachmentFile(id: number, attachmentId: number) {
  const [attachment] = await db
    .select()
    .from(contractAttachments)
    .where(
      and(
        eq(contractAttachments.contractId, id),
        eq(contractAttachments.id, attachmentId),
      ),
    );
  return attachment ?? null;
}

async function requiredTypes(
  contractType: "sale" | "rental" | "purchase",
  role: string,
  executor: Executor = db,
) {
  const scope = contractType === "rental" ? "rent" : "sale";
  const types = await executor
    .select()
    .from(documentTypes)
    .where(
      and(
        eq(documentTypes.isActive, true),
        eq(documentTypes.isRequired, true),
        or(
          eq(documentTypes.transactionScope, "general"),
          eq(documentTypes.transactionScope, scope),
        ),
      ),
    )
    .orderBy(asc(documentTypes.name));
  const keys = ["national_id", "residence_card"];
  return types.filter((type) => keys.includes(type.key));
}

type ValidationParty = {
  person: typeof people.$inferSelect;
  documents: Array<typeof identityDocuments.$inferSelect>;
  selected: Array<typeof identityDocuments.$inferSelect>;
  role: string;
  inputIds: number[];
};

export async function loadValidationData(
  payload: ContractPayload,
  executor: Executor = db,
) {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const sourceType = assetSourceType(payload);
  const assetIds = selectedAssetIds(payload);
  const assetRows =
    sourceType === "property"
      ? await executor
          .select()
          .from(properties)
          .where(inArray(properties.id, assetIds))
      : await executor
          .select()
          .from(rentals)
          .where(inArray(rentals.id, assetIds));
  const asset = assetRows[0] ?? null;
  if (!assetRows.length)
    issues.push({
      code: "asset_missing",
      message: "العقار المرتبط بالعقد غير موجود.",
      path: "asset",
    });
  if (assetRows.length !== assetIds.length)
    issues.push({
      code: "asset_missing",
      message: "يوجد عقار أو عرض إيجاري محدد غير موجود.",
      path: "assets",
    });
  const totalAmount = assetRows.reduce(
    (total, row) =>
      total +
      Number(
        sourceType === "property"
          ? (row as typeof properties.$inferSelect).totalPrice
          : (row as typeof rentals.$inferSelect).rentPrice,
      ),
    0,
  );
  if (payload.amount == null || payload.amount <= 0)
    issues.push({
      code: "amount_missing",
      message: "المبلغ الإجمالي مطلوب.",
      path: "amount",
    });
  else if (Math.abs(payload.amount - totalAmount) > 0.01)
    issues.push({
      code: "amount_mismatch",
      message: "المبلغ الإجمالي يجب أن يساوي مجموع مبالغ العقارات المحددة.",
      path: "amount",
    });

  const template = payload.template_id
    ? (
        await executor
          .select()
          .from(contractTemplates)
          .where(eq(contractTemplates.id, payload.template_id))
          .limit(1)
      )[0]
    : (
        await executor
          .select()
          .from(contractTemplates)
          .where(
            and(
              eq(
                contractTemplates.contractType,
                payload.contract_type === "purchase"
                  ? "sale"
                  : payload.contract_type,
              ),
              eq(contractTemplates.isActive, true),
            ),
          )
          .orderBy(asc(contractTemplates.id))
          .limit(1)
      )[0];
  if (
    template &&
    template.contractType !==
      (payload.contract_type === "purchase" ? "sale" : payload.contract_type)
  )
    issues.push({
      code: "template_type",
      message: "القالب المرئي لا يطابق نوع العقد.",
      path: "template_id",
    });
  if (template && !template.isActive)
    issues.push({
      code: "template_inactive",
      message: "قالب العقد غير فعال.",
      path: "template_id",
    });
  if (!template)
    issues.push({
      code: "template_missing",
      message: "قالب العقد غير موجود أو غير فعال.",
      path: "template_id",
    });

  const [office] = await executor
    .select()
    .from(officeProfiles)
    .where(eq(officeProfiles.id, 1))
    .limit(1);
  if (!office?.companyName || !office.phonePrimary || !office.address)
    issues.push({
      code: "office_incomplete",
      message: "بيانات المكتب ناقصة: الاسم والهاتف والعنوان مطلوبة.",
      path: "office",
    });

  const allDocumentTypes = await executor.select().from(documentTypes);
  const partyData: ValidationParty[] = [];
  for (const input of payload.parties) {
    const [person] = await executor
      .select()
      .from(people)
      .where(eq(people.id, input.person_id))
      .limit(1);
    if (!person) {
      issues.push({
        code: "person_missing",
        message: `الشخص للدور ${ROLE_LABELS[input.role] ?? input.role} غير موجود.`,
        path: `parties.${input.role}`,
      });
      continue;
    }
    if (
      person.personType === "individual" &&
      person.fullName.trim().split(/\s+/).length < 4
    )
      issues.push({
        code: "person_incomplete",
        message: `أكمل الاسم الرباعي مع اللقب لـ ${person.fullName}.`,
        path: `parties.${input.role}.full_name`,
      });
    if (
      ![person.governorate, person.district, person.neighborhood].every(
        Boolean,
      ) ||
      !person.address?.trim()
    )
      issues.push({
        code: "address_missing",
        message: `أكمل المحافظة والقضاء أو الناحية والمنطقة لعنوان ${person.fullName}.`,
        path: `parties.${input.role}.address`,
      });
    if (
      !person.phonePrimary ||
      !/^[+0-9٠-٩۰-۹ ()-]{7,25}$/.test(person.phonePrimary)
    )
      issues.push({
        code: "person_incomplete",
        message: `رقم هاتف ${person.fullName} غير موجود.`,
        path: `parties.${input.role}.phone_primary`,
      });
    const docs = await executor
      .select()
      .from(identityDocuments)
      .where(
        and(
          eq(identityDocuments.personId, person.id),
          eq(identityDocuments.status, "active"),
        ),
      )
      .orderBy(desc(identityDocuments.uploadedAt));
    const validDocs = docs.filter(
      (doc) => !doc.expiresAt || doc.expiresAt > new Date(),
    );
    const selected = input.identity_document_ids.length
      ? validDocs.filter((doc) => input.identity_document_ids.includes(doc.id))
      : validDocs;
    const selectedTypeIds = new Set(
      selected.map((doc) => doc.documentTypeId).filter(Boolean),
    );
    if (
      input.identity_document_ids.some(
        (id) => !selected.some((d) => d.id === id),
      )
    )
      issues.push({
        code: "document_invalid",
        message: "المستمسك المحدد لا يخص الطرف أو غير صالح.",
        path: `parties.${input.role}.documents`,
      });
    const identityDocs = selected.filter((d) =>
      ["national_id", "civil_id"].includes(
        allDocumentTypes.find((t) => t.id === d.documentTypeId)?.key ?? "",
      ),
    );
    const numbers = partyDocumentNumbers(person, selected, allDocumentTypes);
    if (
      payload.agreement_details.identity_both_sides_required &&
      !identitySidesComplete(identityDocs, numbers.identity)
    )
      issues.push({
        code: "identity_sides",
        message: `أرفق وجهي الهوية لـ ${person.fullName}.`,
        path: `parties.${input.role}.documents`,
      });
    if (!numbers.residence)
      issues.push({
        code: "residence_number",
        message: `رقم بطاقة السكن غير موجود لـ ${person.fullName}.`,
        path: `parties.${input.role}.documents`,
      });
    const required = await requiredTypes(
      payload.contract_type,
      input.role,
      executor,
    );
    for (const type of required) {
      if (
        !selectedTypeIds.has(type.id) &&
        !(type.key === "national_id" && identityDocs.length)
      )
        issues.push({
          code: "document_missing",
          message: `${type.name} غير موجود للمستخدم ${person.fullName}.`,
          path: `parties.${input.role}.documents`,
        });
    }
    const identityNumber = numbers.identity;
    if (!identityNumber)
      issues.push({
        code: "identity_missing",
        message: `رقم الهوية غير موجود لـ ${person.fullName}.`,
        path: `parties.${input.role}.identity_number`,
      });
    partyData.push({
      person,
      documents: docs,
      selected,
      role: input.role,
      inputIds: input.identity_document_ids,
    });
  }
  return {
    asset,
    assets: assetRows,
    sourceType,
    totalAmount,
    template,
    office,
    partyData,
    issues,
    documentTypes: allDocumentTypes,
  };
}

export async function validateContract(payload: ContractPayload) {
  const loaded = await loadValidationData(payload);
  const document = loaded.issues.length
    ? null
    : await buildContractDocument(
        payload,
        loaded,
        buildRenderValues(payload, loaded),
      );
  if (payload.status !== "draft")
    loaded.issues.push({
      code: "review_required",
      message: "احفظ مسودة الاتفاق أولاً ثم أصدر نسخة للطباعة والتوقيع.",
    });
  return {
    valid: loaded.issues.length === 0,
    issues: loaded.issues,
    legal_ready: document?.model.ready ?? false,
    legal_warnings: document?.model.warnings ?? [],
    optional_clauses: document?.optionalClauses ?? [],
    parties: loaded.partyData.map((item) => ({
      role: item.role,
      person: api(item.person),
      documents: item.documents.map(api),
      selected_document_ids: item.selected.map((doc) => doc.id),
    })),
  };
}

function formatDate(value: unknown) {
  return value
    ? new Date(String(value)).toLocaleDateString("ar-IQ", {
        timeZone: "Asia/Baghdad",
      })
    : "";
}

function assetPlace(data: Record<string, unknown>) {
  return [
    data.governorate,
    data.district,
    data.neighborhood,
    data.addressDetails ?? data.address_details,
  ]
    .filter(Boolean)
    .join("، ");
}

export function buildRenderValues(
  payload: ContractPayload,
  loaded: Awaited<ReturnType<typeof loadValidationData>>,
) {
  const values: Record<string, string> = {
    "contract.type": payload.contract_type,
    "contract.transaction_kind":
      payload.legal_context.transaction_kind ??
      (payload.contract_type === "rental" ? "lease" : "preliminary_sale"),
    "contract.jurisdiction": payload.legal_context.jurisdiction,
    "contract.registration_reference":
      payload.legal_context.registration_reference,
    "contract.intended_use": payload.legal_context.intended_use,
    "contract.date": formatDate(payload.contract_date ?? new Date()),
    "contract.amount": payload.amount == null ? "" : String(payload.amount),
    "contract.paid_amount": String(payload.paid_amount ?? 0),
    "contract.remaining_amount": String(
      Math.max(
        0,
        Number(payload.amount ?? 0) - Number(payload.paid_amount ?? 0),
      ),
    ),
    "contract.start_date": formatDate(payload.start_date),
    "contract.end_date": formatDate(payload.end_date),
    "contract.notes": payload.notes ?? "",
    "office.name": loaded.office?.companyName ?? "",
    "office.address": loaded.office?.address ?? "",
    "office.phone": loaded.office?.phonePrimary ?? "",
    "office.phone_secondary": loaded.office?.phoneSecondary ?? "",
    "office.email": loaded.office?.email ?? "",
    "office.license_number": loaded.office?.licenseNumber ?? "",
    "office.additional_contact": loaded.office?.additionalContact ?? "",
    "property.address": loaded.asset
      ? assetPlace(loaded.asset as Record<string, unknown>)
      : "",
  };
  for (const item of loaded.partyData) {
    const prefix = item.role;
    const identityNumber =
      item.person.nationalId ??
      item.selected.find((doc) => doc.documentNumber)?.documentNumber ??
      "";
    values[`${prefix}.full_name`] = item.person.fullName;
    values[`${prefix}.identity_number`] = identityNumber;
    values[`${prefix}.phone`] = item.person.phonePrimary ?? "";
    values[`${prefix}.address`] = item.person.address ?? "";
    values[`${prefix}.email`] = item.person.email ?? "";
  }
  const asset = loaded.asset as Record<string, unknown> | null;
  if (asset) {
    values["property.code"] = String(asset.code ?? "");
    values["property.name"] = String(asset.name ?? "");
    values["property.type"] = String(asset.propertyType ?? "");
    values["property.area"] =
      `${asset.areaValue ?? ""} ${asset.areaUnit ?? ""}`.trim();
    values["property.price"] = String(
      asset.totalPrice ?? asset.rentPrice ?? "",
    );
    values["property.address"] = assetPlace(asset);
  }
  const assetRecords = loaded.assets as Array<Record<string, unknown>>;
  values["property.names"] = assetRecords
    .map((item) => String(item.name ?? item.code ?? ""))
    .filter(Boolean)
    .join("، ");
  values["property.addresses"] = assetRecords
    .map((item) => assetPlace(item))
    .filter(Boolean)
    .join("؛ ");
  values["property.total"] = String(loaded.totalAmount);
  // Backward-compatible aliases for templates created before the rebuild.
  values.seller_name = values["seller.full_name"] ?? "";
  values.buyer_name = values["buyer.full_name"] ?? "";
  values.landlord_name = values["lessor.full_name"] ?? "";
  values.tenant_name = values["lessee.full_name"] ?? "";
  values.property_address = values["property.address"] ?? "";
  values.contract_amount = values["contract.amount"] ?? "";
  values.paid_amount = values["contract.paid_amount"] ?? "";
  values.remaining_amount = values["contract.remaining_amount"] ?? "";
  values.contract_date = values["contract.date"] ?? "";
  values.start_date = values["contract.start_date"] ?? "";
  values.end_date = values["contract.end_date"] ?? "";
  values.notes = values["contract.notes"] ?? "";
  values.company_name = values["office.name"] ?? "";
  values.company_address = values["office.address"] ?? "";
  values.company_phone = values["office.phone"] ?? "";
  return values;
}

async function createSnapshots(
  tx: any,
  contractId: number,
  payload: ContractPayload,
  loaded: Awaited<ReturnType<typeof loadValidationData>>,
) {
  const [office] = await tx
    .insert(contractOfficeSnapshots)
    .values({
      contractId,
      officeName: loaded.office?.companyName ?? "",
      ownerName: loaded.office?.ownerName ?? null,
      logoFilePath: loaded.office?.logoFilePath ?? null,
      address: loaded.office?.address ?? null,
      phonePrimary: loaded.office?.phonePrimary ?? null,
      phoneSecondary: loaded.office?.phoneSecondary ?? null,
      email: loaded.office?.email ?? null,
      licenseNumber: loaded.office?.licenseNumber ?? null,
      additionalContact: loaded.office?.additionalContact ?? null,
    })
    .returning();
  void office;
  const assetRows = loaded.assets as Array<Record<string, unknown>>;
  const assetIds = selectedAssetIds(payload);
  await tx.insert(contractAssetSnapshots).values(
    assetIds.map((sourceId) => ({
      contractId,
      sourceType: assetSourceType(payload),
      sourceId,
      data:
        assetRows.find((row) => Number(row.id) === sourceId) ??
        ({} as Record<string, unknown>),
    })),
  );
  for (const input of payload.parties) {
    const data = loaded.partyData.find((item) => item.role === input.role);
    if (!data) continue;
    const [party] = await tx
      .insert(contractParties)
      .values({
        contractId,
        personId: input.person_id,
        role: input.role,
      })
      .returning();
    await tx.insert(partySnapshots).values({
      contractPartyId: party.id,
      fullName: data.person.fullName,
      identityNumber: partyDocumentNumbers(
        data.person,
        data.selected,
        loaded.documentTypes,
      ).identity,
      phonePrimary: data.person.phonePrimary,
      phoneSecondary: data.person.phoneSecondary,
      email: data.person.email,
      address: residentialAddress(data.person),
      residentialDetails: residentialDetails(data.person),
      residenceCardNumber: partyDocumentNumbers(
        data.person,
        data.selected,
        loaded.documentTypes,
      ).residence,
      notes: data.person.notes,
    });
    for (const doc of data.selected) {
      const type = doc.documentTypeId
        ? (
            await tx
              .select({ name: documentTypes.name })
              .from(documentTypes)
              .where(eq(documentTypes.id, doc.documentTypeId))
              .limit(1)
          )[0]
        : null;
      await tx.insert(contractAttachments).values({
        contractId,
        contractPartyId: party.id,
        identityDocumentId: doc.id,
        documentType: type?.name ?? null,
        documentName: doc.documentName,
        documentSide: doc.documentSide,
        documentNumber: doc.documentNumber,
        filePath: doc.filePath,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
      });
    }
  }
}

export async function previewContract(payload: ContractPayload) {
  const loaded = await loadValidationData(payload);
  if (loaded.issues.length) throw new ContractValidationError(loaded.issues);
  const result = await buildContractDocument(
    payload,
    loaded,
    buildRenderValues(payload, loaded),
  );
  return {
    content: result.content,
    html: result.html,
    document_model: result.model,
    template: api(loaded.template!),
    office: loaded.office ? api(loaded.office) : null,
    asset: loaded.asset ? api(loaded.asset) : null,
    assets: loaded.assets.map(api),
  };
}

async function saveDocumentSnapshot(
  tx: any,
  id: number,
  result: Awaited<ReturnType<typeof buildContractDocument>>,
  previousReview: unknown = null,
) {
  const hash = documentHash(result.model);
  const review =
    previousReview &&
    (previousReview as { content_hash: string }).content_hash === hash
      ? previousReview
      : null;
  await tx
    .insert(contractLegalSnapshots)
    .values({
      contractId: id,
      legalTemplateVersion: result.model.legal_versions,
      approvedClauseSnapshot: result.model.sections.filter(
        (s) => s.approval_status === "approved",
      ),
      documentModel: result.model,
      visualSnapshot: result.visual,
      contentHash: hash,
      review,
    })
    .onConflictDoUpdate({
      target: contractLegalSnapshots.contractId,
      set: {
        legalTemplateVersion: result.model.legal_versions,
        approvedClauseSnapshot: result.model.sections.filter(
          (s) => s.approval_status === "approved",
        ),
        documentModel: result.model,
        visualSnapshot: result.visual,
        contentHash: hash,
        review,
        createdAt: new Date(),
      },
    });
}
function contractValues(
  payload: ContractPayload,
  templateId: number,
  content: string,
  html: string,
) {
  return {
    contractType: payload.contract_type,
    propertyId:
      assetSourceType(payload) === "property"
        ? selectedAssetIds(payload)[0]
        : null,
    rentalId:
      assetSourceType(payload) === "rental"
        ? selectedAssetIds(payload)[0]
        : null,
    templateId,
    status: "draft",
    contractDate: payload.contract_date ?? new Date(),
    startDate: payload.start_date ?? null,
    endDate: payload.end_date ?? null,
    amount: String(payload.amount),
    paidAmount: String(payload.paid_amount),
    paymentInfo: payload.payment_info,
    notes: payload.notes,
    legalContext: payload.legal_context,
    agreementDetails: payload.agreement_details,
    optionalClauseCodes: payload.optional_clause_codes,
    generatedContent: content,
    generatedHtml: html,
    generatedAt: new Date(),
    updatedAt: new Date(),
  };
}
function requireDraft(payload: ContractPayload) {
  if (payload.status !== "draft")
    throw legalError("احفظ مسودة الاتفاق أولاً ثم أصدر نسخة للطباعة والتوقيع.");
}
export async function createContract(
  payload: ContractPayload,
  actorId?: number,
) {
  requireDraft(payload);
  const id = await db.transaction(
    async (tx) => {
      const loaded = await loadValidationData(payload, tx);
      if (loaded.issues.length)
        throw new ContractValidationError(loaded.issues);
      const code = await generateCode(tx);
      const result = await buildContractDocument(
        payload,
        loaded,
        buildRenderValues(payload, loaded),
        code,
        tx,
      );
      const [row] = await tx
        .insert(contracts)
        .values({
          code,
          ...contractValues(
            payload,
            loaded.template!.id,
            result.content,
            result.html,
          ),
        })
        .returning({ id: contracts.id });
      await createSnapshots(tx, row.id, payload, loaded);
      await saveDocumentSnapshot(tx, row.id, result);
      await tx.insert(auditLogs).values({
        entityType: "contract",
        entityId: row.id,
        action: "created",
        newValue: {
          code,
          status: "draft",
          content_hash: documentHash(result.model),
        },
        userId: actorId ?? null,
      });
      return row.id;
    },
    { isolationLevel: "repeatable read" },
  );
  return bundle(id);
}
export async function updateContract(
  id: number,
  payload: ContractPayload,
  actorId?: number,
) {
  requireDraft(payload);
  const found = await db.transaction(
    async (tx) => {
      const [existing] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .for("update");
      if (!existing) return false;
      if (existing.status !== "draft")
        throw legalError(
          "يمكن تعديل المسودات فقط؛ العقد الصادر أو الملغى محفوظ في السجل.",
        );
      const loaded = await loadValidationData(payload, tx);
      if (loaded.issues.length)
        throw new ContractValidationError(loaded.issues);
      const result = await buildContractDocument(
        payload,
        loaded,
        buildRenderValues(payload, loaded),
        existing.code,
        tx,
      );
      const [previous] = await tx
        .select()
        .from(contractLegalSnapshots)
        .where(eq(contractLegalSnapshots.contractId, id));
      await tx
        .update(contracts)
        .set(
          contractValues(
            payload,
            loaded.template!.id,
            result.content,
            result.html,
          ),
        )
        .where(eq(contracts.id, id));
      await tx
        .delete(contractAttachments)
        .where(eq(contractAttachments.contractId, id));
      await tx
        .delete(partySnapshots)
        .where(
          inArray(
            partySnapshots.contractPartyId,
            tx
              .select({ id: contractParties.id })
              .from(contractParties)
              .where(eq(contractParties.contractId, id)),
          ),
        );
      await tx
        .delete(contractParties)
        .where(eq(contractParties.contractId, id));
      await tx
        .delete(contractOfficeSnapshots)
        .where(eq(contractOfficeSnapshots.contractId, id));
      await tx
        .delete(contractAssetSnapshots)
        .where(eq(contractAssetSnapshots.contractId, id));
      await createSnapshots(tx, id, payload, loaded);
      await saveDocumentSnapshot(tx, id, result, previous?.review);
      await tx.insert(auditLogs).values({
        entityType: "contract",
        entityId: id,
        action: "updated",
        oldValue: {
          content_hash: previous?.contentHash ?? null,
          updated_at: existing.updatedAt,
        },
        newValue: { content_hash: documentHash(result.model), status: "draft" },
        userId: actorId ?? null,
      });
      return true;
    },
    { isolationLevel: "repeatable read" },
  );
  return found ? bundle(id) : null;
}
export async function reviewContract(
  id: number,
  actorId: number,
  comment: string,
  expectedHash: string,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .for("update");
    if (!row || row.status !== "draft")
      throw legalError("يمكن مراجعة مسودة محفوظة فقط.");
    const [snapshot] = await tx
      .select()
      .from(contractLegalSnapshots)
      .where(eq(contractLegalSnapshots.contractId, id));
    const document = snapshot?.documentModel as ContractDocument | undefined;
    if (!document?.ready || snapshot!.contentHash !== expectedHash)
      throw legalError(
        "تغيرت المسودة أو لا توجد بنود قانونية معتمدة منطبقة؛ أعد المعاينة والمراجعة.",
      );
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId));
    if (!actor?.isActive)
      throw legalError("المستخدم المسؤول عن المراجعة غير فعال.");
    const reviewer = { user_id: actor.id, display_name: actor.displayName };
    const review = {
      content_hash: snapshot!.contentHash,
      reviewer,
      reviewed_at: new Date().toISOString(),
      comment,
    };
    await tx
      .update(contractLegalSnapshots)
      .set({ review })
      .where(eq(contractLegalSnapshots.contractId, id));
    await tx.insert(auditLogs).values({
      entityType: "contract_legal_review",
      entityId: id,
      action: "approve_contract",
      oldValue: snapshot!.review,
      newValue: review,
      userId: actorId,
    });
  });
  return bundle(id);
}
export async function issueContract(id: number, actorId?: number) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .for("update");
    if (!row) throw legalError("العقد غير موجود.");
    if (row.status !== "draft") throw legalError("العقد صادر بالفعل.");
    const [s] = await tx
      .select()
      .from(contractLegalSnapshots)
      .where(eq(contractLegalSnapshots.contractId, id));
    const model = s?.documentModel as ContractDocument | undefined;
    if (!model?.ready || !row.generatedHtml)
      throw legalError("يجب استخدام صيغ معتمدة وفعالة قبل الإصدار.");
    for (const version of model!.legal_versions) {
      const [active] = await tx
        .select()
        .from(legalContractTemplates)
        .where(eq(legalContractTemplates.id, version.id))
        .for("share");
      if (
        !active ||
        active.approvalStatus !== "approved" ||
        active.publicationStatus !== "active"
      )
        throw legalError(
          "تغير الإصدار الفعال؛ أعد تجهيز المسودة بالصيغ الحالية قبل الإصدار.",
        );
    }
    await tx
      .update(contracts)
      .set({
        status: "active",
        issuedAt: new Date(),
        issuedBy: actorId ?? null,
        updatedAt: new Date(),
        generatedHtml: row.generatedHtml.replace(
          /<aside data-draft="true">[\s\S]*?<\/aside>/,
          "",
        ),
        generatedContent: row.generatedContent?.replace(
          /^مسودة — (?:تخضع لمراجعة العقد|لم يتم إصدار العقد)\n\n/,
          "",
        ),
      })
      .where(eq(contracts.id, id));
    await tx.insert(auditLogs).values({
      entityType: "contract",
      entityId: id,
      action: "issue",
      newValue: {
        content_hash: s!.contentHash,
        legal_versions: s!.legalTemplateVersion,
        visual: s!.visualSnapshot,
      },
      userId: actorId ?? null,
    });
  });
  return bundle(id);
}

export async function cancelContract(
  id: number,
  raw: ContractCancellation,
  actorId: number,
) {
  const input = contractCancellationSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .for("update");
    if (!row) throw legalError("العقد غير موجود.");
    if (row.status === "cancelled")
      throw legalError("العقد ملغى بالفعل؛ لا يمكن تكرار الإلغاء.");
    if (!["active", "completed", "expired"].includes(row.status))
      throw legalError("يمكن إلغاء عقد صادر فقط.");
    if (!row.generatedContent && !row.generatedHtml)
      throw legalError(
        "لا توجد نسخة أصلية محفوظة للعقد؛ أكمل توثيق العقد التاريخي قبل الإلغاء.",
      );
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId));
    if (!actor?.isActive)
      throw legalError("المستخدم المسؤول عن الإلغاء غير فعال.");
    const contractDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
    }).format(row.contractDate);
    const cancellationDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad",
    }).format(input.cancellation_date);
    if (cancellationDay < contractDay)
      throw new ContractValidationError([
        {
          code: "cancellation_date",
          path: "cancellation_date",
          message: "تاريخ الإلغاء لا يمكن أن يسبق تاريخ العقد.",
        },
      ]);
    await tx
      .update(contracts)
      .set({
        status: "cancelled",
        cancelledAt: input.cancellation_date,
        cancellationReason: input.reason,
        cancellationNotes: input.notes ?? null,
        cancelledBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id));
    // Payments, occupancy, asset availability, documents and issued snapshots
    // remain intact. Refunds/settlements and official legal effects require
    // their own documented actions; cancellation never infers those effects.
    await tx.insert(auditLogs).values({
      entityType: "contract",
      entityId: id,
      action: "cancel",
      oldValue: {
        status: row.status,
        paid_amount: row.paidAmount,
        payment_info: row.paymentInfo,
      },
      newValue: {
        status: "cancelled",
        cancelled_at: input.cancellation_date.toISOString(),
        cancellation_reason: input.reason,
        cancellation_notes: input.notes ?? null,
        cancelled_by: actorId,
        financial_followup_required: Number(row.paidAmount) > 0,
        administrative_cancellation: true,
        asset_released: false,
      },
      userId: actorId,
    });
  });
  return bundle(id);
}

export async function recordContractPrint(
  id: number,
  actorId: number,
  format: "print" | "pdf" | "docx" = "print",
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .for("share");
    if (!row) throw legalError("العقد غير موجود.");
    if (!row.generatedHtml && !row.generatedContent)
      throw legalError("لا توجد وثيقة محفوظة للطباعة أو التصدير.");
    await tx.insert(auditLogs).values({
      entityType: "contract",
      entityId: id,
      action: `${format}_requested`,
      newValue: {
        format,
        archive_copy: row.status === "cancelled",
        status: row.status,
      },
      userId: actorId,
    });
  });
  return bundle(id);
}

export async function recordContractSettlement(
  id: number,
  raw: ContractSettlement,
  actorId: number,
) {
  const input = contractSettlementSchema.parse(raw);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .for("update");
    if (!row || row.status !== "cancelled")
      throw legalError("تسوية الإلغاء تسجل لعقد ملغى فقط.");
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId));
    if (!actor?.isActive)
      throw legalError("المستخدم المسؤول عن التسوية غير فعال.");
    const history = await tx
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityType, "contract"),
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, "financial_settlement"),
        ),
      );
    const existing = history.find(
      (entry) =>
        (entry.newValue as { request_id?: string })?.request_id ===
        input.request_id,
    );
    if (existing) {
      const stored = existing.newValue as Record<string, unknown>;
      if (
        stored.kind !== input.kind ||
        Number(stored.amount) !== input.amount ||
        stored.reference !== input.reference ||
        stored.reason !== input.reason ||
        stored.settlement_date !== input.settlement_date.toISOString()
      )
        throw legalError(
          "معرّف طلب التسوية مستخدم لإجراء مختلف؛ أعد تحميل السجل.",
        );
      return;
    }
    const requestedCents = Math.round(input.amount * 100);
    const usedCents = history.reduce((sum, entry) => {
      const value = entry.newValue as { kind?: string; amount?: number };
      const samePool =
        input.kind === "remaining_obligation"
          ? value.kind === "remaining_obligation"
          : ["refund", "retained_payment"].includes(value.kind ?? "");
      return sum + (samePool ? Math.round(Number(value.amount) * 100) : 0);
    }, 0);
    const limitCents =
      input.kind === "remaining_obligation"
        ? Math.max(
            0,
            Math.round(Number(row.amount) * 100) -
              Math.round(Number(row.paidAmount) * 100),
          )
        : Math.round(Number(row.paidAmount) * 100);
    if (requestedCents + usedCents > limitCents)
      throw new ContractValidationError([
        {
          code: "settlement_amount",
          path: "amount",
          message:
            input.kind === "remaining_obligation"
              ? "الالتزام المسجل يتجاوز المبلغ المتبقي غير المخصص."
              : "الاسترداد والمبلغ المحتفظ به يتجاوزان المدفوع غير المخصص.",
        },
      ]);
    await tx.insert(auditLogs).values({
      entityType: "contract",
      entityId: id,
      action: "financial_settlement",
      userId: actorId,
      newValue: {
        request_id: input.request_id,
        kind: input.kind,
        amount: input.amount,
        reference: input.reference,
        reason: input.reason,
        settlement_date: input.settlement_date.toISOString(),
        recorded_by: actorId,
        financial_record_only: true,
      },
    });
  });
  return bundle(id);
}
export async function generateContract(id: number) {
  const existing = await bundle(id);
  if (!existing) return null;
  if (!existing.contract.generated_content)
    throw legalError(
      "لا توجد وثيقة تاريخية محفوظة لهذا العقد. يلزم إنشاء مسودة جديدة بدلاً من إعادة بناء عقد سابق من بيانات حالية.",
    );
  return existing;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function contractDocx(id: number, actorId?: number) {
  const contract = actorId
    ? await recordContractPrint(id, actorId, "docx")
    : await generateContract(id);
  if (!contract) return null;
  const content = String(contract.contract.generated_content ?? "");
  const paragraphs = content
    .split(/\r?\n/)
    .map(
      (line) =>
        `<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`,
    )
    .join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
  );
  zip.addFile(
    "_rels/.rels",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
  );
  zip.addFile("word/document.xml", Buffer.from(documentXml));
  return {
    filename: `${contract.contract.code}${contract.contract.status === "cancelled" ? "_ملغى" : contract.contract.status === "draft" ? "_مسودة" : ""}.docx`,
    data: zip.toBuffer().toString("base64"),
  };
}
