import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { eq, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { config } from "../src/infrastructure/config.js";
import { db } from "../src/infrastructure/database/db.js";
import { pool } from "../src/infrastructure/database/pool.js";
import * as schema from "../src/infrastructure/database/schema.js";
import {
  exportBackup,
  restoreBackup,
} from "../src/modules/backup/backup.service.js";
import { createIdentityDocument } from "../src/modules/documents/documents.repository.js";
import { identityDocumentPayloadSchema } from "../src/modules/documents/documents.schema.js";
import { resolveManagedFile } from "../src/modules/documents/documents.storage.js";
import { updateCompanyLogo } from "../src/modules/company-settings/company-settings.repository.js";
import { companyLogoSchema } from "../src/modules/company-settings/company-settings.schema.js";
import { addImages } from "../src/modules/images/images.repository.js";
import {
  saveImageToDisk,
  saveRentalImageToDisk,
} from "../src/modules/images/images.service.js";
import { addRentalImages } from "../src/modules/rental-images/rental-images.repository.js";
import { setSetting } from "../src/modules/settings/settings.repository.js";
import {
  getRolePermissionIds,
  getUserRolesAndPermissions,
  grantAllPermissionsToRole,
  setRolePermissionIds,
  userHasPermission,
} from "../src/modules/rbac/rbac.service.js";
import { removalTestContext } from "./removal-test-context.js";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const tables = new Map<string, PgTable>(
  (Object.values(schema) as unknown[])
    .filter((table): table is PgTable => is(table, PgTable))
    .map((table) => [getTableName(table), table]),
);

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortedValue(entry)]),
    );
  return value;
}

function canonicalRows(rows: unknown[]) {
  return JSON.parse(JSON.stringify(rows))
    .map((row: unknown) => JSON.stringify(sortedValue(row)))
    .sort();
}

async function databaseSnapshot(names: string[] = [...tables.keys()]) {
  const result: Record<string, string[]> = {};
  for (const name of names) {
    const table = tables.get(name);
    assert.ok(table, `known table: ${name}`);
    result[name] = canonicalRows(await db.select().from(table));
  }
  return result;
}

async function fileSnapshot(root: string) {
  const result: Record<string, string> = {};
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else
        result[path.relative(root, absolute)] = createHash("sha256")
          .update(await fs.readFile(absolute))
          .digest("hex");
    }
  }
  await visit(root);
  return result;
}

