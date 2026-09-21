import AdmZip from "adm-zip";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/db.js";
import { companySettings, contractParties, contracts, contractTemplates, customers, properties, rentals, type NewContract } from "../../infrastructure/database/schema.js";
import { toApiObject } from "../../shared/utils/case.js";
import { getDocumentRequirements } from "../documents/documents.repository.js";
import type { ContractFilters, ContractPayload, ContractTemplatePayload } from "./contracts.schema.js";

function api(row: Record<string, unknown>) { return toApiObject(row); }
async function generateCode() { const [last] = await db.select({ code: contracts.code }).from(contracts).orderBy(desc(contracts.id)).limit(1); return `CTR-${String((last?.code ? Number(last.code.split("-")[1] ?? 0) : 0) + 1).padStart(4, "0")}`; }
export async function listTemplates() { return (await db.select().from(contractTemplates).orderBy(contractTemplates.contractType)).map(api); }
export async function updateTemplate(contractType: string, payload: ContractTemplatePayload) { const [row] = await db.update(contractTemplates).set({ name: payload.name, body: payload.body, isActive: payload.is_active, updatedAt: new Date() }).where(eq(contractTemplates.contractType, contractType)).returning(); return row ? api(row) : null; }

async function bundle(id: number) {
  const [row] = await db.select({ contract: contracts, templateName: contractTemplates.name, templateBody: contractTemplates.body }).from(contracts).leftJoin(contractTemplates, eq(contracts.templateId, contractTemplates.id)).where(eq(contracts.id, id)).limit(1);
  if (!row) return null;
  const parties = await db.select({ party: contractParties, customerName: customers.fullName, customerPhone: customers.phonePrimary }).from(contractParties).innerJoin(customers, eq(contractParties.customerId, customers.id)).where(eq(contractParties.contractId, id));
  return { contract: api(row.contract), template_name: row.templateName, template_body: row.templateBody, parties: parties.map((item) => ({ ...api(item.party), customer_name: item.customerName, customer_phone: item.customerPhone })) };
}

export async function listContracts(filters: ContractFilters) {
  const where = []; if (filters.contract_type) where.push(eq(contracts.contractType, filters.contract_type)); if (filters.status) where.push(eq(contracts.status, filters.status)); if (filters.customer_id) where.push(eq(contracts.primaryCustomerId, filters.customer_id)); if (filters.property_id) where.push(eq(contracts.propertyId, filters.property_id)); if (filters.rental_id) where.push(eq(contracts.rentalId, filters.rental_id));
  const rows = await db.select({ contract: contracts, customerName: customers.fullName }).from(contracts).leftJoin(customers, eq(contracts.primaryCustomerId, customers.id)).where(where.length ? and(...where) : undefined).orderBy(desc(contracts.updatedAt), desc(contracts.id));
  return rows.map((row) => ({ ...api(row.contract), customer_name: row.customerName }));
}
export async function getContract(id: number) { return bundle(id); }

