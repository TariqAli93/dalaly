import AdmZip from "adm-zip";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import {
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
} from "../../infrastructure/database/schema.js";
import { ContractValidationError } from "../../shared/errors.js";
import { toApiObject } from "../../shared/utils/case.js";
import type {
  ContractFilters,
  ContractPayload,
  ContractTemplatePayload,
} from "./contracts.schema.js";

const ROLE_LABELS: Record<string, string> = {
  seller: "البائع",
  buyer: "المشتري",
  lessor: "المؤجر",
  lessee: "المستأجر",
};

function api(row: Record<string, unknown>) {
  return toApiObject(row);
}

async function generateCode(executor: any = db) {
  const [last] = await executor
    .select({ code: contracts.code })
    .from(contracts)
    .orderBy(desc(contracts.id))
    .limit(1);
  const next = last?.code ? Number(last.code.split("-")[1] ?? 0) + 1 : 1;
  return `CTR-${String(next).padStart(4, "0")}`;
}

export async function listTemplates(contractType?: "sale" | "rental") {
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
      body: payload.body,
      isActive: payload.is_active,
    })
    .returning();
  return api(row);
}

export async function updateTemplate(
  id: number,
  payload: ContractTemplatePayload,
) {
  const [row] = await db
    .update(contractTemplates)
    .set({
      contractType: payload.contract_type,
      name: payload.name,
      body: payload.body,
      isActive: payload.is_active,
      updatedAt: new Date(),
    })
    .where(eq(contractTemplates.id, id))
    .returning();
  return row ? api(row) : null;
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
  const [asset] = await db
    .select()
    .from(contractAssetSnapshots)
    .where(eq(contractAssetSnapshots.contractId, id))
    .limit(1);
  const attachments = await db
    .select()
    .from(contractAttachments)
    .where(eq(contractAttachments.contractId, id))
    .orderBy(contractAttachments.id);

  return {
    contract: api(row.contract),
    template: row.template ? api(row.template) : null,
    parties: partyRows.map((item) => ({
      ...api(item.party),
      person: api(item.person),
      snapshot: item.snapshot ? api(item.snapshot) : null,
    })),
    office: office ? api(office) : null,
    asset: asset ? api(asset) : null,
    attachments: attachments.map(api),
  };
}

export async function listContracts(filters: ContractFilters) {
  const where = [];
  if (filters.contract_type)
    where.push(eq(contracts.contractType, filters.contract_type));
  if (filters.status) where.push(eq(contracts.status, filters.status));
  if (filters.property_id)
    where.push(eq(contracts.propertyId, filters.property_id));
  if (filters.rental_id) where.push(eq(contracts.rentalId, filters.rental_id));
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
      const [party] = await db
        .select({ person: people, role: contractParties.role })
        .from(contractParties)
        .innerJoin(people, eq(contractParties.personId, people.id))
        .where(
          and(
            eq(contractParties.contractId, row.id),
            or(
              eq(contractParties.role, "seller"),
              eq(contractParties.role, "lessor"),
            ),
          ),
        )
        .limit(1);
      return {
        ...api(row),
        primary_person_name: party?.person.fullName ?? null,
        primary_party_role: party?.role ?? null,
      };
    }),
  );
}

export async function getContract(id: number) {
  return bundle(id);
}

async function requiredTypes(contractType: "sale" | "rental") {
  const scope = contractType === "sale" ? "sale" : "rent";
  return db
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
}

type ValidationParty = {
  person: typeof people.$inferSelect;
  documents: Array<typeof identityDocuments.$inferSelect>;
  selected: Array<typeof identityDocuments.$inferSelect>;
  role: string;
  inputIds: number[];
};

