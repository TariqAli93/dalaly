import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import os from "node:os";
import { and, eq, sql } from "drizzle-orm";
import AdmZip from "adm-zip";
import { buildPoolConfig, config } from "../src/infrastructure/config.js";
import { reconfigurePool, pool } from "../src/infrastructure/database/pool.js";
import { db } from "../src/infrastructure/database/db.js";
import * as tables from "../src/infrastructure/database/schema.js";
import { seedSystemRbac } from "../src/modules/rbac/rbac.service.js";
import { createAdmin } from "../src/modules/auth/auth.service.js";
import {
  contractPayloadSchema,
  contractTemplateSchema,
} from "../src/modules/contracts/contracts.schema.js";
import {
  conditionsMatch,
  legalPropertyType,
} from "../src/modules/contracts/legal-content.engine.js";
import {
  listLegalContent,
  saveLegalRevision,
  decideLegalRevision,
  deleteLegalTemplate,
  validateRevision,
  revisionPayload,
  compareLegalRevisions,
  restoreLegalRevision,
  scheduleLegalRevision,
  legalNotifications,
  readLegalNotification,
} from "../src/modules/contracts/legal-content.service.js";
import {
  createContract,
  previewContract,
  getContract,
  updateContract,
  issueContract,
  reviewContract,
  updateTemplate,
  contractDocx,
  listTemplates,
} from "../src/modules/contracts/contracts.service.js";
import { getAgreementFollowup, updateAgreementProcedure, attachAgreementProcedure } from "../src/modules/contracts/agreement-followup.service.js";
import { buildServer } from "../src/server.js";
import { login } from "../src/modules/auth/auth.service.js";
import {
  createBackup,
  restoreBackup,
} from "../src/modules/backup/backup.service.js";

test("legal scopes and conditional clauses fail closed", () => {
  assert.equal(
    legalPropertyType({ propertyType: "أرض", legalType: "طابو زراعي ملك صرف" }),
    "agricultural_land",
  );
  assert.equal(legalPropertyType({ propertyType: "shop" }), "commercial");
  assert.equal(
    legalPropertyType({ propertyType: "أرض", legalType: "طابو ملك صرف" }),
    "land",
  );
  assert.equal(
    legalPropertyType({ propertyType: "unknown_special" }),
    "unknown_special",
  );
  assert(
    conditionsMatch(
      {
        all: [
          { field: "area_unit", op: "eq", value: "دونم" },
          { field: "paid_amount", op: "gt", value: 0 },
        ],
      },
      { area_unit: "دونم", paid_amount: 10 },
    ),
  );
  assert(
    !conditionsMatch(
      { all: [{ field: "legal_type", op: "neq", value: "x" }] },
      {},
    ),
  );
  assert(
    !conditionsMatch(
      { all: [{ field: "legal_type", op: "neq", value: "x" }] },
      { legal_type: "" },
    ),
  );
  assert.throws(() =>
    conditionsMatch(
      { all: [{ field: "javascript", op: "eq", value: "x" }] },
      {},
    ),
  );
});

