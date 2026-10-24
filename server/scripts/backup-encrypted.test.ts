import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { config } from "../src/infrastructure/config.js";
import { db } from "../src/infrastructure/database/db.js";
import { pool } from "../src/infrastructure/database/pool.js";
import * as schema from "../src/infrastructure/database/schema.js";
import { login } from "../src/modules/auth/auth.service.js";
import { decryptBackup } from "../src/modules/backup/backup.crypto.js";
import {
  createEmailArchive,
  exportBackup,
  restoreBackup,
} from "../src/modules/backup/backup.service.js";
import { createIdentityDocument } from "../src/modules/documents/documents.repository.js";
import { identityDocumentPayloadSchema } from "../src/modules/documents/documents.schema.js";
import { addImage } from "../src/modules/images/images.repository.js";
import { saveImageToDisk } from "../src/modules/images/images.service.js";
import { DomainError } from "../src/shared/errors.js";
import { removalTestContext } from "./removal-test-context.js";

const PASSWORD = "كلمة سر المكتب 2026";
const FIXTURE = path.resolve("scripts/fixtures/backup-v3-adm-zip.zip");
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
      else result[path.relative(root, absolute)] = createHash("sha256").update(await fs.readFile(absolute)).digest("hex");
    }
  }
  await visit(root);
  return result;
}