async function loadValidationData(payload: ContractPayload) {
  const issues: Array<{ code: string; message: string; path?: string }> = [];
  const asset =
    payload.contract_type === "sale"
      ? payload.property_id
        ? (
            await db
              .select()
              .from(properties)
              .where(eq(properties.id, payload.property_id))
              .limit(1)
          )[0]
        : null
      : payload.rental_id
        ? (
            await db
              .select()
              .from(rentals)
              .where(eq(rentals.id, payload.rental_id))
              .limit(1)
          )[0]
        : null;
  if (!asset)
    issues.push({
      code: "asset_missing",
      message: "العقار المرتبط بالعقد غير موجود.",
      path: "asset",
    });

  const template = payload.template_id
    ? (
        await db
          .select()
          .from(contractTemplates)
          .where(eq(contractTemplates.id, payload.template_id))
          .limit(1)
      )[0]
    : (
        await db
          .select()
          .from(contractTemplates)
          .where(
            and(
              eq(contractTemplates.contractType, payload.contract_type),
              eq(contractTemplates.isActive, true),
            ),
          )
          .orderBy(asc(contractTemplates.id))
          .limit(1)
      )[0];
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

  const [office] = await db
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

  const required = await requiredTypes(payload.contract_type);
  const partyData: ValidationParty[] = [];
  for (const input of payload.parties) {
    const [person] = await db
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
    if (!person.phonePrimary)
      issues.push({
        code: "person_incomplete",
        message: `رقم هاتف ${person.fullName} غير موجود.`,
        path: `parties.${input.role}.phone_primary`,
      });
    const docs = await db
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
    for (const type of required) {
      if (!selectedTypeIds.has(type.id))
        issues.push({
          code: "document_missing",
          message: `${type.name} غير موجود للمستخدم ${person.fullName}.`,
          path: `parties.${input.role}.documents`,
        });
    }
    const identityNumber =
      person.nationalId ??
      selected.find((doc) => doc.documentNumber)?.documentNumber ??
      null;
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
  return { asset, template, office, partyData, issues };
}

export async function validateContract(payload: ContractPayload) {
  const loaded = await loadValidationData(payload);
  return {
    valid: loaded.issues.length === 0,
    issues: loaded.issues,
    parties: loaded.partyData.map((item) => ({
      role: item.role,
      person: api(item.person),
      documents: item.documents.map(api),
      selected_document_ids: item.selected.map((doc) => doc.id),
    })),
  };
}

function formatDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleDateString("ar-IQ") : "";
}

function assetPlace(data: Record<string, unknown>) {
  return [
    data.governorate,
    data.district,
    data.neighborhood,
    data.address_details,
  ]
    .filter(Boolean)
    .join("، ");
}

function renderTemplate(body: string, values: Record<string, string>) {
  return body.replace(
    /{{\s*([a-z0-9_.]+)\s*}}/gi,
    (_match, key: string) => values[key] ?? "",
  );
}

function buildRenderValues(
  payload: ContractPayload,
  loaded: Awaited<ReturnType<typeof loadValidationData>>,
) {
  const values: Record<string, string> = {
    "contract.type": payload.contract_type,
    "contract.date": formatDate(payload.contract_date ?? new Date()),
    "contract.amount": payload.amount == null ? "" : String(payload.amount),
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
  // Backward-compatible aliases for templates created before the rebuild.
  values.seller_name = values["seller.full_name"] ?? "";
  values.buyer_name = values["buyer.full_name"] ?? "";
  values.landlord_name = values["lessor.full_name"] ?? "";
  values.tenant_name = values["lessee.full_name"] ?? "";
  values.property_address = values["property.address"] ?? "";
  values.contract_amount = values["contract.amount"] ?? "";
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
  const sourceType = payload.contract_type === "sale" ? "property" : "rental";
  const sourceId =
    payload.contract_type === "sale"
      ? payload.property_id!
      : payload.rental_id!;
  await tx.insert(contractAssetSnapshots).values({
    contractId,
    sourceType,
    sourceId,
    data: loaded.asset ?? {},
  });
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
      identityNumber:
        data.person.nationalId ??
        data.selected.find((doc) => doc.documentNumber)?.documentNumber ??
        null,
      phonePrimary: data.person.phonePrimary,
      phoneSecondary: data.person.phoneSecondary,
      email: data.person.email,
      address: data.person.address,
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
  return {
    content: renderTemplate(
      loaded.template!.body,
      buildRenderValues(payload, loaded),
    ),
    template: api(loaded.template!),
    office: loaded.office ? api(loaded.office) : null,
    asset: loaded.asset ? api(loaded.asset) : null,
  };
}

export async function createContract(payload: ContractPayload) {
  const loaded = await loadValidationData(payload);
  if (loaded.issues.length) throw new ContractValidationError(loaded.issues);
  const content = renderTemplate(
    loaded.template!.body,
    buildRenderValues(payload, loaded),
  );
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contracts)
      .values({
        code: await generateCode(tx),
        contractType: payload.contract_type,
        propertyId: payload.property_id ?? null,
        rentalId: payload.rental_id ?? null,
        templateId: loaded.template!.id,
        status: payload.status,
        contractDate: payload.contract_date ?? new Date(),
        startDate: payload.start_date ?? null,
        endDate: payload.end_date ?? null,
        amount: payload.amount == null ? null : String(payload.amount),
        paymentInfo: payload.payment_info,
        notes: payload.notes,
        generatedContent: content,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: contracts.id });
    await createSnapshots(tx, row.id, payload, loaded);
    return row.id;
  });
  return bundle(id);
}

