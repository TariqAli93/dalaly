// Runtime test for Windows user paths containing SPACES.
// Simulates: C:\Users\Futer House\AppData\Roaming\Dalaly ...
// Spawns the bundled server (shell:false, like production) with cwd + APP_DATA_DIR
// + DRIZZLE_MIGRATIONS_DIR all containing spaces, then exercises images, backup,
// export (to a spaced folder + spaced filename) and restore.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "dist", "index.js");
const MIGRATIONS_SRC = path.join(__dirname, "..", "drizzle");
const PORT = 45995;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB = "dalaly_spaces_test";
const ADMIN = { host: "127.0.0.1", port: 5432, user: "postgres", password: "root" };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log("  PASS " + n); } else { failed++; console.log("  FAIL " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); } };

async function adminQuery(sql, params) {
  const p = new pg.Pool({ ...ADMIN, database: "postgres", connectionTimeoutMillis: 4000 });
  try { return await p.query(sql, params); } finally { await p.end().catch(() => {}); }
}
async function dropDb() {
  try { await adminQuery(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`); }
  catch { await adminQuery(`DROP DATABASE IF EXISTS "${TEST_DB}"`).catch(() => {}); }
}
async function req(method, p, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await res.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: res.status, body: j };
}
async function waitHealth(ms = 20000) {
  const s = Date.now();
  while (Date.now() - s < ms) { try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 300)); }
  throw new Error("no health");
}

async function main() {
  await dropDb();

  // كل المجلدات تحتوي فراغات في أسمائها.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "Futer House "));
  const appData = path.join(base, "App Data Roaming", "Dalaly App");
  const runDir = path.join(base, "run dir with spaces");
  const migrationsDir = path.join(base, "server files", "drizzle dir");
  const exportTarget = path.join(base, "export folder", "My Backup File.zip");
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.dirname(migrationsDir), { recursive: true });
  fs.cpSync(MIGRATIONS_SRC, migrationsDir, { recursive: true });
  // config.json داخل مسار فيه فراغات (يُقرأ أثناء النسخ الاحتياطي).
  fs.writeFileSync(path.join(appData, "config.json"), JSON.stringify({ databaseUrl: "x", note: "spaces test" }));

  console.log("BASE PATH:", base);

  // shell:false (افتراضي عند spawn بدون shell) — مطابق لسلوك الإنتاج.
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: runDir,
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      API_HOST: "127.0.0.1", API_PORT: String(PORT),
      DRIZZLE_MIGRATIONS_DIR: migrationsDir,
      APP_DATA_DIR: appData,
      IMAGES_DIR: path.join(appData, "images", "properties"),
      BACKUP_DIR: path.join(appData, "backups"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = []; child.stdout.on("data", c => logs.push("" + c)); child.stderr.on("data", c => logs.push("" + c));

  try {
    await waitHealth();
    check("backend started from path with spaces", true);

    const init = await req("POST", "/setup/initialize", { body: { host: "127.0.0.1", port: 5432, adminUsername: "postgres", adminPassword: "root", databaseName: TEST_DB, firstAdminUsername: "admin", firstAdminPin: "4321" } });
    check("migrations ran from spaced dir + DB initialized", init.body?.ok === true, init.body);

    const token = (await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } })).body.token;
    check("login", !!token);

    const prop = await req("POST", "/properties", { token, body: { property_type: "بيت", legal_type: "طابو ملك صرف", area_value: 200, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 1000000, owner_name: "علي", owner_phone: "07700000001" } });
    const propId = prop.body.id;
    check("create property", prop.status === 201);

    console.log("== Images under spaced path ==");
    const up = await req("POST", `/properties/${propId}/images`, { token, body: { images: [{ data: "data:image/png;base64," + PNG, original_name: "a.png" }] } });
    check("upload image", up.status === 201, up.status);
    const imgDir = path.join(appData, "images", "properties", String(propId));
    check("image saved to spaced disk path", fs.existsSync(imgDir) && fs.readdirSync(imgDir).length === 1, imgDir);
    const fileRes = await fetch(`${BASE}/properties/${propId}/images/${up.body[0].id}/file?token=${token}`);
    check("image served 200 from spaced path", fileRes.status === 200, fileRes.status);

    console.log("== Backup under spaced path ==");
    const backup = await req("POST", "/backup/create", { token });
    check("backup created", backup.body?.ok === true, backup.body);
    check("backup zip exists in spaced backups dir", backup.body?.file_path?.includes("App Data Roaming") && fs.existsSync(backup.body.file_path), backup.body?.file_path);

    console.log("== Manual export to spaced folder + spaced filename ==");
    const exp = await req("POST", "/backup/export", { token, body: { outputPath: exportTarget } });
    check("export ok to spaced path", exp.body?.ok === true, exp.body);
    check("export file exists at spaced path", fs.existsSync(exportTarget), exportTarget);
    {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(exportTarget);
      check("export archive contains data.json", !!zip.getEntry("data.json"));
      check("export archive contains config.json (read from spaced path)", !!zip.getEntry("config.json"));
      check("export archive contains image", zip.getEntries().some(e => e.entryName.startsWith("images/properties/")));
    }

    console.log("== Restore from spaced path ==");
    await req("DELETE", `/properties/${propId}`, { token });
    const restore = await req("POST", "/backup/restore", { token, body: { scope: "full", file_path: exportTarget } });
    check("restore ok from spaced path", restore.body?.ok === true, restore.body);
    const token2 = (await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } })).body.token;
    const after = await req("GET", "/properties", { token: token2 });
    check("property restored", (after.body ?? []).some(p => p.id === propId), after.body?.length);
    check("image file restored to spaced path", fs.existsSync(imgDir) && fs.readdirSync(imgDir).length >= 1, imgDir);
  } catch (e) {
    failed++; console.log("FATAL", e?.stack || e?.message || e); console.log(logs.join(""));
  } finally {
    child.kill(); await new Promise(r => setTimeout(r, 500)); await dropDb();
    try { fs.rmSync(base, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==== SPACES: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) console.log(logs.join(""));
  process.exit(failed > 0 ? 1 : 0);
}
main();