const domainError = (code: string, message?: RegExp) => (error: unknown) =>
  error instanceof DomainError &&
  error.statusCode === 400 &&
  error.code === code &&
  (!message || message.test(error.message));

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("the emailed backup is the database alone, encrypted, and restores with its password", async (t) => {
  const ctx = await removalTestContext("encrypted");
  try {
    // An identity document and a property image: each a row and a file.
    const [documentType] = await db
      .insert(schema.documentTypes)
      .values({ key: "encrypted_identity", name: "هوية فحص التشفير" })
      .returning();
    await createIdentityDocument(
      identityDocumentPayloadSchema.parse({
        person_id: ctx.people[0].id, document_type_id: documentType.id,
        document_name: "هوية مشفرة", document_number: "99887766", document_side: "front",
        data: png, file_type: "image/png", original_name: "identity.png",
      }),
    );
    const image = saveImageToDisk(ctx.property.id, png, "property.png");
    await addImage({ propertyId: ctx.property.id, filePath: image.filePath, originalName: "property.png", isPrimary: true });

    const original = await databaseSnapshot();
    const archive = await createEmailArchive(PASSWORD);
    const archiveTables = Object.keys(
      JSON.parse(new AdmZip(await decryptBackup(archive.data, PASSWORD)).readAsText("data.json")),
    );
    const encryptedPath = path.join(ctx.root, "mail", archive.file_name);
    await fs.mkdir(path.dirname(encryptedPath), { recursive: true });
    await fs.writeFile(encryptedPath, archive.data);

    await t.test("it holds manifest.json and data.json alone, none of it readable", async () => {
      assert.match(archive.file_name, /^Dalaly_Database_\d{4}-\d{2}-\d{2}_\d{6}\.dalaly-enc$/);
      assert.equal(archive.data.subarray(0, 9).toString("ascii"), "DALALYENC");
      for (const text of ["data.json", "manifest.json", ctx.people[0].national_id, ctx.people[0].full_name, "99887766"])
        assert.equal(archive.data.includes(Buffer.from(text)), false, text);
      const zip = new AdmZip(await decryptBackup(archive.data, PASSWORD));
      assert.deepEqual(zip.getEntries().map((entry) => entry.entryName).sort(), ["data.json", "manifest.json"]);
      const manifest = JSON.parse(zip.readAsText("manifest.json"));
      assert.equal(manifest.version, 3);
      assert.equal(manifest.contents, "database");
      assert.equal(JSON.parse(zip.readAsText("data.json")).identity_documents.length, 1);
      const { rows } = await pool.query("SELECT status, file_path, file_size FROM backup_jobs WHERE type = 'email_encrypted'");
      assert.deepEqual(rows.map((row) => [row.status, row.file_path, Number(row.file_size)]), [["success", null, archive.data.length]]);
      // Built in memory: nothing is written to the backup folder.
      assert.deepEqual(await fs.readdir(config.backupsDir).catch(() => []), []);
    });

    await t.test("a wrong or missing password, or a damaged file, fails without changing anything", async () => {
      const before = { database: await databaseSnapshot(), files: await fileSnapshot(ctx.root) };
      const flipped = Buffer.from(archive.data);
      flipped[100] ^= 0x01;
      const attempts: Array<[string | Buffer, string | undefined, (error: unknown) => boolean]> = [
        [encryptedPath, "not the password", domainError("BACKUP_PASSWORD_INVALID", /^كلمة مرور النسخة غير صحيحة\.$/)],
        [archive.data, "not the password", domainError("BACKUP_PASSWORD_INVALID")],
        [encryptedPath, undefined, domainError("BACKUP_PASSWORD_REQUIRED", /مشفّرة/)],
        [flipped, PASSWORD, domainError("BACKUP_DAMAGED", /تالف/)],
        [archive.data.subarray(0, archive.data.length - 20), PASSWORD, domainError("BACKUP_DAMAGED")],
        [archive.data.subarray(0, 40), PASSWORD, domainError("BACKUP_DAMAGED")],
        [encryptedPath, PASSWORD, domainError("BAD_REQUEST", /قاعدة البيانات فقط/)],
      ];
      for (const [index, [source, password, expected]] of attempts.entries()) {
        const scope = index === attempts.length - 1 ? "images" : "full";
        await assert.rejects(restoreBackup(source, scope, ctx.adminId, password), expected, `attempt ${index}`);
        assert.deepEqual({ database: await databaseSnapshot(), files: await fileSnapshot(ctx.root) }, before, `attempt ${index}`);
      }
    });

    await t.test("it restores with its password and leaves images and documents on disk", async () => {
      await pool.query("UPDATE properties SET name = 'بعد النسخة' WHERE id = $1", [ctx.property.id]);
      await pool.query("DELETE FROM identity_documents");
      const later = saveImageToDisk(ctx.property.id, png, "later.png");
      await addImage({ propertyId: ctx.property.id, filePath: later.filePath, originalName: "later.png", isPrimary: false });
      const mediaBefore = await fileSnapshot(path.join(ctx.root, "images"));
      const documentsBefore = await fileSnapshot(config.documentsDir);

      const restored = await restoreBackup(encryptedPath, "full", ctx.adminId, PASSWORD);
      assert.equal(restored.ok, true);
      assert.equal(restored.database_only, true);
      assert.equal(restored.images_restored, 0);
      assert.equal(restored.documents_restored, 0);
      assert.deepEqual(await databaseSnapshot(archiveTables), Object.fromEntries(archiveTables.map((name) => [name, original[name]])));
      // No file was deleted or rewritten, the image added after the archive included.
      assert.deepEqual(await fileSnapshot(path.join(ctx.root, "images")), mediaBefore);
      assert.deepEqual(await fileSnapshot(config.documentsDir), documentsBefore);
      // The copy kept before the restore is a full one, images included.
      const safety = new AdmZip(restored.safety_backup_path);
      assert.ok(safety.getEntries().some((entry) => entry.entryName === `images/properties/${later.filePath}`));
    });

    await t.test("the restore route takes the password and answers a wrong one in Arabic", async () => {
      // A full restore replaced the users table, and with it every session.
      const headers = { authorization: `Bearer ${(await login("removal_admin", "1234"))!.token}` };
      const data = archive.data.toString("base64");
      const wrong = await ctx.app.inject({ method: "POST", url: "/api/backup/restore", headers, payload: { scope: "full", data, password: "not the password" } });
      assert.equal(wrong.statusCode, 400);
      assert.deepEqual(wrong.json(), { code: "BACKUP_PASSWORD_INVALID", message: "كلمة مرور النسخة غير صحيحة." });
      const missing = await ctx.app.inject({ method: "POST", url: "/api/backup/restore", headers, payload: { scope: "full", file_path: encryptedPath } });
      assert.equal(missing.statusCode, 400);
      assert.equal(missing.json().code, "BACKUP_PASSWORD_REQUIRED");
      const restored = await ctx.app.inject({ method: "POST", url: "/api/backup/restore", headers, payload: { scope: "full", file_path: encryptedPath, password: PASSWORD } });
      assert.equal(restored.statusCode, 200, restored.body);
      assert.equal(restored.json().database_only, true);
    });

    await t.test("only Electron main gets the email archive, with a long enough password", async () => {
      Object.assign(config, { internalToken: "test-internal-token" });
      const url = "/api/backup/internal-email-archive";
      const denied = await ctx.app.inject({ method: "POST", url, payload: { password: PASSWORD } });
      assert.equal(denied.statusCode, 401);
      const headers = { "x-internal-token": "test-internal-token" };
      const short = await ctx.app.inject({ method: "POST", url, headers, payload: { password: "short" } });
      assert.equal(short.statusCode, 400);
      assert.equal(short.json().code, "VALIDATION_ERROR");
      const sent = await ctx.app.inject({ method: "POST", url, headers, payload: { password: PASSWORD } });
      assert.equal(sent.statusCode, 200);
      assert.equal(sent.headers["content-type"], "application/octet-stream");
      assert.match(String(sent.headers["content-disposition"]), /^attachment; filename="Dalaly_Database_[\d_-]+\.dalaly-enc"$/);
      const zip = new AdmZip(await decryptBackup(sent.rawPayload, PASSWORD));
      assert.deepEqual(zip.getEntries().map((entry) => entry.entryName).sort(), ["data.json", "manifest.json"]);
    });

    await t.test("unencrypted archives still restore, with or without a password typed", async () => {
      // Written by the build before backups were streamed (adm-zip).
      const fromPath = await restoreBackup(FIXTURE, "full", undefined, PASSWORD);
      assert.equal(fromPath.ok, true);
      assert.equal(fromPath.database_only, false);
      assert.equal(fromPath.images_restored, 3);
      assert.equal(fromPath.documents_restored, 1);
      const fromBuffer = await restoreBackup(await fs.readFile(FIXTURE), "full");
      assert.equal(fromBuffer.images_restored, 3);
      const exported = await exportBackup(path.join(ctx.root, "backups", "current.zip"));
      const current = await restoreBackup(exported.file_path, "full");
      assert.equal(current.database_only, false);
      assert.equal(current.images_restored, Object.keys(await fileSnapshot(config.imagesDir)).length);
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