export async function updateContract(id: number, payload: ContractPayload) {
  const [existing] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, id))
    .limit(1);
  if (!existing) return null;
  if (existing.status !== "draft")
    throw new ContractValidationError([
      { code: "immutable", message: "لا يمكن تعديل عقد صادر." },
    ]);
  const loaded = await loadValidationData(payload);
  if (loaded.issues.length) throw new ContractValidationError(loaded.issues);
  const content = renderTemplate(
    loaded.template!.body,
    buildRenderValues(payload, loaded),
  );
  await db.transaction(async (tx) => {
    await tx
      .update(contracts)
      .set({
        contractType: payload.contract_type,
        propertyId: payload.property_id ?? null,
        rentalId: payload.rental_id ?? null,
        templateId: loaded.template!.id,
        status: payload.status,
        contractDate: payload.contract_date ?? new Date(),
        startDate: payload.start_date ?? null,
        endDate: payload.end_date ?? null,
        amount: payload.amount == null ? null : String(payload.amount),
        paymentInfo: payload.payment_info,
        notes: payload.notes,
        generatedContent: content,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
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
    await tx.delete(contractParties).where(eq(contractParties.contractId, id));
    await tx
      .delete(contractOfficeSnapshots)
      .where(eq(contractOfficeSnapshots.contractId, id));
    await tx
      .delete(contractAssetSnapshots)
      .where(eq(contractAssetSnapshots.contractId, id));
    await createSnapshots(tx, id, payload, loaded);
  });
  return bundle(id);
}

export async function generateContract(id: number) {
  const existing = await bundle(id);
  if (!existing) return null;
  if (!existing.contract.generated_content) {
    const stored = existing.contract as Record<string, unknown>;
    const payload: ContractPayload = {
      contract_type: String(stored.contract_type) as "sale" | "rental",
      property_id:
        stored.property_id == null ? null : Number(stored.property_id),
      rental_id: stored.rental_id == null ? null : Number(stored.rental_id),
      template_id:
        stored.template_id == null ? null : Number(stored.template_id),
      status: String(stored.status) as ContractPayload["status"],
      contract_date: new Date(String(stored.contract_date)),
      start_date: stored.start_date
        ? new Date(String(stored.start_date))
        : null,
      end_date: stored.end_date ? new Date(String(stored.end_date)) : null,
      amount: stored.amount == null ? null : Number(stored.amount),
      payment_info: (stored.payment_info ?? {}) as Record<string, unknown>,
      notes: stored.notes == null ? null : String(stored.notes),
      parties: existing.parties.map((party) => {
        const row = party as Record<string, unknown>;
        const person = row.person as Record<string, unknown>;
        return {
          person_id: Number(person.id),
          role: String(row.role) as ContractPayload["parties"][number]["role"],
          identity_document_ids: [],
        };
      }),
    };
    const preview = await previewContract(payload);
    await db
      .update(contracts)
      .set({
        generatedContent: preview.content,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, id));
    return bundle(id);
  }
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

export async function contractDocx(id: number) {
  const contract = await generateContract(id);
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
    filename: `${contract.contract.code}.docx`,
    data: zip.toBuffer().toString("base64"),
  };
}