// Runs only in a newly created temporary database. No approvals, demo lawyers,
// or test contract data are written into the user's application database.
test("migration, approval workflow, twelve visuals, snapshots and authorization", async (t) => {
  const testDb = `dalaly_legal_test_${Date.now()}`;
  const adminPool = new pg.Pool(buildPoolConfig());
  const testRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "dalaly-legal-test-"),
  );
  Object.assign(config, {
    appDataDir: testRoot,
    imagesDir: path.join(testRoot, "images"),
    documentsDir: path.join(testRoot, "documents"),
    backupsDir: path.join(testRoot, "backups"),
  });
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  try {
    await adminPool.query(`CREATE DATABASE "${testDb}"`);
    const connection = config.databaseUrl
      ? new URL(config.databaseUrl)
      : new URL(
          `postgresql://${encodeURIComponent(config.db.user)}:${encodeURIComponent(config.db.password)}@${config.db.host}:${config.db.port}/${testDb}`,
        );
    connection.pathname = `/${testDb}`;
    await reconfigurePool(connection.toString());
    const folder = path.resolve("drizzle");
    const journal = JSON.parse(
      await fs.readFile(path.join(folder, "meta/_journal.json"), "utf8"),
    );
    for (const entry of journal.entries.filter(
      (e: { idx: number }) => e.idx < 19,
    ))
      await pool.query(
        await fs.readFile(path.join(folder, `${entry.tag}.sql`), "utf8"),
      );
    const legacy = await pool.query(
      "INSERT INTO contracts(code,contract_type,status,generated_content) VALUES('LEGACY','sale','active','نص تاريخي محفوظ') RETURNING id",
    );
    await pool.query(
      await fs.readFile(
        path.join(folder, "0019_contract_legal_visual_separation.sql"),
        "utf8",
      ),
    );
    await pool.query(
      await fs.readFile(
        path.join(folder, "0020_legal_content_workflow.sql"),
        "utf8",
      ),
    );
    await pool.query(await fs.readFile(path.join(folder,"0021_office_agreements.sql"),"utf8"));
    await pool.query(await fs.readFile(path.join(folder,"0022_contract_management.sql"),"utf8"));
    const { markMigrationsSucceeded } = await import(
      "../src/infrastructure/database/health.js"
    );
    markMigrationsSucceeded(folder);
    await seedSystemRbac();
    const admin = await createAdmin("test_admin", "1234");
    assert.equal(
      (await getContract(legacy.rows[0].id))!.contract.generated_content,
      "نص تاريخي محفوظ",
    );
    assert.equal(
      (await getContract(legacy.rows[0].id))!.legal_snapshot!.content_hash,
      "legacy",
    );
    assert(
      (await listLegalContent()).filter(r => r.wording_origin !== "office_standard").every((r) => r.approval_status === "draft"),
    );

    const [office] = await db
      .insert(tables.officeProfiles)
      .values({
        id: 1,
        companyName: "مكتب اختبار <script>منع الحقن</script>",
        address: "بغداد، عنوان المكتب",
        phonePrimary: "07700000000",
      })
      .onConflictDoUpdate({
        target: tables.officeProfiles.id,
        set: {
          companyName: "مكتب اختبار <script>منع الحقن</script>",
          address: "بغداد، عنوان المكتب",
          phonePrimary: "07700000000",
        },
      })
      .returning();
    const logoBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1cAAAAASUVORK5CYII=",
      "base64",
    );
    await fs.mkdir(config.documentsDir, { recursive: true });
    await fs.writeFile(path.join(config.documentsDir, "office.png"), logoBytes);
    await db
      .update(tables.officeProfiles)
      .set({ logoFilePath: "office.png" })
      .where(eq(tables.officeProfiles.id, office.id));
    const parties = await db
      .insert(tables.people)
      .values([
        {
          code: "P1",
          fullName: "طرف اختبار أول علي الكرخي",
          governorate:"بغداد",district:"الكرخ",neighborhood:"المنصور",address:"شارع اختبار",residenceCardNumber:"RC1",
          nationalId: "TEST-1",
          phonePrimary: "07711111111",
        },
        {
          code: "P2",
          fullName: "طرف اختبار ثان حسن البغدادي",
          governorate:"بغداد",district:"الرصافة",neighborhood:"زيونة",address:"عنوان اختبار",residenceCardNumber:"RC2",
          nationalId: "TEST-2",
          phonePrimary: "07722222222",
        },
      ])
      .returning();
    const types = await db.select().from(tables.documentTypes);
    for (const p of parties)
      for (const type of types)
        await db.insert(tables.identityDocuments).values({
          code: `D${p.id}_${type.id}`,
          personId: p.id,
          documentTypeId: type.id,
          documentName: type.name,
          documentNumber: `N${p.id}_${type.id}`,
          filePath: "fixture.pdf",
          fileType: "application/pdf",
        });
    const [house, farm] = await db
      .insert(tables.properties)
      .values(
        ["بيت", "مزرعة"].map((propertyType, i) => ({
          code: `S${i}`,
          name: `عقار اختبار ${i}`,
          propertyType,
          legalType: i ? "طابو زراعي ملك صرف" : "طابو ملك صرف",
          areaValue: i ? "2" : "200",
          areaUnit: i ? "دونم" : "متر",
          pricingMethod: "سعر إجمالي مباشر",
          totalPrice: "1000",
          ownerName: "مالك اختبار",
          ownerPhone: "07733333333",
          addressDetails: "وصف العنوان",
        })),
      )
      .returning();
    const [rental, shop] = await db
      .insert(tables.rentals)
      .values(
        ["house", "shop"].map((propertyType, i) => ({
          code: `R${i}`,
          name: `إيجار اختبار ${i}`,
          propertyType,
          rentPrice: "500",
          rentPeriod: "monthly",
          areaValue: "100",
          areaUnit: "متر",
          ownerName: "مالك اختبار",
          ownerPhone: "07733333333",
        })),
      )
      .returning();
    const payload = (
      kind: "sale" | "rental",
      ids: number[],
      notes: string | null = null,
    ) =>
      contractPayloadSchema.parse({
        contract_type: kind,
        property_ids: kind === "sale" ? ids : [],
        rental_ids: kind === "rental" ? ids : [],
        amount: (kind === "sale" ? 1000 : 500) * ids.length,
        paid_amount: 100,
        contract_date: "2026-10-11",
        start_date: kind === "rental" ? "2026-10-11" : null,
        end_date: kind === "rental" ? "2027-10-11" : null,
        notes,
        parties: parties.map((p, i) => ({
          person_id: p.id,
          role:
            kind === "sale"
              ? i
                ? "buyer"
                : "seller"
              : i
                ? "lessee"
                : "lessor",
        })),
      });
    const sale = payload("sale", [house.id]);
    const draft = await createContract(sale);
    assert(draft);
    assert.equal(
      (draft.legal_snapshot!.document_model as { ready: boolean }).ready,
      true,
    );
    const initialRentalDraft = await createContract({
      ...payload("rental", [rental.id]),
      payment_info: { paid_amount: 100, schedule: "جدول اختبار محفوظ" },
    });
    assert(initialRentalDraft);
    await t.test("ordinary office agreements, identity validation and independent official follow-up",async () => {
      assert.equal((await db.select().from(tables.legalReviewers)).length,0);
      const ordinary = await createContract({...payload("rental",[rental.id],"شرط متفق عليه بين الطرفين"),agreement_details:{...payload("rental",[rental.id]).agreement_details,occupancy_conditions:"سكن عائلة",utilities_responsibilities:"الماء على المؤجر والكهرباء على المستأجر",police_station:"مركز اختبار",witnesses:[{name:"شاهد اختبار كامل الاسم"}]}});
      assert.equal(ordinary!.legal_snapshot!.document_model.review_required,false);
      assert(String(ordinary!.contract.generated_content).includes("اتفاق إيجار عقار"));
      assert(String(ordinary!.contract.generated_content).includes("بصفته الطرف الأول (المؤجر)"));
      assert(String(ordinary!.contract.generated_content).includes("RC1"));
      const ownOffice = await createContract({...sale,agreement_details:{...sale.agreement_details,office_capacity:"seller"}});
      assert(String(ownOffice!.contract.generated_content).includes("طرف بصفة البائع"));
      assert(!String(ownOffice!.contract.generated_content).includes("وبوساطة مكتب"));
      const identityTypes = types.filter(t => ["national_id","civil_id","residence_card"].includes(t.key));
      const ids = await db.select().from(tables.identityDocuments);
      const withoutSecurity = payload("rental",[rental.id]);
      withoutSecurity.parties = withoutSecurity.parties.map(p => ({...p,identity_document_ids:ids.filter(d => d.personId === p.person_id && identityTypes.some(t => t.id === d.documentTypeId)).map(d => d.id)}));
      assert((await createContract(withoutSecurity))!.contract.id);
      await assert.rejects(() => createContract({...withoutSecurity,agreement_details:{...withoutSecurity.agreement_details,identity_both_sides_required:true}}));
      const docId = ids.find(d => d.personId === parties[0].id && types.find(t => t.id === d.documentTypeId)?.key === "national_id")!.id;
      await db.update(tables.identityDocuments).set({documentSide:"both"}).where(eq(tables.identityDocuments.id,docId));
      const secondDoc = ids.find(d => d.personId === parties[1].id && types.find(t => t.id === d.documentTypeId)?.key === "national_id")!.id;
      await db.update(tables.identityDocuments).set({documentSide:"both"}).where(eq(tables.identityDocuments.id,secondDoc));
      assert((await createContract({...withoutSecurity,agreement_details:{...withoutSecurity.agreement_details,identity_both_sides_required:true}}))!.contract.id);
      const issued = await issueContract(Number(ordinary!.contract.id),admin.id);
      assert.equal(issued!.followup!.status,"issued_unsigned");
      assert(!String(issued!.contract.generated_html).includes('data-draft="true"'));
      const today=new Date().toISOString().slice(0,10), cid=Number(issued!.contract.id);
      const step = async (key:string,status="completed",reference="",expected:string|null=null) => updateAgreementProcedure(cid,{step_key:key,status,completed_on:status === "completed" ? today : null,reference,notes:"",expected_updated_at:expected},admin.id);
      await assert.rejects(() => step("security_approved","completed","مرجع موافقة"));
      const signed=await step("signed");assert.equal(signed!.status,"signed");
      await assert.rejects(() => step("signed")); // Optimistic concurrency.
      await step("documents_submitted"); await step("lease_registered","not_applicable");
      await step("security_requested","not_applicable");await step("security_approved","not_applicable");await step("handed_over");
      assert.equal((await getAgreementFollowup(cid))!.status,"procedures_completed");
      const attached=await attachAgreementProcedure(cid,{step_key:"signed",name:"مرفق توقيع اختباري",data:Buffer.from("%PDF-1.4 test-only").toString("base64"),file_type:"application/pdf"},admin.id);
      assert.equal(attached!.steps[0].attachments.length,1);
      assert.equal((await getContract(cid))!.contract.generated_html,issued!.contract.generated_html);
      const saleOffice = await createContract(sale); assert(String(saleOffice!.contract.generated_content).includes("ولا يُعد سنداً ناقلاً لملكية العقار"));
      const saleIssued=await issueContract(Number(saleOffice!.contract.id),admin.id);
      await assert.rejects(() => updateAgreementProcedure(Number(saleIssued!.contract.id),{step_key:"ownership_transferred",status:"completed",completed_on:today,reference:"مرجع التسجيل"},admin.id));
      await assert.rejects(() => updateAgreementProcedure(Number(saleIssued!.contract.id),{step_key:"signed",status:"not_applicable"},admin.id));
      const incompletePerson = await db.update(tables.people).set({district:null}).where(eq(tables.people.id,parties[0].id));
      void incompletePerson; await assert.rejects(() => createContract(sale));
      await db.update(tables.people).set({district:"الكرخ"}).where(eq(tables.people.id,parties[0].id));
    });

    const createRevision = async (
      type: "sale" | "rental",
      scope: string,
      wording = "نص اختباري للمراجعة {{property.name}}",
    ) => {
      const previous = (await listLegalContent()).find(
        (r) => r.contract_type === type && r.property_type === scope && !r.is_system,
      )!;
      return saveLegalRevision(
        {
          contract_type: type,
          property_type: scope,
          jurisdiction: "iq_federal",
          transaction_kind: type === "rental" ? "lease" : "preliminary_sale",
          title: `صيغة اختبار ${scope}`,
          legal_basis: "مرجع اختبار فقط؛ ليس نصاً قانونياً للاستخدام الفعلي",
          applicability_notes: "نطاق اختبار فقط؛ تحقق من ظروف كل عقد",
          revision_note: "اختبار إصدار مستقل",
          priority: 1,
          clauses: [
            {
              clause_code: "subject",
              clause_title: "بند اختباري",
              clause_content_ar: wording,
              clause_order: 1,
              is_required: true,
              conditions_json: { all: [] },
            },
            {
              clause_code: "paid",
              clause_title: "بند شرطي اختباري",
              clause_content_ar: "مدفوع اختباري {{contract.paid_amount}}",
              clause_order: 2,
              is_required: true,
              conditions_json: {
                all: [{ field: "paid_amount", op: "gt", value: 0 }],
              },
            },
            {
              clause_code: "extra",
              clause_title: "إضافي اختباري",
              clause_content_ar: "شرط اختياري للاختبار",
              clause_order: 3,
              is_required: false,
              conditions_json: { all: [] },
            },
          ],
        },
        admin.id,
        previous ? Number(previous.id) : undefined,
      );
    };
    const saleRevision = await createRevision("sale", "house");
    await decideLegalRevision(
      Number(saleRevision.id),
      { action: "submit", comment: "طلب اختبار" },
      admin.id,
    );
    assert.equal((await db.select().from(tables.legalReviewers)).length, 0);
    await decideLegalRevision(
      Number(saleRevision.id),
      { action: "approve_publish", comment: "اعتماد اختبار فقط" },
      admin.id,
    );
    await decideLegalRevision(Number(saleRevision.id), { action: "default", comment: "اختيار الصيغة الاختبارية الافتراضية للبيع" }, admin.id);
    const approve = async (type: "sale" | "rental", scope: string) => {
      const r = await createRevision(type, scope);
      await decideLegalRevision(
        Number(r.id),
        { action: "submit", comment: "طلب اختبار" },
        admin.id,
      );
      await decideLegalRevision(
        Number(r.id),
        { action: "approve_publish", comment: "اعتماد اختبار فقط" },
        admin.id,
      );
    };
    await approve("sale", "agricultural_land");
    await approve("rental", "house");
    await approve("rental", "commercial");
    const rentalDefault = (await listLegalContent()).find((r) => r.contract_type === "rental" && r.property_type === "house" && r.publication_status === "active")!;
    await decideLegalRevision(Number(rentalDefault.id), { action: "default", comment: "اختيار الصيغة الاختبارية الافتراضية للإيجار" }, admin.id);

    await t.test(
      "all six visual designs in each domain have identical legal content and data",
      async () => {
        for (const kind of ["sale", "rental"] as const) {
          const templates = await listTemplates(kind);
          assert.equal(templates.length, 6);
          const baseline = await previewContract(
            payload(kind, [kind === "sale" ? house.id : rental.id]),
          );
          const designs = new Set<string>();
          for (const template of templates) {
            const preview = await previewContract({
              ...payload(kind, [kind === "sale" ? house.id : rental.id]),
              template_id: Number(template.id),
            });
            assert.deepEqual(preview.document_model, baseline.document_model);
            assert.equal(preview.content, baseline.content);
            designs.add(preview.html);
            assert(preview.html.includes("&lt;script&gt;"));
            assert(
              preview.html.includes(
                `data:image/png;base64,${logoBytes.toString("base64")}`,
              ),
            );
          }
          assert.equal(designs.size, 6);
        }
      },
    );
    await t.test(
      "property scope, conditional and optional clauses and jurisdiction",
      async () => {
        const multi = await previewContract(
          payload("sale", [house.id, farm.id]),
        );
        assert.deepEqual(
          multi.document_model.sections.map((s) => s.property_type),
          ["house", "agricultural_land"],
        );
        assert(multi.content.includes("2.00 دونم"));
        assert(multi.content.includes("وصف العنوان"));
        assert(
          (
            await previewContract(payload("rental", [shop.id]))
          ).document_model.sections.every(
            (s) => s.property_type === "commercial",
          ),
        );
        const noPaid = await previewContract({ ...sale, paid_amount: 0 });
        assert(!noPaid.content.includes("مدفوع اختباري"));
        const optional = await previewContract({
          ...sale,
          optional_clause_codes: ["extra"],
        });
        assert(optional.content.includes("شرط اختياري للاختبار"));
        const wrong = await previewContract({
          ...sale,
          legal_context: {
            ...sale.legal_context,
            jurisdiction: "iq_kurdistan",
          },
        });
        assert.equal(wrong.document_model.ready, true);
        assert(!wrong.content.includes("صياغة جديدة للاختبار"));
        assert(wrong.content.includes("بصفته الطرف الأول (البائع)"));
        const foreign = await listTemplates("rental");
        await assert.rejects(() =>
          previewContract({ ...sale, template_id: Number(foreign[0].id) }),
        );
        assert.throws(() =>
          contractPayloadSchema.parse({
            ...sale,
            legal_context: { transaction_kind: "registered_transfer_record" },
          }),
        );
        await fs.writeFile(
          path.join(config.documentsDir, "large.png"),
          Buffer.alloc(2 * 1024 * 1024 + 1),
        );
        await db
          .update(tables.officeProfiles)
          .set({ logoFilePath: "large.png" })
          .where(eq(tables.officeProfiles.id, office.id));
        try {
          const oversized = await previewContract(sale);
          assert.equal(oversized.document_model.ready, false);
          assert(
            oversized.document_model.warnings.some((w) =>
              w.includes("ميغابايت"),
            ),
          );
        } finally {
          await db
            .update(tables.officeProfiles)
            .set({ logoFilePath: "office.png" })
            .where(eq(tables.officeProfiles.id, office.id));
        }
      },
    );
    await t.test(
      "approved words, histories and issued bundles cannot be overwritten",
      async () => {
        await assert.rejects(() =>
          db
            .update(tables.legalContractClauses)
            .set({ clauseContentAr: "تعديل غير مسموح" })
            .where(
              eq(
                tables.legalContractClauses.legalTemplateId,
                Number(saleRevision.id),
              ),
            ),
        );
        await assert.rejects(() =>
          db
            .update(tables.legalContractTemplates)
            .set({ title: "تعديل غير مسموح" })
            .where(
              eq(tables.legalContractTemplates.id, Number(saleRevision.id)),
            ),
        );
        await assert.rejects(() => db.delete(tables.legalContentEvents));
        const current = await createContract(
          payload("sale", [house.id], "شروط إضافية للاختبار فقط"),
        );
        assert(current);
        const id = Number(current.contract.id),
          hash = String(current.legal_snapshot!.content_hash);
        const legacyModel = structuredClone(current.legal_snapshot!.document_model) as any;
        delete legacyModel.data.agreement_mode;legacyModel.review_required=true;
        await db.update(tables.contractLegalSnapshots).set({documentModel:legacyModel}).where(eq(tables.contractLegalSnapshots.contractId,id));
        await assert.rejects(() =>
          reviewContract(id, admin.id, "مراجعة اختبارية", "0".repeat(64)),
        );
        await reviewContract(
          id,
          admin.id,
          "مراجعة اختبارية للظروف والشروط",
          hash,
        );
        const changed = await updateContract(
          id,
          payload("sale", [house.id], "تغيير الشروط الإضافية"),
        );
        assert.equal(changed!.legal_snapshot!.review, null);
        await reviewContract(
          id,
          admin.id,
          "مراجعة جديدة للاختبار فقط",
          String(changed!.legal_snapshot!.content_hash),
        );
        const issued = await issueContract(id);
        assert(issued);
        assert.equal(issued.contract.status, "active");
        assert(
          !String(issued.contract.generated_html).includes('data-draft="true"'),
        );
        await assert.rejects(() => updateContract(id, sale));
        await assert.rejects(() =>
          db
            .update(tables.contracts)
            .set({ generatedContent: "تغيير" })
            .where(eq(tables.contracts.id, id)),
        );
        await assert.rejects(() =>
          db.delete(tables.contracts).where(eq(tables.contracts.id, id)),
        );
        await assert.rejects(() =>
          db
            .update(tables.contractLegalSnapshots)
            .set({ contentHash: "altered" })
            .where(eq(tables.contractLegalSnapshots.contractId, id)),
        );
        await assert.rejects(() =>
          db
            .update(tables.contractAssetSnapshots)
            .set({ data: {} })
            .where(eq(tables.contractAssetSnapshots.contractId, id)),
        );
        const latest = await createRevision(
          "sale",
          "house",
          "صياغة جديدة للاختبار {{property.name}}",
        );
        await decideLegalRevision(
          Number(latest.id),
          { action: "submit", comment: "اختبار" },
          admin.id,
        );
        await decideLegalRevision(
          Number(latest.id),
          { action: "approve_publish", comment: "اختبار" },
          admin.id,
        );
        const visual = await listTemplates("sale");
        await updateTemplate(
          Number(visual[0].id),
          contractTemplateSchema.parse({
            ...visual[0],
            layout_config: {
              ...(visual[0].layout_config as Record<string, unknown>),
              font_size: 18,
            },
            name: "تصميم محدث",
          }),
        );
        await db
          .update(tables.officeProfiles)
          .set({ companyName: "مكتب تغير بعد الإصدار" })
          .where(eq(tables.officeProfiles.id, office.id));
        await fs.writeFile(
          path.join(config.documentsDir, "office.png"),
          Buffer.concat([logoBytes, Buffer.from("changed after issue")]),
        );
        await db
          .update(tables.people)
          .set({ fullName: "شخص تغير بعد الإصدار" })
          .where(eq(tables.people.id, parties[0].id));
        await db
          .update(tables.properties)
          .set({ name: "عقار تغير بعد الإصدار" })
          .where(eq(tables.properties.id, house.id));
        const after = await getContract(id);
        assert.equal(
          after!.contract.generated_html,
          issued.contract.generated_html,
        );
        assert.equal(
          after!.contract.generated_content,
          issued.contract.generated_content,
        );
        assert.deepEqual(after!.legal_snapshot, issued.legal_snapshot);
        assert(
          (await previewContract(sale)).content.includes(
            "صياغة جديدة للاختبار",
          ),
        );
        const docx = await contractDocx(id);
        const xml = new AdmZip(Buffer.from(docx!.data, "base64")).readAsText(
          "word/document.xml",
        );
        assert(xml.includes("تغيير الشروط الإضافية"));
        assert(xml.includes("w:bidi"));
        assert(xml.includes("11906"));
      },
    );
    config.corsOrigins.push("http://127.0.0.1:5191");
    await t.test(
      "API permissions and administrator saves never imply legal approval",
      async () => {
        app = await buildServer({ logger: false });
        const account = await db
          .insert(tables.users)
          .values({
            username: "no_permissions",
            displayName: "حساب اختبار بلا صلاحيات",
            pinHash: "unused",
          })
          .returning();
        const { hashSessionToken } = await import(
          "../src/modules/auth/crypto.js"
        );
        const token = "test-no-permissions";
        await db.insert(tables.sessions).values({
          userId: account[0].id,
          tokenHash: hashSessionToken(token),
          expiresAt: new Date(Date.now() + 100000),
        });
        for (const [method, url, payload] of [
          ["GET", "/api/legal-content", undefined],
          ["POST", "/api/legal-content", {}],
          ["POST", "/api/contracts/1/legal-review", {}],
        ] as const) {
          const response = await app.inject({
            method,
            url,
            headers: { authorization: `Bearer ${token}` },
            payload,
          });
          assert.equal(response.statusCode, 403);
        }
        const response = await app.inject({
          method: "POST",
          url: `/api/legal-content/${saleRevision.id}/decision`,
          headers: { authorization: `Bearer ${token}` },
          payload: { action: "approve_publish", comment: "محاولة غير مسموحة" },
        });
        assert.equal(response.statusCode, 403);
        await assert.rejects(() =>
          createContract({ ...sale, status: "active" }),
        );
      },
    );
    await t.test(
      "authorized manager publishes without lawyer eligibility; employees cannot bypass permissions",
      async () => {
        const { hashSessionToken } = await import(
          "../src/modules/auth/crypto.js"
        );
        const actor = async (name: string, roleName: string) => {
          const [user] = await db
            .insert(tables.users)
            .values({ username: name, displayName: name, pinHash: "unused" })
            .returning();
          const [role] = await db
            .select()
            .from(tables.roles)
            .where(eq(tables.roles.name, roleName));
          await db
            .insert(tables.userRoles)
            .values({ userId: user.id, roleId: role.id });
          await db
            .insert(tables.sessions)
            .values({
              userId: user.id,
              tokenHash: hashSessionToken(name),
              expiresAt: new Date(Date.now() + 1000000),
            });
          return { user, headers: { authorization: `Bearer ${name}` } };
        };
        const manager = await actor("test_manager", "office_manager"),
          employee = await actor("test_employee", "legal_editor");
        const base = (await listLegalContent()).find(
          (r) =>
            r.contract_type === "rental" &&
            r.property_type === "house" &&
            r.publication_status === "active",
        )!;
        const input = revisionPayload(base, base.clauses);
        input.title = "عنوان إداري جديد";
        input.revision_note = "تغيير عنوان إداري فقط";
        const validated = await validateRevision(input);
        assert.equal(validated.change_kind, "administrative");
        assert.equal(validated.review_required, false);
        const response = await app!.inject({
          method: "POST",
          url: `/api/legal-content/${base.id}/revisions`,
          headers: employee.headers,
          payload: { ...input, priority: 2 },
        });
        assert.equal(response.statusCode, 201, response.body);
        const saved = response.json();
        assert.equal(saved.priority, 1);
        assert.equal(saved.approval_status, "draft");
        const employeeDecision = await app!.inject({
          method: "POST",
          url: `/api/legal-content/${saved.id}/decision`,
          headers: employee.headers,
          payload: { action: "approve_publish", comment: "محاولة نشر موظف" },
        });
        assert.equal(employeeDecision.statusCode, 403);
        const scheduleDenied = await app!.inject({
          method: "PATCH",
          url: `/api/legal-content/${saved.id}/schedule`,
          headers: employee.headers,
          payload: { target_at: null, priority: 2 },
        });
        assert.equal(scheduleDenied.statusCode, 403);
        const publish = await app!.inject({
          method: "POST",
          url: `/api/legal-content/${saved.id}/decision`,
          headers: manager.headers,
          payload: {
            action: "approve_publish",
            comment: "اعتماد تغيير إداري من المدير",
          },
        });
        assert.equal(publish.statusCode, 200, publish.body);
        assert.equal(publish.json().publication_status, "active");
        assert.equal(publish.json().approved_by, manager.user.id);
        assert.equal(
          (await listLegalContent()).find((r) => r.id === base.id)!
            .publication_status,
          "archived",
        );
        for (const kind of ["sale", "rental"] as const) {
          const draft = await createContract(
            payload(kind, [kind === "sale" ? house.id : rental.id]),
            manager.user.id,
          );
          assert(draft);
          assert.equal(draft.legal_snapshot!.review, null);
          const issued = await issueContract(
            Number(draft.contract.id),
            manager.user.id,
          );
          assert.equal(issued!.contract.status, "active");
        }
        const exception = await createContract(
          payload("rental", [rental.id], "شرط استثنائي اختباري"),
        );
        assert.equal((await issueContract(Number(exception!.contract.id), manager.user.id))!.contract.status,"active");
        const substantive = revisionPayload(
          (await listLegalContent()).find((r) => r.id === saved.id)!,
          base.clauses,
        );
        substantive.clauses[0].clause_content_ar += " تغيير جوهري اختباري";
        substantive.clauses[0].source_clause_id = null;
        assert.equal(
          (await validateRevision(substantive)).change_kind,
          "substantive",
        );
        const changed = await saveLegalRevision(
          substantive,
          employee.user.id,
          saved.id,
        );
        await decideLegalRevision(
          Number(changed.id),
          { action: "submit", comment: "مراجعة التغيير الجوهري" },
          employee.user.id,
          { manage: true },
        );
        for (const action of [
          "publish",
          "default",
        ] as const) {
          const blocked = await app!.inject({
            method: "POST",
            url: `/api/legal-content/${changed.id}/decision`,
            headers: manager.headers,
            payload: { action, comment: "استعجال النشر" },
          });
          assert([400, 403].includes(blocked.statusCode), blocked.body);
        }
        await scheduleLegalRevision(
          Number(changed.id),
          new Date(Date.now() + 3600000).toISOString(),
          2,
          manager.user.id,
        );
        const first = await legalNotifications(employee.user.id, false, false),
          again = await legalNotifications(employee.user.id, false, false);
        assert.equal(first.length, 1);
        assert.deepEqual(again, first);
        await readLegalNotification(first[0].id, manager.user.id);
        assert.equal(
          (await legalNotifications(employee.user.id, false, false))[0].read_at,
          null,
        );
        await readLegalNotification(first[0].id, employee.user.id);
        assert(
          (await legalNotifications(employee.user.id, false, false))[0].read_at,
        );
        assert.equal(
          (
            await legalNotifications(
              employee.user.id,
              false,
              false,
              new Date(Date.now() + 7200000),
            )
          ).length,
          2,
        );
        const comparison = await compareLegalRevisions(base.id, saved.id);
        assert.equal(comparison.legal_changed, false);
        assert(comparison.differences.some((d) => d.field === "اسم الصيغة"));
        const malformed = structuredClone(input);
        malformed.clauses[0].clause_content_ar =
          "نص {{unknown.variable}} و {{غير_مكتمل";
        assert((await validateRevision(malformed)).issues.length >= 2);
        const duplicate = structuredClone(input);
        duplicate.clauses.push({
          ...duplicate.clauses[0],
          clause_code: "duplicate",
        });
        assert(
          (await validateRevision(duplicate)).issues.some((i) =>
            i.includes("يكرر"),
          ),
        );
        const malicious = await db
          .insert(tables.legalContractTemplates)
          .values({
            familyCode: "malicious",
            contractType: "rental",
            propertyType: "house",
            jurisdiction: "iq_federal",
            transactionKind: "lease",
            title: "محاولة تجاوز",
            version: 1,
            legalBasis: input.legal_basis,
            applicabilityNotes: input.applicability_notes,
            reviewRequired: false,
            changeKind: "administrative",
            basedOnId: saved.id,
          })
          .returning();
        await db
          .insert(tables.legalContractClauses)
          .values({
            legalTemplateId: malicious[0].id,
            clauseCode: "altered",
            clauseTitle: "تغيير",
            clauseContentAr: "تغيير جوهري لا يطابق النص",
            clauseOrder: 1,
            version: 1,
          });
        await assert.rejects(() =>
          db
            .update(tables.legalContractTemplates)
            .set({
              title: "تغيير المحتوى دون إنشاء إصدار",
            })
            .where(eq(tables.legalContractTemplates.id, malicious[0].id)),
        );
        // Restore against the latest reviewed wording, not an arbitrary old baseline.
        const restored = await restoreLegalRevision(base.id, manager.user.id);
        assert.equal(restored.review_required, false);
        await decideLegalRevision(
          Number(changed.id),
          { action: "approve_publish", comment: "مراجعة التغيير الاختباري" },
          manager.user.id,
          { publish: true },
        );
        const restoreOld = await restoreLegalRevision(base.id, manager.user.id);
        assert.equal(restoreOld.review_required, true);
        // Restore the reviewed administrative baseline for subsequent UI fixtures.
        await decideLegalRevision(
          Number(saved.id),
          { action: "publish", comment: "إعادة تفعيل الإصدار الاختباري" },
          manager.user.id,
          { publish: true },
        );
      },
    );
    await t.test("legal template preview, protected/default API guards and soft deletion preserve issued snapshots", async () => {
      const session = await login("test_admin", "1234");
      assert(session);
      const headers = { authorization: `Bearer ${session.token}` };
      const rows = await listLegalContent();
      const system = rows.find((r) => r.is_system && r.property_type === "all_properties" && r.contract_type === "rental")!;
      const source = rows.find((r) => r.contract_type === "rental" && r.is_default)!;
      const input = revisionPayload(source, source.clauses);
      input.title = "صيغة مخصصة لاختبار الأرشفة";
      input.revision_note = "نسخة مستقلة لاختبار سلامة العقود التاريخية";
      const visuals = await listTemplates("rental");
      const trial = await app!.inject({ method: "POST", url: "/api/legal-content/preview", headers, payload: { revision: input, visual_id: Number(visuals[0].id) } });
      assert.equal(trial.statusCode, 200, trial.body);
      assert(trial.json().html.includes('dir="rtl"'));
      assert(trial.json().html.includes("A4"));
      assert(trial.json().variables.some((v: any) => v.key === "property.name" && v.value === "عقار تجريبي"));
      assert(trial.json().rendered_clauses.every((c: any) => !c.text.includes("{{")));
      assert(trial.json().html.includes("إجراءات التصديق أو التسجيل"));
      const protectedDeletion = await app!.inject({ method: "DELETE", url: `/api/legal-content/${system.id}`, headers });
      assert.equal(protectedDeletion.statusCode, 400, protectedDeletion.body);
      const protectedEdit = await app!.inject({ method: "POST", url: `/api/legal-content/${system.id}/revisions`, headers, payload: revisionPayload(system, system.clauses) });
      assert.equal(protectedEdit.statusCode, 400, protectedEdit.body);
      await assert.rejects(() => db.update(tables.legalContractTemplates).set({ isSystem: false }).where(eq(tables.legalContractTemplates.id, system.id)));
      const copy = await saveLegalRevision(input, admin.id);
      assert.notEqual(copy.family_code, source.family_code);
      assert.equal(copy.is_system, false);
      await decideLegalRevision(Number(copy.id), { action: "approve_publish", comment: "اعتماد صيغة المكتب دون محامٍ موثق" }, admin.id);
      await decideLegalRevision(Number(copy.id), { action: "default", comment: "اختبار تغيير الافتراضي" }, admin.id);
      assert.equal((await listLegalContent()).filter((r) => r.contract_type === "rental" && r.is_default).length, 1);
      const defaultDeletion = await app!.inject({ method: "DELETE", url: `/api/legal-content/${copy.id}`, headers });
      assert.equal(defaultDeletion.statusCode, 400, defaultDeletion.body);
      const draft = await createContract(payload("rental", [rental.id]), admin.id);
      const issued = await issueContract(Number(draft!.contract.id), admin.id);
      assert((issued!.legal_snapshot!.document_model as any).legal_versions.some((v: any) => v.id === Number(copy.id)));
      const snapshot = structuredClone(issued!.legal_snapshot), content = issued!.contract.generated_content, html = issued!.contract.generated_html;
      const seededApproval = await db.execute(sql`select approved_at::text as evidence from legal_contract_templates where id=${Number(system.id)}`);
      await decideLegalRevision(Number(system.id), { action: "default", comment: "استعادة صيغة النظام دون تغيير دليل اعتمادها" }, admin.id);
      assert.equal((await listLegalContent()).find((r) => r.id === system.id)!.is_default, true);
      const unchangedApproval = await db.execute(sql`select approved_at::text as evidence from legal_contract_templates where id=${Number(system.id)}`);
      assert.deepEqual(unchangedApproval.rows, seededApproval.rows, "Default selection must preserve seeded microsecond approval evidence");
      await decideLegalRevision(Number(source.id), { action: "default", comment: "إعادة الصيغة الأساسية الاختبارية قبل الحذف" }, admin.id);
      const denied = await app!.inject({ method: "DELETE", url: `/api/legal-content/${copy.id}`, headers: { authorization: "Bearer test-no-permissions" } });
      assert.equal(denied.statusCode, 403);
      const deleted = await app!.inject({ method: "DELETE", url: `/api/legal-content/${copy.id}`, headers });
      assert.equal(deleted.statusCode, 200, deleted.body);
      assert(!(await listLegalContent()).some((r) => r.family_code === copy.family_code));
      const [stored] = await db.select().from(tables.legalContractTemplates).where(eq(tables.legalContractTemplates.id, Number(copy.id)));
      assert(stored.deletedAt);
      assert.equal(stored.deletedBy, admin.id);
      assert.equal(stored.publicationStatus, "archived");
      await assert.rejects(() => deleteLegalTemplate(Number(copy.id), admin.id));
      await assert.rejects(() => decideLegalRevision(Number(copy.id), { action: "publish", comment: "محاولة إعادة صيغة محذوفة" }, admin.id));
      const after = await getContract(Number(issued!.contract.id));
      assert.equal(after!.contract.generated_content, content);
      assert.equal(after!.contract.generated_html, html);
      assert.deepEqual(after!.legal_snapshot, snapshot);
      assert((await db.select().from(tables.legalContractClauses).where(eq(tables.legalContractClauses.legalTemplateId, Number(copy.id)))).length > 0);
      const racing = await saveLegalRevision(input, admin.id);
      const operations = await Promise.allSettled([
        saveLegalRevision({ ...input, title: "تعديل متزامن مع الأرشفة" }, admin.id, Number(racing.id)),
        deleteLegalTemplate(Number(racing.id), admin.id),
      ]);
      assert.equal(operations[1].status, "fulfilled");
      const familyRows = await db.select().from(tables.legalContractTemplates).where(eq(tables.legalContractTemplates.familyCode, String(racing.family_code)));
      assert(familyRows.every((revision) => revision.deletedAt), "Concurrent editing must never resurrect a deleted family");

    });
    if (process.env.CONTRACT_BROWSER_TEST === "1")
      await t.test(
        "browser approval, visual editing, contract review/issue and twelve A4 PDFs",
        async () => {
          const readyDraft = await createContract(
            payload(
              "rental",
              [rental.id],
              "شرط استثنائي لاختبار مراجعة الواجهة",
            ),
          );
          await createContract(payload("rental", [shop.id]));
          const session = await login("test_admin", "1234");
          assert(session);
          const documents: Array<{ html: string; code: string }> = [];
          for (const kind of ["sale", "rental"] as const)
            for (const template of await listTemplates(kind)) {
              const preview = await previewContract({
                ...payload(kind, [kind === "sale" ? house.id : rental.id]),
                template_id: Number(template.id),
                notes: Array.from(
                  { length: 40 },
                  (_, i) =>
                    `فقرة اختبار متعددة الصفحات ${i + 1}: نص عربي للتحقق من التفاف الفقرات وترقيم صفحات الوثيقة.`,
                ).join("\n"),
              });
              documents.push({
                html: preview.html,
                code: String(template.template_code),
              });
            }
          const { verifyElectronContracts } = await import("./contracts-electron.js");
          // Keep native IPC/PDF validation independent of the browser flow.
          await verifyElectronContracts(documents, testRoot);
          const { verifyContractsUi } = await import("./contracts-ui.js");
          await verifyContractsUi(
            app!,
            session.token,
            Number(readyDraft!.contract.id),
            documents,
            [
              { id: Number(draft.contract.id), kind: "sale" },
              { id: Number(initialRentalDraft.contract.id), kind: "rental" },
            ],
          );
          const issuedSale=await getContract(Number(draft.contract.id));
          const issuedRental=await getContract(Number(readyDraft!.contract.id));
          assert.equal(issuedSale!.contract.status,"active");
          assert.equal(issuedRental!.contract.status,"active");
          await verifyElectronContracts([
            {code:"issued_sale",html:String(issuedSale!.contract.generated_html)},
            {code:"issued_rental",html:String(issuedRental!.contract.generated_html)}
          ], testRoot);
        },
      );
    await t.test(
      "full backup round-trip includes legal and visual history",
      async () => {
        const before = await db
          .select()
          .from(tables.contractLegalSnapshots)
          .orderBy(tables.contractLegalSnapshots.id);
        const legalBefore = await db
          .select()
          .from(tables.legalContractTemplates)
          .orderBy(tables.legalContractTemplates.id);
        const noticesBefore = await db
          .select()
          .from(tables.legalTaskNotifications)
          .orderBy(tables.legalTaskNotifications.id);
        const proceduresBefore=await db.select().from(tables.contractProcedures).orderBy(tables.contractProcedures.id);
        const procedureFilesBefore=await db.select().from(tables.contractProcedureAttachments).orderBy(tables.contractProcedureAttachments.id);
        const backup = await createBackup("manual");
        assert(backup.file_path);
        try {
          await restoreBackup(await fs.readFile(backup.file_path), "full");
          assert.deepEqual(await db.select().from(tables.contractProcedures).orderBy(tables.contractProcedures.id),proceduresBefore);
          assert.deepEqual(await db.select().from(tables.contractProcedureAttachments).orderBy(tables.contractProcedureAttachments.id),procedureFilesBefore);
          assert.deepEqual(
            await db
              .select()
              .from(tables.contractLegalSnapshots)
              .orderBy(tables.contractLegalSnapshots.id),
            before,
          );
          assert.deepEqual(
            await db
              .select()
              .from(tables.legalContractTemplates)
              .orderBy(tables.legalContractTemplates.id),
            legalBefore,
          );
          assert.deepEqual(
            await db
              .select()
              .from(tables.legalTaskNotifications)
              .orderBy(tables.legalTaskNotifications.id),
            noticesBefore,
          );
        } finally {
          await fs.rm(backup.file_path, { force: true });
        }
      },
    );
  } finally {
    await app?.close();
    await pool.end();
    if (!/^dalaly_legal_test_\d+$/.test(testDb))
      throw new Error("Invalid test cleanup target");
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
    await adminPool.end();
    if (
      path.dirname(testRoot) !== path.resolve(os.tmpdir()) ||
      !path.basename(testRoot).startsWith("dalaly-legal-test-")
    )
      throw new Error("Invalid temporary directory");
    await fs.rm(testRoot, { recursive: true, force: true });
  }
});
