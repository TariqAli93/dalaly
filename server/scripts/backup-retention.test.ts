import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pool } from "../src/infrastructure/database/pool.js";
import {
  createBackup,
  exportBackup,
  getBackupDir,
  restoreBackup,
} from "../src/modules/backup/backup.service.js";
import { removalTestContext } from "./removal-test-context.js";

const exists = (file: string) =>
  fs.stat(file).then(
    () => true,
    () => false,
  );

const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1000 - (Date.now() % 1000) + 5));

async function jobStatus(id: number) {
  const { rows } = await pool.query("SELECT status FROM backup_jobs WHERE id = $1", [id]);
  return rows[0]?.status as string | undefined;
}

async function insertJob(type: string, filePath: string, createdAt: string) {
  const { rows } = await pool.query(
    "INSERT INTO backup_jobs(type, status, file_path, file_size, created_at) VALUES($1, 'success', $2, 1, $3) RETURNING id",
    [type, filePath, createdAt],
  );
  return Number(rows[0].id);
}

// Needs PostgreSQL (DB_* from .env); creates and drops its own dalaly_removal_test_* database.
test("retention keeps the newest 10 scheduled backups and pre-restore copies, and nothing else goes", async (t) => {
  const ctx = await removalTestContext("retention");
  try {
    const dir = await getBackupDir();
    await fs.mkdir(dir, { recursive: true });

    // Files the app did not record, two of them named like its backups.
    const strangers = [
      path.join(dir, "Dalaly_Backup_2020-01-01_000000.zip"),
      path.join(dir, "Dalaly_Before_Restore_2020-01-01_000000.zip"),
      path.join(dir, "notes.txt"),
    ];
    for (const file of strangers) await fs.writeFile(file, "not the app's");

    // Manual backups beyond the limit, and an export into the backup folder.
    const manual = [];
    for (let i = 0; i < 11; i += 1) manual.push(await createBackup("manual", ctx.adminId));
    const exported = await exportBackup(path.join(dir, "Dalaly_Backup_2021-01-01_000000.zip"), ctx.adminId);

    // Older scheduled jobs the retention must leave alone: one whose file is
    // outside the backup folder, one wrongly named, and one naming a manual
    // backup's file (two backups in one second shared a name before).
    const outside = path.join(ctx.root, "elsewhere", "Dalaly_Backup_2019-01-01_000000.zip");
    await fs.mkdir(path.dirname(outside), { recursive: true });
    await fs.writeFile(outside, "old scheduled backup elsewhere");
    const outsideJob = await insertJob("email", outside, "2019-01-01T00:00:00Z");
    const oddName = path.join(dir, "scheduled-copy.zip");
    await fs.writeFile(oddName, "renamed by the user");
    const oddJob = await insertJob("email", oddName, "2019-01-02T00:00:00Z");
    const sharedJob = await insertJob("email", manual[0].file_path, "2019-01-03T00:00:00Z");

    // File names have a resolution of one second. Scheduled runs are at least
    // a minute apart, so a newer backup never takes a deleted one's name; here
    // the ones retention deletes are kept out of the later backups' second.
    const scheduled = [];
    for (let i = 0; i < 12; i += 1) {
      if (i === 2) await nextSecond();
      scheduled.push(await createBackup("email"));
    }

    await t.test("backups in the same second get distinct files", () => {
      const files = [...manual, ...scheduled].map((backup) => backup.file_path);
      assert.equal(new Set(files).size, files.length);
    });

    await t.test("the two oldest scheduled backups are deleted and their jobs marked pruned", async () => {
      for (const backup of scheduled.slice(0, 2)) {
        assert.equal(await exists(backup.file_path), false, backup.file_path);
        assert.equal(await jobStatus(backup.job_id), "pruned");
      }
      for (const backup of scheduled.slice(2)) {
        assert.equal(await exists(backup.file_path), true, backup.file_path);
        assert.equal(await jobStatus(backup.job_id), "success");
      }
    });

    await t.test("each deletion is logged in backup_logs", async () => {
      const { rows } = await pool.query(
        "SELECT job_id, message FROM backup_logs WHERE message LIKE 'حُذفت نسخة قديمة%' ORDER BY id",
      );
      assert.deepEqual(
        rows.map((row) => Number(row.job_id)),
        scheduled.slice(0, 2).map((backup) => backup.job_id),
      );
      for (const [i, row] of rows.entries()) assert.ok(row.message.includes(scheduled[i].file_path));
    });

    await t.test("manual backups, exports and files the app did not write stay", async () => {
      for (const backup of manual) {
        assert.equal(await exists(backup.file_path), true, backup.file_path);
        assert.equal(await jobStatus(backup.job_id), "success");
      }
      assert.equal(await exists(exported.file_path), true);
      for (const file of [...strangers, outside, oddName]) assert.equal(await exists(file), true, file);
      for (const id of [outsideJob, oddJob, sharedJob]) assert.equal(await jobStatus(id), "success");
    });

    await t.test("pre-restore copies keep the newest 10 and leave scheduled backups alone", async () => {
      const copies = [];
      for (let i = 0; i < 11; i += 1)
        copies.push((await restoreBackup(manual[1].file_path, "settings", ctx.adminId)).safety_backup_path);
      assert.equal(await exists(copies[0]), false, copies[0]);
      for (const copy of copies.slice(1)) assert.equal(await exists(copy), true, copy);
      const { rows } = await pool.query(
        "SELECT file_path, status FROM backup_jobs WHERE type = 'pre_restore' ORDER BY id",
      );
      assert.deepEqual(
        rows.map((row) => row.status),
        ["pruned", ...Array(10).fill("success")],
      );
      assert.equal(rows[0].file_path, copies[0]);
      for (const backup of scheduled.slice(2)) assert.equal(await exists(backup.file_path), true);
      for (const file of strangers) assert.equal(await exists(file), true, file);
    });

    await t.test("a backup folder holds what retention keeps plus everything else", async () => {
      const names = (await fs.readdir(dir)).sort();
      const expected = [
        ...manual.map((backup) => backup.file_path),
        exported.file_path,
        ...scheduled.slice(2).map((backup) => backup.file_path),
        ...strangers,
        oddName,
      ].map((file) => path.basename(file));
      const preRestore = names.filter((name) => name.startsWith("Dalaly_Before_Restore_2") && name !== path.basename(strangers[1]));
      assert.equal(preRestore.length, 10);
      assert.deepEqual(
        names.filter((name) => !preRestore.includes(name)),
        expected.sort(),
      );
    });
  } finally {
    await ctx.close();
    await fs.rm(ctx.root, { recursive: true, force: true });
  }
});
