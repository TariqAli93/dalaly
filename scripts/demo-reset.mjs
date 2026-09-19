/**
 * pnpm demo:reset — يعيد قاعدة العرض (dalaly_demo) إلى حالة معروفة ثابتة
 * قبل كل جلسة تصوير:
 *
 *   1. حذف قاعدة العرض بالكامل وإعادة إنشائها.   (يُتخطّى مع ‎--soft‎)
 *   2. تشغيل migrations + بذر الأدوار والمستخدمين والمواقع والعروض والمتابعات.
 *   3. حذف بيانات العرض (صور + نسخ احتياطية) وإعادة ربط الصور التجريبية.
 *
 * ‎--soft‎ : إعادة ضبط على مستوى البيانات فقط بلا حذف القاعدة. تستخدمه
 *          اختبارات التصوير بين الميزات لأنه لا يقطع اتصالات الخادم العاملة.
 *
 * لا يمسّ قاعدة التطوير (dalaly) ولا أي قاعدة أخرى — يرفض التشغيل إن لم يكن
 * اسم القاعدة الهدف dalaly_demo.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ROOT, SERVER_DIR, WEB_DEMO, serverEnv } from "./web-demo-env.mjs";

const soft = process.argv.includes("--soft");
const quiet = process.argv.includes("--quiet");
const DEMO_DATA_DIR = path.join(SERVER_DIR, "data", "web-demo");

const log = (message) => {
  if (!quiet) console.log(message);
};

if (WEB_DEMO.dbName !== "dalaly_demo") {
  console.error(
    `✗ توقّف: قاعدة العرض المُعدّة هي "${WEB_DEMO.dbName}" وليست dalaly_demo.\n` +
      "  راجع .env.web-demo — هذا السكربت يحذف القاعدة بالكامل.",
  );
  process.exit(1);
}

if (!soft) {
  log(`→ حذف وإعادة إنشاء قاعدة العرض "${WEB_DEMO.dbName}"…`);
  const admin = new pg.Client({ ...WEB_DEMO.db, database: "postgres" });
  await admin.connect();
  await admin.query(
    `select pg_terminate_backend(pid) from pg_stat_activity
      where datname = $1 and pid <> pg_backend_pid()`,
    [WEB_DEMO.dbName],
  );
  await admin.query(`drop database if exists "${WEB_DEMO.dbName}"`);
  await admin.query(`create database "${WEB_DEMO.dbName}"`);
  await admin.end();

  log("→ حذف بيانات العرض السابقة (صور ونسخ احتياطية)…");
  fs.rmSync(DEMO_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEMO_DATA_DIR, { recursive: true });
} else {
  // إعادة ضبط ناعمة: نحذف النسخ الاحتياطية المولَّدة أثناء التصوير فقط.
  fs.rmSync(path.join(DEMO_DATA_DIR, "backups"), { recursive: true, force: true });
}

log("→ تشغيل migrations وبذر بيانات العرض…");
const seed = spawnSync(
  "pnpm",
  ["exec", "tsx", "src/infrastructure/database/seed.ts", "--reset"],
  {
    cwd: SERVER_DIR,
    env: serverEnv(),
    stdio: quiet ? "pipe" : "inherit",
    shell: process.platform === "win32",
  },
);
if (seed.status !== 0) {
  console.error("✗ فشل بذر بيانات العرض.");
  if (quiet) console.error(String(seed.stderr ?? seed.stdout ?? ""));
  process.exit(seed.status ?? 1);
}

log("→ ضبط حالة قاعدة العرض…");
const demoDb = new pg.Client({ ...WEB_DEMO.db, database: WEB_DEMO.dbName });
await demoDb.connect();
await demoDb.query("update users set display_name = $2 where username = $1", [
  WEB_DEMO.adminUsername,
  "حساب العرض — مدير النظام",
]);
// سجلّ النسخ الاحتياطية جزء من حالة العرض — يُصفَّر أيضاً.
await demoDb.query("delete from backup_jobs");
await demoDb.end();

log("→ ربط الصور التجريبية…");
const images = spawnSync("node", [path.join(ROOT, "scripts", "seed-demo-images.mjs")], {
  cwd: ROOT,
  env: process.env,
  stdio: quiet ? "pipe" : "inherit",
  shell: process.platform === "win32",
});
if (images.status !== 0) {
  console.error("✗ فشل ربط الصور التجريبية.");
  if (quiet) console.error(String(images.stderr ?? images.stdout ?? ""));
  process.exit(images.status ?? 1);
}

log("");
log(soft ? "✓ أُعيدت بيانات العرض." : "✓ قاعدة العرض جاهزة.");
if (!soft) {
  log(`  الحساب: ${WEB_DEMO.adminUsername} / ${WEB_DEMO.adminPin}`);
  log("");
}
