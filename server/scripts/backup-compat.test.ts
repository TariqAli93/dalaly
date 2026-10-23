import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { config } from "../src/infrastructure/config.js";
import { db } from "../src/infrastructure/database/db.js";
import * as schema from "../src/infrastructure/database/schema.js";
import {
  exportBackup,
  restoreBackup,
} from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
// The fixture was written by the released build before backups were streamed
// (d5c5921, adm-zip), through POST /api/backup/export, from a database with
// one person, property (two images), rental (one image) and identity document.
const FIXTURE = path.resolve("scripts/fixtures/backup-v3-adm-zip.zip");

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

/** Where restore writes an archive file entry. */
function restoredPath(entryName: string) {
  return entryName.startsWith("documents/")
    ? path.join(config.documentsDir, entryName.slice("documents/".length))
    : path.join(config.imagesDir, entryName.slice("images/properties/".length));
}

const mediaFiles = (zip: AdmZip) =>
  zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && /^(images\/properties|documents)\//.test(entry.entryName));

test("archives written before streaming restore, and new archives keep their layout", async (t) => {
  const ctx = await removalTestContext("compat");
  try {
    const fixture = new AdmZip(FIXTURE);
    const data = JSON.parse(fixture.readAsText("data.json")) as Record<string, unknown[]>;
    const files = mediaFiles(fixture);
    assert.equal(files.length, 4);

    const assertRestored = async () => {
      for (const [name, rows] of Object.entries(data)) {
        const table = tables.get(name);
        assert.ok(table, `known table: ${name}`);
        assert.deepEqual(canonicalRows(await db.select().from(table)), canonicalRows(rows), name);
      }
      for (const entry of files)
        assert.deepEqual(await fs.readFile(restoredPath(entry.entryName)), entry.getData(), entry.entryName);
    };

    await t.test("an adm-zip archive restores from its path", async () => {
      const restored = await restoreBackup(FIXTURE, "full");
      assert.equal(restored.ok, true);
      assert.equal(restored.images_restored, 3);
      assert.equal(restored.documents_restored, 1);
      await assertRestored();
    });

    await t.test("an adm-zip archive restores from an uploaded buffer", async () => {
      for (const entry of files) await fs.writeFile(restoredPath(entry.entryName), "changed");
      const restored = await restoreBackup(await fs.readFile(FIXTURE), "full");
      assert.equal(restored.ok, true);
      await assertRestored();
    });

    await t.test("a new archive has adm-zip's entries and reads back with adm-zip", async () => {
      const output = path.join(ctx.root, "backups", "streamed.zip");
      assert.equal((await exportBackup(output)).ok, true);
      await assert.rejects(fs.stat(`${output}.partial`), { code: "ENOENT" });
      const streamed = new AdmZip(output);
      // What the adm-zip writer would store for the same data and folders.
      const reference = new AdmZip();
      reference.addFile("manifest.json", Buffer.from("{}"));
      reference.addFile("data.json", Buffer.from("{}"));
      reference.addLocalFolder(config.imagesDir, "images/properties");
      reference.addLocalFolder(config.documentsDir, "documents");
      const names = (zip: AdmZip) => zip.getEntries().map((entry) => entry.entryName).sort();
      assert.deepEqual(names(streamed), names(reference));
      // getData() verifies each entry's CRC-32, as restore in older builds does.
      for (const entry of mediaFiles(streamed))
        assert.deepEqual(entry.getData(), await fs.readFile(restoredPath(entry.entryName)), entry.entryName);
      assert.equal(JSON.parse(streamed.readAsText("manifest.json")).version, 3);
      const exported = JSON.parse(streamed.readAsText("data.json")) as Record<string, unknown[]>;
      for (const [name, rows] of Object.entries(data))
        assert.deepEqual(canonicalRows(exported[name]), canonicalRows(rows), name);
    });

    await t.test("a damaged entry is refused before it replaces the file on disk", async () => {
      const bytes = await fs.readFile(FIXTURE);
      const document = files.find((entry) => entry.entryName.startsWith("documents/"))!;
      const header = document.header.offset;
      const dataStart = header + 30 + bytes.readUInt16LE(header + 26) + bytes.readUInt16LE(header + 28);
      bytes[dataStart + 10] ^= 0xff;
      const target = restoredPath(document.entryName);
      const before = await fs.readFile(target);
      // The byte still inflates; only the CRC-32 tells the data is wrong.
      await assert.rejects(restoreBackup(bytes, "full"), /ملف تالف داخل النسخة الاحتياطية/);
      assert.deepEqual(await fs.readFile(target), before);
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
