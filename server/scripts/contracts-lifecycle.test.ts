import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import pg from "pg";
import AdmZip from "adm-zip";
import { eq, sql } from "drizzle-orm";
import { config, buildPoolConfig } from "../src/infrastructure/config.js";
import { db } from "../src/infrastructure/database/db.js";
import { pool, reconfigurePool } from "../src/infrastructure/database/pool.js";
import * as tables from "../src/infrastructure/database/schema.js";
import { seedSystemRbac } from "../src/modules/rbac/rbac.service.js";
import { createAdmin, login } from "../src/modules/auth/auth.service.js";
import { buildServer } from "../src/server.js";
import {
  contractCancellationSchema,
  contractPayloadSchema,
} from "../src/modules/contracts/contracts.schema.js";
import {
  cancelContract,
  contractDocx,
  createContract,
  getContract,
  issueContract,
  listContracts,
  previewContract,
  recordContractPrint,
  reviewContract,
  updateContract,
  recordContractSettlement,
} from "../src/modules/contracts/contracts.service.js";
import {
  attachAgreementProcedure,
  updateAgreementProcedure,
} from "../src/modules/contracts/agreement-followup.service.js";
import { seedDocumentDefaults } from "../src/modules/contracts/document-defaults.js";
import { DEFAULT_DOCX } from "../src/modules/contracts/default-docx.assets.js";
import { inspectDocx } from "../src/modules/contracts/docx.engine.js";
import { createBackup, restoreBackup } from "../src/modules/backup/backup.service.js";

test("cancellation requires an explicit date and reason and rejects actor spoofing", () => {
  const cancellation_date = new Date().toISOString().slice(0, 10);
  assert.equal(contractCancellationSchema.parse({ reason: "  باتفاق الأطراف  ", cancellation_date }).reason, "باتفاق الأطراف");
  for (const body of [
    { reason: "", cancellation_date },
    { reason: "سبب" },
    { reason: "سبب", cancellation_date: null },
    { reason: "سبب", cancellation_date: "" },
    { reason: "سبب", cancellation_date: "not-a-date" },
    { reason: "سبب", cancellation_date: "2099-01-01" },
    { reason: "سبب", cancellation_date, cancelled_by: 1 },
  ]) assert.equal(contractCancellationSchema.safeParse(body).success, false);
});