test("shared backup v3 survives full restore and rejects incompatible data before writes", async (t) => {
  const ctx = await removalTestContext("backup");
  const report = {
    database: ctx.name,
    backup_version: 3,
    tables_verified: 0,
    files_verified: 0,
    custom_permission_preserved: false,
    custom_setting_preserved: false,
    rejected_without_changes: [] as string[],
  };
  try {
    assert.match(ctx.name, /^dalaly_removal_test_\d+_backup$/);
    let customPermissionId = 0;
    await t.test("custom permission creation, rename, listing, authorization and role grants remain available", async () => {
      const headers = { authorization: `Bearer ${ctx.token}` };
      const created = await ctx.app.inject({
        method: "POST", url: "/api/permissions", headers,
        payload: { key: "reports.custom.export", name: "صلاحية تقارير مخصصة", module: "reports" },
      });
      assert.equal(created.statusCode, 201, created.body);
      customPermissionId = Number(created.json().id);
      const updated = await ctx.app.inject({
        method: "PUT", url: `/api/permissions/${customPermissionId}`, headers,
        payload: { key: "reports.custom.review", name: "مراجعة تقارير مخصصة", module: "reports" },
      });
      assert.equal(updated.statusCode, 200, updated.body);
      const listed = await ctx.app.inject({ method: "GET", url: "/api/permissions", headers });
      assert.equal(listed.statusCode, 200);
      assert.ok(listed.json().some((row: { key: string }) => row.key === "reports.custom.review"));
      assert.equal(await userHasPermission(ctx.adminId, "reports.custom.review"), true);
      assert.equal(await userHasPermission(ctx.adminId, "reports.custom.export"), false);
      assert.ok((await getUserRolesAndPermissions(ctx.adminId)).permissions.some((row) => row.key === "reports.custom.review"));
      const [role] = await db.insert(schema.roles).values({ name: "دور بصلاحية مخصصة" }).returning();
      await setRolePermissionIds(role.id, [customPermissionId]);
      assert.deepEqual(await getRolePermissionIds(role.id), [customPermissionId]);
      await grantAllPermissionsToRole(role.id);
      assert.ok((await getRolePermissionIds(role.id)).includes(customPermissionId));
      for (const namespace of ["contracts", "contract_templates", "legal_content", "legal_formulations", "formulations", "studio"]) {
        const before = await databaseSnapshot();
        const rejected = await ctx.app.inject({
          method: "POST", url: "/api/permissions", headers,
          payload: { key: `${namespace}.manage`, name: "مساحة متقاعدة", module: namespace },
        });
        assert.equal(rejected.statusCode, 400, rejected.body);
        assert.deepEqual(await databaseSnapshot(), before);
      }
    });
    const [governorate] = await db
      .insert(schema.governorates)
      .values({ name: "محافظة فحص النسخ" })
      .returning();
    const [district] = await db
      .insert(schema.districts)
      .values({ governorateId: governorate.id, name: "منطقة فحص النسخ" })
      .returning();
    const [neighborhood] = await db
      .insert(schema.neighborhoods)
      .values({ districtId: district.id, name: "حي فحص النسخ" })
      .returning();
    const location = {
      governorateId: governorate.id,
      districtId: district.id,
      neighborhoodId: neighborhood.id,
    };
    await db.update(schema.properties).set(location).where(eq(schema.properties.id, ctx.property.id));
    await db.update(schema.rentals).set(location).where(eq(schema.rentals.id, ctx.rental.id));
    await db.insert(schema.purchaseRequests).values({
      ...location, code: "BACKUP-PR", personId: ctx.people[1].id, propertyType: "بيت",
      budgetMin: "100000000.00", budgetMax: "180000000.00", notes: "طلب شراء محفوظ",
    });
    await db.insert(schema.rentalRequests).values({
      ...location, code: "BACKUP-RR", personId: ctx.people[1].id, propertyType: "house",
      rentPeriod: "monthly", budgetMax: "900000.00", notes: "طلب إيجار محفوظ",
    });
    await db.insert(schema.propertyFollowups).values({
      propertyId: ctx.property.id, userId: ctx.adminId, type: "phone_call", notes: "متابعة العقار",
    });
    await db.insert(schema.rentalFollowups).values({
      rentalId: ctx.rental.id, userId: ctx.adminId, type: "visit", notes: "متابعة الإيجار",
      personId: ctx.people[1].id, assignedUserId: ctx.adminId, status: "done", outcome: "تمت المعاينة",
    });
    const [deal] = await db.insert(schema.deals).values({
      code: "D-0001", dealType: "sale", stage: "negotiating", propertyId: ctx.property.id,
      clientPersonId: ctx.people[1].id, ownerPersonId: ctx.people[0].id, askingPrice: "150000000.00",
      agreedPrice: "145000000.50", assignedUserId: ctx.adminId, createdBy: ctx.adminId,
    }).returning();
    await db.insert(schema.dealStageHistory).values({ dealId: deal.id, fromStage: "new", toStage: "negotiating", userId: ctx.adminId });
    await db.insert(schema.dealOffers).values({ dealId: deal.id, party: "client", amount: "140000000.00", createdBy: ctx.adminId });
    await db.insert(schema.activities).values({
      personId: ctx.people[1].id, userId: ctx.adminId, type: "meeting", notes: "اجتماع محفوظ",
      assignedUserId: ctx.adminId, priority: "high", dealId: deal.id,
    });
    // An office account under a default heading, next to the default chart.
    const [expensesHeading] = await db.select().from(schema.accounts).where(eq(schema.accounts.systemKey, "expenses"));
    const [officeRent] = await db.insert(schema.accounts).values({
      code: "5301", name: "إيجار المكتب", accountType: "expense", parentId: expensesHeading.id,
      currency: "IQD", description: "حساب محفوظ", createdBy: ctx.adminId,
    }).returning();
    // A posted entry (written as a draft, then posted, as the triggers ask)
    // naming a customer and the deal, and a closed month.
    const [cashIqd] = await db.select().from(schema.accounts).where(eq(schema.accounts.systemKey, "cash.IQD"));
    const [entry] = await db.insert(schema.journalEntries).values({
      code: "JE-000001", entryDate: "2026-09-15", description: "إيجار أيلول", currency: "IQD", createdBy: ctx.adminId,
    }).returning();
    await db.insert(schema.journalLines).values([
      { entryId: entry.id, lineNo: 1, accountId: officeRent.id, debit: "750000.00", personId: ctx.people[0].id, dealId: deal.id },
      { entryId: entry.id, lineNo: 2, accountId: cashIqd.id, credit: "750000.00", memo: "نقداً" },
    ]);
    await db.update(schema.journalEntries).set({ status: "posted", postedAt: new Date(), postedBy: ctx.adminId }).where(eq(schema.journalEntries.id, entry.id));
    await db.insert(schema.accountingPeriods).values({ period: "2026-08", closedBy: ctx.adminId, notes: "شهر مقفل" });
    // The payment voucher that entry stands for.
    await db.insert(schema.vouchers).values({
      code: "PV-000001", kind: "payment", voucherDate: "2026-09-15", currency: "IQD", amount: "750000.00",
      purpose: "expense", moneyAccountId: cashIqd.id, otherAccountId: officeRent.id, personId: ctx.people[0].id,
      partyName: ctx.people[0].full_name, dealId: deal.id, description: "إيجار أيلول", journalEntryId: entry.id, createdBy: ctx.adminId,
    });
    // Contract tables: a customised template with its history, and an issued
    // contract with its parties, revision and an export.
    const [agreementTemplate] = await db.insert(schema.agreementTemplates).values({ templateKey: "sale", version: 1, definition: { schema: 1 } }).returning();
    await db.insert(schema.agreementTemplateVersions).values({ templateId: agreementTemplate.id, version: 1, definition: { schema: 1 }, changeType: "saved", createdBy: ctx.adminId });
    const [agreement] = await db.insert(schema.agreements).values({
      code: "BACKUP-CT", templateKey: "sale", status: "issued", propertyId: ctx.property.id, terms: { sale_price: 150000000 },
      document: { schema: 1 }, currentRevision: 1, issuedAt: new Date(), issuedBy: ctx.adminId, createdBy: ctx.adminId,
    }).returning();
    await db.insert(schema.agreementParties).values([
      { agreementId: agreement.id, role: "seller", personId: ctx.people[0].id },
      { agreementId: agreement.id, role: "buyer", personId: ctx.people[1].id },
    ]);
    await db.insert(schema.agreementRevisions).values({ agreementId: agreement.id, revision: 1, templateKey: "sale", document: { schema: 1 }, terms: {}, context: {}, values: {}, issuedBy: ctx.adminId });
    await db.insert(schema.agreementExports).values({ agreementId: agreement.id, revision: 1, format: "pdf", fileName: "عقد.pdf", createdBy: ctx.adminId });
    await db.insert(schema.favoriteProperties).values({ userId: ctx.adminId, propertyId: ctx.property.id });
    await db.insert(schema.favoriteRentals).values({ userId: ctx.adminId, rentalId: ctx.rental.id });
    await db.insert(schema.auditLogs).values({
      entityType: "people", entityId: ctx.people[0].id, action: "updated", userId: ctx.adminId,
      oldValue: { full_name: "قديم" }, newValue: { full_name: ctx.people[0].full_name },
    });
    const [documentType] = await db.insert(schema.documentTypes).values({ key: "backup_identity", name: "هوية فحص النسخ" }).returning();
    const document = (await createIdentityDocument(identityDocumentPayloadSchema.parse({
      person_id: ctx.people[0].id, document_type_id: documentType.id,
      document_name: "مستمسك مشترك محفوظ", document_number: "00123456789", document_side: "front",
      data: png, file_type: "image/png", original_name: "identity.png", expires_at: "2032-12-31",
      notes: "لا يتبع أي وحدة محذوفة",
    })))!;
    const logo = await updateCompanyLogo(companyLogoSchema.parse({ data: png, file_type: "image/png", original_name: "office.png" }));
    await db.update(schema.officeProfiles).set({ companyName: "مكتب فحص النسخ", address: "بغداد" }).where(eq(schema.officeProfiles.id, 1));
    const propertyImage = saveImageToDisk(ctx.property.id, png);
    await addImages(ctx.property.id, [{ filePath: propertyImage.filePath, originalName: "property.png" }]);
    const rentalImage = saveRentalImageToDisk(ctx.rental.id, png);
    await addRentalImages(ctx.rental.id, [{ filePath: rentalImage.filePath, originalName: "rental.png" }]);
    await setSetting("backup_dir", config.backupsDir);
    await setSetting("last_backup_at", "2026-10-19T00:00:00.000Z");
    await setSetting("reports.custom.preferences", { language: "ar", columns: ["name", "price"] });

    assert.ok(document);
    const [documentRow] = await db
      .select()
      .from(schema.identityDocuments)
      .where(eq(schema.identityDocuments.personId, ctx.people[0].id));
    const expectedFiles = new Map<string, Buffer>();
    for (const absolute of [
      resolveManagedFile(documentRow.filePath),
      resolveManagedFile(String(logo.logo_file_path)),
      path.join(config.imagesDir, propertyImage.filePath),
      path.join(config.imagesDir, rentalImage.filePath),
    ]) {
      assert.ok(absolute.startsWith(ctx.root + path.sep));
      expectedFiles.set(absolute, await fs.readFile(absolute));
    }
    const output = path.join(ctx.root, "backups", "shared-v3.zip");
    const exported = await exportBackup(output, ctx.adminId);
    assert.equal(exported.ok, true);
    const zipBytes = await fs.readFile(output);
    const zip = new AdmZip(zipBytes);
    const manifest = JSON.parse(zip.readAsText("manifest.json"));
    const data = JSON.parse(zip.readAsText("data.json")) as Record<string, Record<string, unknown>[]>;
    assert.equal(manifest.version, 3);
    assert.equal(Object.keys(data).length, 39);
    assert.ok(data.permissions.some((row) => row.id === customPermissionId && row.key === "reports.custom.review"));
    assert.ok(data.role_permissions.some((row) => row.permissionId === customPermissionId));
    assert.ok(data.app_settings.some((row) => row.key === "reports.custom.preferences"));
    assert.ok(Object.values(data).every((rows) => rows.length > 0), "representative data in every exported table");
    assert.equal(zip.getEntries().filter((entry) => !entry.isDirectory && /^(documents|images)\//.test(entry.entryName)).length, 4);

    await t.test("all 39 shared tables and four managed files round trip", async () => {
      await db.update(schema.people).set({ fullName: "اسم تغير بعد النسخ" });
      await db.update(schema.properties).set({ totalPrice: "1.00" });
      await db.update(schema.rentals).set({ rentPrice: "1.00" });
      await db.update(schema.identityDocuments).set({ documentName: "مستمسك تغير" });
      await db.update(schema.officeProfiles).set({ companyName: "مكتب تغير" });
      await db.update(schema.accounts).set({ name: "حساب تغير" }).where(eq(schema.accounts.code, "5301"));
      await db.delete(schema.favoriteProperties);
      await db.delete(schema.favoriteRentals);
      for (const absolute of expectedFiles.keys()) await fs.writeFile(absolute, "changed fixture contents");
      const restored = await restoreBackup(zipBytes, "full", ctx.adminId);
      assert.equal(restored.ok, true);
      assert.equal(restored.documents_restored, 2);
      assert.equal(restored.images_restored, 2);
      const actual = await databaseSnapshot(Object.keys(data));
      for (const [name, rows] of Object.entries(data))
        assert.deepEqual(actual[name], canonicalRows(rows), name);
      for (const [absolute, expected] of expectedFiles)
        assert.deepEqual(await fs.readFile(absolute), expected, path.relative(ctx.root, absolute));
      report.tables_verified = Object.keys(data).length;
      report.files_verified = expectedFiles.size;
      assert.equal(await userHasPermission(ctx.adminId, "reports.custom.review"), true);
      report.custom_permission_preserved = true;
      report.custom_setting_preserved = true;
    });

    const variants: Array<{ name: string; mutate: (archive: AdmZip, payload: typeof data) => void }> = [
      { name: "previous backup format", mutate: (archive) => archive.updateFile("manifest.json", Buffer.from(JSON.stringify({ ...manifest, version: 2 }))) },
      { name: "unknown table", mutate: (_archive, payload) => { payload.removed_feature = []; } },
      { name: "missing table", mutate: (_archive, payload) => { delete payload.people; } },
      { name: "unknown field", mutate: (_archive, payload) => { payload.people[0].removed_field = true; } },
      { name: "orphan permission grant", mutate: (_archive, payload) => { payload.role_permissions.push({ roleId: ctx.adminId, permissionId: -999 }); } },
    ];
    for (const namespace of ["contracts", "contract_templates", "legal_content", "legal_formulations", "formulations", "studio"]) {
      variants.push(
        { name: `retired permission ${namespace}`, mutate: (_archive, payload) => { payload.permissions[0].key = `${namespace}.manage`; } },
        { name: `retired setting ${namespace}`, mutate: (_archive, payload) => { payload.app_settings.push({ key: `${namespace}.defaults`, value: {} }); } },
      );
    }
    for (const variant of variants) {
      await t.test(`${variant.name} rejected without database or file changes`, async () => {
        const beforeDb = await databaseSnapshot();
        const beforeFiles = await fileSnapshot(ctx.root);
        const archive = new AdmZip(zipBytes);
        const payload = structuredClone(data);
        variant.mutate(archive, payload);
        archive.updateFile("data.json", Buffer.from(JSON.stringify(payload)));
        archive.addFile("documents/unexpected-write.txt", Buffer.from("must not be written"));
        await assert.rejects(restoreBackup(archive.toBuffer(), "full", ctx.adminId));
        assert.deepEqual(await databaseSnapshot(), beforeDb);
        assert.deepEqual(await fileSnapshot(ctx.root), beforeFiles);
        report.rejected_without_changes.push(variant.name);
      });
    }
    const current = (await pool.query("SELECT current_database() AS name")).rows[0].name;
    assert.equal(current, ctx.name);
    await fs.writeFile(path.join(ctx.root, "backup-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ backup_round_trip: report, artifacts: ctx.root }));
  } finally {
    await ctx.close();
  }
});