async function normalize(payload: ContractPayload): Promise<Omit<NewContract, "code">> {
  const template = payload.template_id ? (await db.select().from(contractTemplates).where(eq(contractTemplates.id, payload.template_id)).limit(1))[0] : (await db.select().from(contractTemplates).where(eq(contractTemplates.contractType, payload.contract_type)).limit(1))[0];
  return { contractType: payload.contract_type, primaryCustomerId: payload.customer_id ?? payload.parties[0]?.customer_id ?? null, propertyId: payload.property_id ?? null, rentalId: payload.rental_id ?? null, templateId: template?.id ?? null, status: payload.status, contractDate: payload.contract_date ?? new Date(), startDate: payload.start_date ?? null, endDate: payload.end_date ?? null, amount: payload.amount == null ? null : String(payload.amount), paymentInfo: payload.payment_info, notes: payload.notes, updatedAt: new Date() };
}
export async function createContract(payload: ContractPayload) {
  const created = await db.transaction(async (tx) => { const [row] = await tx.insert(contracts).values({ ...(await normalize(payload)), code: await generateCode() }).returning(); await tx.insert(contractParties).values(payload.parties.map((party) => ({ contractId: row.id, customerId: party.customer_id, role: party.role }))); return row; });
  const result = await generateContract(created.id); const missingDocuments = payload.parties.length ? (await Promise.all(payload.parties.map((party) => getDocumentRequirements(party.customer_id)))).flatMap((item) => item.missing) : [];
  return { ...(result ?? {}), missing_documents: missingDocuments };
}
export async function updateContract(id: number, payload: ContractPayload) {
  const updated = await db.transaction(async (tx) => { const [row] = await tx.update(contracts).set(await normalize(payload)).where(eq(contracts.id, id)).returning(); if (!row) return null; await tx.delete(contractParties).where(eq(contractParties.contractId, id)); await tx.insert(contractParties).values(payload.parties.map((party) => ({ contractId: id, customerId: party.customer_id, role: party.role }))); return row; });
  return updated ? generateContract(id) : null;
}

function xmlEscape(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function replaceTemplate(body: string, variables: Record<string, string>) { return body.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => variables[key] ?? ""); }
function formatDate(value: unknown) { return value ? new Date(String(value)).toLocaleDateString("ar-IQ") : ""; }
async function variablesFor(id: number) {
  const [row] = await db.select({ contract: contracts, templateBody: contractTemplates.body, company: companySettings, property: properties, rental: rentals }).from(contracts).leftJoin(contractTemplates, eq(contracts.templateId, contractTemplates.id)).leftJoin(companySettings, eq(companySettings.id, 1)).leftJoin(properties, eq(contracts.propertyId, properties.id)).leftJoin(rentals, eq(contracts.rentalId, rentals.id)).where(eq(contracts.id, id)).limit(1);
  if (!row) return null;
  const parties = await db.select({ role: contractParties.role, name: customers.fullName, phone: customers.phonePrimary }).from(contractParties).innerJoin(customers, eq(contractParties.customerId, customers.id)).where(eq(contractParties.contractId, id));
  const role = (name: string) => parties.find((party) => party.role === name);
  const place = row.property ? [row.property.governorate, row.property.district, row.property.neighborhood, row.property.addressDetails].filter(Boolean).join("، ") : [row.rental?.governorate, row.rental?.district, row.rental?.neighborhood, row.rental?.addressDetails].filter(Boolean).join("، ");
  return { body: row.templateBody ?? "", variables: { company_name: row.company?.companyName ?? "", company_address: row.company?.address ?? "", company_phone: row.company?.phonePrimary ?? "", customer_name: parties[0]?.name ?? "", customer_phone: parties[0]?.phone ?? "", seller_name: role("seller")?.name ?? "", buyer_name: role("buyer")?.name ?? "", tenant_name: role("tenant")?.name ?? "", landlord_name: role("landlord")?.name ?? "", property_address: place, contract_amount: row.contract.amount ?? "", contract_date: formatDate(row.contract.contractDate), start_date: formatDate(row.contract.startDate), end_date: formatDate(row.contract.endDate), notes: row.contract.notes ?? "" } };
}
export async function generateContract(id: number) { const values = await variablesFor(id); if (!values) return null; const content = replaceTemplate(values.body, values.variables); await db.update(contracts).set({ generatedContent: content, generatedAt: new Date(), updatedAt: new Date() }).where(eq(contracts.id, id)); return bundle(id); }
export async function contractDocx(id: number) {
  const contract = await generateContract(id); if (!contract) return null;
  const content = String(contract.contract.generated_content ?? "");
  const paragraphs = content.split(/\r?\n/).map((line) => `<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`));
  zip.addFile("_rels/.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`));
  zip.addFile("word/document.xml", Buffer.from(documentXml));
  return { filename: `${contract.contract.code}.docx`, data: zip.toBuffer().toString("base64") };
}