// All migrations, API writes and deliberately failing transactions run only in
// a new disposable database. The user's configured application DB is untouched.
test("contract issue, archive printing, cancellation rollback and API permissions", async (t) => {
  const testDb = `dalaly_lifecycle_test_${Date.now()}`;
  const adminPool = new pg.Pool(buildPoolConfig());
  const originalPaths = {
    appDataDir: config.appDataDir,
    imagesDir: config.imagesDir,
    documentsDir: config.documentsDir,
    backupsDir: config.backupsDir,
  };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dalaly-lifecycle-test-"));
  Object.assign(config, { appDataDir: root, imagesDir: path.join(root, "images"), documentsDir: path.join(root, "documents"), backupsDir: path.join(root, "backups") });
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  try {
    await adminPool.query(`CREATE DATABASE "${testDb}"`);
    const connection = config.databaseUrl ? new URL(config.databaseUrl) : new URL(`postgresql://${encodeURIComponent(config.db.user)}:${encodeURIComponent(config.db.password)}@${config.db.host}:${config.db.port}/${testDb}`);
    connection.pathname = `/${testDb}`;
    await reconfigurePool(connection.toString());
    const migrations = path.resolve("drizzle");
    const journal = JSON.parse(await fs.readFile(path.join(migrations, "meta/_journal.json"), "utf8"));
    for (const entry of journal.entries) await pool.query(await fs.readFile(path.join(migrations, `${entry.tag}.sql`), "utf8"));
    const { markMigrationsSucceeded } = await import("../src/infrastructure/database/health.js");
    markMigrationsSucceeded(migrations);
    await seedSystemRbac();
    await seedDocumentDefaults();
    await db.insert(tables.documentTypes).values([
      { key: "national_id", name: "البطاقة الوطنية", transactionScope: "general", isRequired: true },
      { key: "residence_card", name: "بطاقة السكن", transactionScope: "general", isRequired: true },
    ]).onConflictDoNothing();
    const actor = await createAdmin("lifecycle_admin", "1234");
    await db.insert(tables.officeProfiles).values({ id: 1, companyName: "مكتب اختبار العقود", phonePrimary: "07700000000", address: "بغداد" }).onConflictDoUpdate({ target: tables.officeProfiles.id, set: { companyName: "مكتب اختبار العقود", phonePrimary: "07700000000", address: "بغداد" } });
    const parties = await db.insert(tables.people).values([
      { code: "P1", fullName: "مالك اختبار أول علي الكرخي", governorate: "بغداد", district: "الكرخ", neighborhood: "المنصور", address: "شارع اختبار", nationalId: "ID1", residenceCardNumber: "RC1", phonePrimary: "07711111111" },
      { code: "P2", fullName: "عميل اختبار ثان حسن البغدادي", governorate: "بغداد", district: "الرصافة", neighborhood: "زيونة", address: "عنوان اختبار", nationalId: "ID2", residenceCardNumber: "RC2", phonePrimary: "07722222222" },
    ]).returning();
    const types = await db.select().from(tables.documentTypes);
    await fs.mkdir(config.documentsDir, { recursive: true });
    await fs.writeFile(path.join(config.documentsDir, "fixture.pdf"), "%PDF-1.4 lifecycle fixture");
    for (const person of parties) for (const type of types.filter((type) => ["national_id", "residence_card"].includes(type.key))) await db.insert(tables.identityDocuments).values({ code: `D${person.id}_${type.id}`, personId: person.id, documentTypeId: type.id, documentName: type.name, documentNumber: `N${person.id}_${type.id}`, filePath: "fixture.pdf", fileType: "application/pdf" });
    const [property] = await db.insert(tables.properties).values({ code: "SALE", name: "بيت اختبار دورة العقد", propertyType: "house", legalType: "طابو ملك صرف", areaValue: "200", areaUnit: "متر", pricingMethod: "سعر إجمالي مباشر", totalPrice: "1000", ownerName: parties[0].fullName, ownerPhone: parties[0].phonePrimary }).returning();
    const [rental] = await db.insert(tables.rentals).values({ code: "RENT", name: "عرض إيجار اختبار", propertyType: "house", rentPrice: "500", rentPeriod: "monthly", areaValue: "100", areaUnit: "متر", ownerName: parties[0].fullName, ownerPhone: parties[0].phonePrimary }).returning();
    const today = new Date().toISOString().slice(0, 10);
    const sale = contractPayloadSchema.parse({ contract_type: "sale", property_ids: [property.id], amount: 1000, paid_amount: 200, payment_info: { reference: "PAY-200", schedule: "دفعات موثقة" }, contract_date: today, notes: "شرط إضافي متفق عليه دون اشتراط أهلية محامٍ", parties: parties.map((person, index) => ({ person_id: person.id, role: index ? "buyer" : "seller" })) });
    const lease = contractPayloadSchema.parse({ ...sale, contract_type: "rental", property_ids: [], rental_ids: [rental.id], amount: 500, start_date: today, end_date: "2027-12-31", parties: parties.map((person, index) => ({ person_id: person.id, role: index ? "lessee" : "lessor" })) });
    assert.equal((await db.select().from(tables.legalReviewers)).length, 0);
    app = await buildServer({ logger: false });
    const auth = await login("lifecycle_admin", "1234");
    assert(auth);
    const headers = { authorization: `Bearer ${auth.token}` };
    let issuedId = 0;
    let originalDocument: Record<string, unknown> = {};

    await t.test("formulation CRUD, import, defaults and template replacement preserve issued files and seeds", async () => {
      const api = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: any, expected = 200) => {
        const response = await app!.inject({ method, url: `/api${url}`, headers, payload });
        assert.equal(response.statusCode, expected, response.body);
        return response.json();
      };
      const initial = await api("GET", "/legal-content/formulations");
      assert.equal(initial.length, 2);
      assert(initial.every((row: any) => row.is_default));
      const original = initial.find((row: any) => row.contract_type === "sale");
      await api("PUT", `/legal-content/formulations/${original.id}`, { title: original.title, contract_type: "sale", content: original.content + "\nتعديل مكتب محفوظ.", version: original.version });
      await seedDocumentDefaults();
      const afterSeed = (await api("GET", "/legal-content/formulations")).find((row: any) => row.id === original.id);
      assert(afterSeed.content.includes("تعديل مكتب محفوظ"));
      assert.equal((await api("GET", "/contracts/templates")).length, 2);
      const imported = await api("POST", "/legal-content/formulations/import", { filename: "صيغة مكتب.txt", data: Buffer.from("اتفق {{seller_name}} مع {{buyer_name}}. المدفوع {{paid_amount}} والمتبقي {{remaining_amount}}.").toString("base64") });
      const custom = await api("POST", "/legal-content/formulations", { ...imported, contract_type: "sale" }, 201);
      const edited = await api("PUT", `/legal-content/formulations/${custom.id}`, { title: custom.title, contract_type: "sale", content: custom.content + "\nبند إضافي محفوظ.", version: custom.version });
      await api("PUT", `/legal-content/formulations/${custom.id}`, { title: custom.title, contract_type: "sale", content: custom.content, version: custom.version }, 409);
      const copied = await api("POST", `/legal-content/formulations/${custom.id}/copy`);
      assert.equal(copied.content, edited.content);
      await api("POST", `/legal-content/formulations/${custom.id}/default`);
      await seedDocumentDefaults();
      const selected = (await api("GET", "/legal-content/formulations")).filter((row: any) => row.contract_type === "sale" && row.is_default);
      assert.equal(selected.length, 1); assert.equal(selected[0].id, custom.id);
      const template = (await api("GET", "/contracts/templates")).find((row: any) => row.contract_type === "sale");
      const archive = new AdmZip(Buffer.from(DEFAULT_DOCX.sale, "base64"));
      archive.updateFile("word/document.xml", Buffer.from(archive.readAsText("word/document.xml").replace("اتفاق بيع عقار", "قالب المكتب الخاص")));
      const customDocx = archive.toBuffer().toString("base64");
      await api("POST", "/contracts/templates/inspect", { filename: "مكتب.docx", data: customDocx });
      await api("POST", `/contracts/templates/${template.id}/import`, { filename: "مكتب.docx", data: customDocx, version: template.version });
      const customDraft = await createContract({ ...sale, formulation_override: "نص خاص بهذا العقد: {{seller_name}}، المبلغ {{contract_amount}} والمدفوع {{paid_amount}}." }, actor.id);
      const id = Number(customDraft!.contract.id);
      const issued = await issueContract(id, actor.id);
      const file = await contractDocx(id);
      assert(file);
      const text = inspectDocx(Buffer.from(file.data, "base64")).text;
      assert(text.includes("قالب المكتب الخاص"));
      assert(text.includes(parties[0].fullName)); assert(text.includes("نص خاص بهذا العقد")); assert(text.includes("1000"));
      assert(!text.includes("{{"));
      assert.equal(issued!.legal_snapshot!.formulation_snapshot && (issued!.legal_snapshot!.formulation_snapshot as any).id, custom.id);
      await api("POST", "/legal-content/formulations/restore", { contract_type: "sale" });
      await api("POST", `/contracts/templates/${template.id}/restore`);
      await api("DELETE", `/legal-content/formulations/${custom.id}`);
      await api("DELETE", `/legal-content/formulations/${copied.id}`);
      await db.update(tables.people).set({ fullName: "اسم معدل بعد إصدار اختبار الوثيقة" }).where(eq(tables.people.id, parties[0].id));
      assert.equal((await contractDocx(id))!.data, file.data);
      assert.deepEqual((await getContract(id))!.legal_snapshot, issued!.legal_snapshot);
      await assert.rejects(() => db.update(tables.contractLegalSnapshots).set({ docxData: "tampered" }).where(eq(tables.contractLegalSnapshots.contractId, id)));
      await db.update(tables.people).set({ fullName: parties[0].fullName }).where(eq(tables.people.id, parties[0].id));
      assert.equal((await api("GET", "/legal-content/formulations")).length, 2);
      assert.equal((await api("GET", `/contracts/templates/${template.id}/file`)).data, DEFAULT_DOCX.sale);
      await api("POST", "/legal-content/formulations/import", { filename: "bad.txt", data: Buffer.from("{{bad_key}}").toString("base64") }, 400);
      assert.equal((await app!.inject({ method: "POST", url: "/api/legal-content", headers, payload: {} })).statusCode, 404);
    });

    await t.test("backup restore includes formulation data, template files and immutable DOCX snapshots", async () => {
      const existing = await db.select().from(tables.contractLegalSnapshots);
      const backup = await createBackup("manual");
      await restoreBackup(await fs.readFile(backup.file_path), "full");
      assert.deepEqual(await db.select().from(tables.contractLegalSnapshots), existing);
      assert.equal((await db.select().from(tables.legalFormulations)).filter(row => !row.deletedAt).length, 2);
      auth.token = (await login("lifecycle_admin", "1234"))!.token;
      headers.authorization = `Bearer ${auth.token}`;
    });

    await t.test("sale/rental previews and issue work without a lawyer, and retain snapshots", async () => {
      for (const payload of [sale, lease]) {
        const preview = await previewContract(payload);
        assert.equal(preview.document_model.ready, true);
        assert(preview.html.includes('dir="rtl"'));
        assert.match(preview.html, /@page\s*\{\s*size:\s*A4/);
        assert(preview.content.includes(payload.notes!));
        const draft = await createContract(payload, actor.id);
        assert(draft);
        const id = Number(draft.contract.id);
        await reviewContract(id, actor.id, "مراجعة مكتب موثقة للشروط الإضافية", String(draft.legal_snapshot!.content_hash));
        const issued = await issueContract(id, actor.id);
        assert(issued);
        assert.equal(issued.contract.status, "active");
        assert(issued.contract.issued_at);
        assert.equal(issued.contract.issued_by, actor.id);
        assert(!String(issued.contract.generated_html).includes('data-draft="true"'));
        await assert.rejects(() => issueContract(id, actor.id));
        await assert.rejects(() => updateContract(id, payload, actor.id));
        assert(issued.audit_history.some((entry) => entry.action === "created" && entry.user_name));
        assert(issued.audit_history.some((entry) => entry.action === "issue"));
        if (payload.contract_type === "sale") {
          issuedId = id;
          const [raw] = await db.select().from(tables.contracts).where(eq(tables.contracts.id, id));
          originalDocument = raw;
        }
      }
      await db.update(tables.people).set({ fullName: "اسم العميل تغير بعد الإصدار" }).where(eq(tables.people.id, parties[1].id));
      const summary = (await listContracts({})).find((entry) => entry.id === issuedId)!;
      assert.equal(summary.property_name, property.name);
      assert(summary.party_names.includes(parties[1].fullName));
      assert(!summary.party_names.includes("اسم العميل تغير بعد الإصدار"));
      // A legacy archive with a missing party snapshot must never borrow a
      // later live person's name. Restore mode simulates historical incomplete
      // data only inside this disposable test database.
      const legacyDraft = await createContract(sale, actor.id);
      const legacyId = Number(legacyDraft!.contract.id);
      const legacyIssued = await issueContract(legacyId, actor.id);
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('dalaly.restore','on',true)`);
        await tx.execute(sql`delete from party_snapshots where contract_party_id in (select id from contract_parties where contract_id=${legacyId})`);
      });
      const legacySummary = (await listContracts({})).find((entry) => entry.id === legacyId)!;
      assert(legacySummary.party_names.every((name) => name === "غير محفوظ في العقد التاريخي"));
      assert.equal(legacySummary.primary_person_name, "غير محفوظ في العقد التاريخي");
      assert.equal((await getContract(legacyId))!.contract.generated_content, legacyIssued!.contract.generated_content);
    });

    await t.test("direct API calls require specific issue/cancel/print permissions", async () => {
      const readonly = await createAdmin("readonly_user", "2345");
      await db.delete(tables.userRoles).where(eq(tables.userRoles.userId, readonly.id));
      const [role] = await db.insert(tables.roles).values({ name: "قراءة العقود للاختبار" }).returning();
      await db.insert(tables.userRoles).values({ userId: readonly.id, roleId: role.id });
      const permissions = await db.select().from(tables.permissions);
      for (const key of ["contracts.read", "contracts.manage"]) await db.insert(tables.rolePermissions).values({ roleId: role.id, permissionId: permissions.find((entry) => entry.key === key)!.id });
      const readAuth = await login("readonly_user", "2345");
      assert(readAuth);
      const restricted = { authorization: `Bearer ${readAuth.token}` };
      for (const route of ["issue", "cancel", "print-record", "settlements"]) {
        const response = await app!.inject({ method: "POST", url: `/api/contracts/${issuedId}/${route}`, headers: restricted, payload: { reason: "محاولة دون صلاحية", cancellation_date: today, format: "print" } });
        assert.equal(response.statusCode, 403, `${route}: ${response.body}`);
      }
      assert.equal((await app!.inject({ method: "GET", url: `/api/contracts/${issuedId}/docx`, headers: restricted })).statusCode, 403);
      assert.equal((await app!.inject({ method: "GET", url: `/api/contracts/${issuedId}`, headers: restricted })).statusCode, 200);
      const contract = await getContract(issuedId);
      const attachmentId = Number(contract!.attachments[0].id);
      assert.equal((await app!.inject({ method: "GET", url: `/api/contracts/${issuedId}/attachments/${attachmentId}/file`, headers: restricted })).statusCode, 200);
      const payloadBypass = await app!.inject({ method: "PUT", url: `/api/contracts/${issuedId}`, headers, payload: { ...sale, status: "cancelled" } });
      assert.equal(payloadBypass.statusCode, 400);
      const invalidReason = await app!.inject({ method: "POST", url: `/api/contracts/${issuedId}/cancel`, headers, payload: { reason: " ", cancellation_date: today } });
      assert.equal(invalidReason.statusCode, 400);
    });
    await t.test("a failed cancellation audit rolls back the status transaction", async () => {
      await pool.query("CREATE FUNCTION reject_test_cancel_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='cancel' THEN RAISE EXCEPTION 'simulated audit write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_test_cancel_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_cancel_audit()");
      await assert.rejects(() => cancelContract(issuedId, { reason: "اختبار التراجع", cancellation_date: new Date(today), notes: null }, actor.id));
      assert.equal((await getContract(issuedId))!.contract.status, "active");
      assert.equal((await getContract(issuedId))!.contract.cancelled_at, null);
      await pool.query("DROP TRIGGER reject_test_cancel_audit ON audit_logs; DROP FUNCTION reject_test_cancel_audit()");
    });

    await t.test("cancel keeps money, immutable wording and attachments, blocks mutations and marks exports", async () => {
      const before = await getContract(issuedId);
      const response = await app!.inject({ method: "POST", url: `/api/contracts/${issuedId}/cancel`, headers, payload: { reason: "إلغاء إداري بطلب الأطراف <script>", cancellation_date: today, notes: "التسوية المالية تسجل بإجراء منفصل" } });
      assert.equal(response.statusCode, 200, response.body);
      const cancelled = response.json();
      assert.equal(cancelled.contract.status, "cancelled");
      assert.equal(cancelled.contract.cancelled_by, actor.id);
      assert.equal(cancelled.followup.status, "cancelled");
      assert.equal(cancelled.contract.paid_amount, before!.contract.paid_amount);
      assert.deepEqual(cancelled.contract.payment_info, before!.contract.payment_info);
      assert.equal(cancelled.attachments.length, before!.attachments.length);
      assert.deepEqual(cancelled.legal_snapshot.document_model, JSON.parse(JSON.stringify(before!.legal_snapshot!.document_model)));
      assert(String(cancelled.contract.generated_html).includes('data-cancelled="true"'));
      assert(String(cancelled.contract.generated_html).includes("&lt;script&gt;"));
      assert(!String(cancelled.contract.generated_html).includes("إلغاء إداري بطلب الأطراف <script>"));
      const [raw] = await db.select().from(tables.contracts).where(eq(tables.contracts.id, issuedId));
      assert.equal(raw.generatedHtml, originalDocument.generatedHtml);
      assert.equal(raw.generatedContent, originalDocument.generatedContent);
      assert.equal((await db.select().from(tables.properties).where(eq(tables.properties.id, property.id)))[0].status, property.status);
      const audit = cancelled.audit_history.find((entry: any) => entry.action === "cancel");
      assert.equal(audit.user_id, actor.id);
      assert.equal(audit.new_value.financial_followup_required, true);
      assert.equal(audit.new_value.asset_released, false);
      await assert.rejects(() => cancelContract(issuedId, { reason: "محاولة تكرار", cancellation_date: new Date(today), notes: null }, actor.id));
      await assert.rejects(() => issueContract(issuedId, actor.id));
      await assert.rejects(() => updateContract(issuedId, sale, actor.id));
      await assert.rejects(() => updateAgreementProcedure(issuedId, { step_key: "signed", status: "pending", reference: "", notes: "" }, actor.id));
      await assert.rejects(() => attachAgreementProcedure(issuedId, { step_key: "signed", name: "ملف إضافي ممنوع", data: Buffer.from("%PDF test").toString("base64"), file_type: "application/pdf" }, actor.id));
      await assert.rejects(() => db.delete(tables.contracts).where(eq(tables.contracts.id, issuedId)));
      await assert.rejects(() => db.update(tables.contracts).set({ paidAmount: "0" }).where(eq(tables.contracts.id, issuedId)));
      const print = await recordContractPrint(issuedId, actor.id, "print");
      assert(print!.contract.archive_copy);
      assert(print!.audit_history.some((entry) => entry.action === "print_requested"));
      const pdf = await app!.inject({ method: "POST", url: `/api/contracts/${issuedId}/print-record`, headers, payload: { format: "pdf" } });
      assert.equal(pdf.statusCode, 200);
      assert(pdf.json().contract.generated_html.includes('data-cancelled="true"'));
      const docx = await contractDocx(issuedId, actor.id);
      assert(docx);
      assert(docx.filename.endsWith("_ملغى.docx"));
      const xml = new AdmZip(Buffer.from(docx.data, "base64")).readAsText("word/document.xml");
      assert(xml.includes("ملغى — نسخة أرشيفية"));
      assert((await getContract(issuedId))!.audit_history.some((entry) => entry.action === "docx_requested"));
      const draft = await createContract(sale, actor.id);
      await assert.rejects(() => cancelContract(Number(draft!.contract.id), { reason: "مسودة", cancellation_date: new Date(today), notes: null }, actor.id));
    });
    await t.test("cancellation finance uses separate bounded idempotent settlement records", async () => {
      const base = { reference: "SETTLEMENT-REF", reason: "تسوية مستقلة موثقة", settlement_date: new Date(today) };
      const refund = { ...base, kind: "refund" as const, amount: 125.5, request_id: randomUUID() };
      const first = await recordContractSettlement(issuedId, refund, actor.id);
      assert.equal(first!.financial_followup.refunded_amount, 125.5);
      assert.equal(first!.financial_followup.unallocated_paid_amount, 74.5);
      const second = await recordContractSettlement(issuedId, refund, actor.id);
      assert.equal(second!.financial_followup.records.length, 1);
      await assert.rejects(() => recordContractSettlement(issuedId, { ...refund, amount: 100 }, actor.id));
      const retained = { ...base, kind: "retained_payment" as const, amount: 74.5, request_id: randomUUID() };
      const kept = await recordContractSettlement(issuedId, retained, actor.id);
      assert.equal(kept!.financial_followup.retained_amount, 74.5);
      assert.equal(kept!.financial_followup.unallocated_paid_amount, 0);
      await assert.rejects(() => recordContractSettlement(issuedId, { ...refund, amount: 0.01, request_id: randomUUID() }, actor.id));
      const obligation = await recordContractSettlement(issuedId, { ...base, kind: "remaining_obligation", amount: 800, request_id: randomUUID() }, actor.id);
      assert.equal(obligation!.financial_followup.obligation_amount, 800);
      assert.equal(obligation!.financial_followup.unallocated_remaining_amount, 0);
      await assert.rejects(() => recordContractSettlement(issuedId, { ...base, kind: "remaining_obligation", amount: 1, request_id: randomUUID() }, actor.id));
      assert.equal(obligation!.contract.paid_amount, "200.00");
      assert.deepEqual(obligation!.contract.payment_info, originalDocument.paymentInfo);
      const duplicate = await app!.inject({ method: "POST", url: `/api/contracts/${issuedId}/settlements`, headers, payload: refund });
      assert.equal(duplicate.statusCode, 200, duplicate.body);
      assert.equal(duplicate.json().financial_followup.records.length, 3);
      const draft = await createContract(sale, actor.id);
      await assert.rejects(() => recordContractSettlement(Number(draft!.contract.id), { ...refund, request_id: randomUUID() }, actor.id));
      const invalid = await app!.inject({ method: "POST", url: `/api/contracts/${issuedId}/settlements`, headers, payload: { ...refund, reference: "", request_id: randomUUID() } });
      assert.equal(invalid.statusCode, 400);
      const concurrentDraft = await createContract(sale, actor.id);
      const concurrentId = Number(concurrentDraft!.contract.id);
      await issueContract(concurrentId, actor.id);
      await cancelContract(concurrentId, { reason: "اختبار حماية التسويات المتزامنة", cancellation_date: new Date(today), notes: null }, actor.id);
      const concurrent = await Promise.allSettled([
        recordContractSettlement(concurrentId, { ...base, kind: "refund", amount: 150, request_id: randomUUID() }, actor.id),
        recordContractSettlement(concurrentId, { ...base, kind: "retained_payment", amount: 150, request_id: randomUUID() }, actor.id),
      ]);
      assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
      const bounded = (await getContract(concurrentId))!.financial_followup;
      assert.equal(bounded.refunded_amount + bounded.retained_amount, 150);
      assert.equal(bounded.unallocated_paid_amount, 50);
    });

    if (process.env.CONTRACT_MANAGEMENT_BROWSER_TEST === "1") {
      await db.update(tables.people).set({ fullName: parties[1].fullName }).where(eq(tables.people.id, parties[1].id));
      const { verifyContractsManagementUi } = await import("./contracts-management-ui.js");
      await t.test("single-page creation, review, archive and template management in Chromium", () => verifyContractsManagementUi(app!, auth.token, {
        propertyName: property.name!, rentalName: rental.name!, ownerName: parties[0].fullName, customerName: parties[1].fullName, sale,
      }));
    }
  } finally {
    if (app) await app.close();
    await pool.end();
    await adminPool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [testDb]);
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDb}"`);
    await adminPool.end();
    Object.assign(config, originalPaths);
    await fs.rm(root, { recursive: true, force: true });
  }
});
