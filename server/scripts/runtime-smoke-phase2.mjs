// Phase-2 runtime smoke test: images, followups, favorites, dashboard, backup/restore, import.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "dist", "index.js");
const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");
const PORT = 45996;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB = "dalaly_phase2_test";
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-p2-"));
  const runDir = path.join(tmp, "run"); fs.mkdirSync(runDir, { recursive: true });
  const appData = path.join(tmp, "appdata"); fs.mkdirSync(appData, { recursive: true });
  // write a config.json into appData so backup includes it
  fs.writeFileSync(path.join(appData, "config.json"), JSON.stringify({ databaseUrl: "x" }));

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: runDir,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, API_HOST: "127.0.0.1", API_PORT: String(PORT), DRIZZLE_MIGRATIONS_DIR: MIGRATIONS_DIR, APP_DATA_DIR: appData },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = []; child.stdout.on("data", c => logs.push("" + c)); child.stderr.on("data", c => logs.push("" + c));

  try {
    await waitHealth();
    await req("POST", "/setup/initialize", { body: { host: "127.0.0.1", port: 5432, adminUsername: "postgres", adminPassword: "root", databaseName: TEST_DB, firstAdminUsername: "admin", firstAdminPin: "4321" } });
    let token = (await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } })).body.token;
    check("login", !!token);

    // property
    const prop = await req("POST", "/properties", { token, body: { property_type: "بيت", legal_type: "طابو ملك صرف", area_value: 200, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 1000000, owner_name: "علي", owner_phone: "07700000001" } });
    const propId = prop.body.id;
    check("create property", prop.status === 201, prop.status);

    console.log("== Images ==");
    const up1 = await req("POST", `/properties/${propId}/images`, { token, body: { images: [{ data: "data:image/png;base64," + PNG, original_name: "a.png" }] } });
    check("upload image 1 (201)", up1.status === 201, up1.status);
    check("first image is primary", up1.body?.[0]?.is_primary === true, up1.body?.[0]);
    const up2 = await req("POST", `/properties/${propId}/images`, { token, body: { images: [{ data: PNG, original_name: "b.png" }] } });
    const img1 = up1.body[0].id, img2 = up2.body[0].id;
    let imgs = await req("GET", `/properties/${propId}/images`, { token });
    check("list 2 images", imgs.body.length === 2, imgs.body?.length);
    // file served
    const fileRes = await fetch(`${BASE}/properties/${propId}/images/${img1}/file?token=${token}`);
    check("image file served 200", fileRes.status === 200, fileRes.status);
    check("image content-type png", (fileRes.headers.get("content-type") || "").includes("image/png"), fileRes.headers.get("content-type"));
    const fileBuf = Buffer.from(await fileRes.arrayBuffer());
    check("image bytes match", fileBuf.length === Buffer.from(PNG, "base64").length, fileBuf.length);
    // set primary on img2
    await req("PATCH", `/properties/${propId}/images/${img2}/primary`, { token });
    imgs = await req("GET", `/properties/${propId}/images`, { token });
    check("primary moved to img2", imgs.body.find(i => i.id === img2)?.is_primary === true);
    // reorder
    await req("PUT", `/properties/${propId}/images/order`, { token, body: { ids: [img2, img1] } });
    imgs = await req("GET", `/properties/${propId}/images`, { token });
    check("reorder applied", imgs.body[0].id === img2, imgs.body.map(i => i.id));
    // delete img1
    const del = await req("DELETE", `/properties/${propId}/images/${img1}`, { token });
    check("delete image", del.body?.deleted === true);
    imgs = await req("GET", `/properties/${propId}/images`, { token });
    check("1 image left", imgs.body.length === 1, imgs.body?.length);
    // file removed from disk
    const diskFiles = fs.existsSync(path.join(appData, "images", "properties", String(propId))) ? fs.readdirSync(path.join(appData, "images", "properties", String(propId))) : [];
    check("disk has 1 file", diskFiles.length === 1, diskFiles.length);

    console.log("== Follow-ups ==");
    const fu = await req("POST", `/properties/${propId}/followups`, { token, body: { type: "phone_call", notes: "اتصلت بالمالك", scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString() } });
    check("create followup", fu.status === 201, fu.status);
    const fuList = await req("GET", `/properties/${propId}/followups`, { token });
    check("followup listed with user_name", fuList.body?.[0]?.user_name === "admin", fuList.body?.[0]);

    console.log("== Favorites ==");
    await req("POST", `/favorites/${propId}`, { token });
    const favIds = await req("GET", "/favorites/ids", { token });
    check("favorite id present", favIds.body?.ids?.includes(propId), favIds.body);
    const favList = await req("GET", "/favorites", { token });
    check("favorite property listed", favList.body?.length === 1, favList.body?.length);
    await req("DELETE", `/favorites/${propId}`, { token });
    const favIds2 = await req("GET", "/favorites/ids", { token });
    check("favorite removed", !favIds2.body?.ids?.includes(propId));

    console.log("== Dashboard ==");
    const dash = await req("GET", "/dashboard/summary", { token });
    check("dashboard counts.total>=1", dash.body?.counts?.total >= 1, dash.body?.counts);
    check("dashboard financial total_value>0", Number(dash.body?.financial?.total_value) > 0, dash.body?.financial);
    check("dashboard latest array", Array.isArray(dash.body?.latest), typeof dash.body?.latest);
    check("dashboard recent_activity array", Array.isArray(dash.body?.recent_activity));
    check("dashboard reminders has our followup", (dash.body?.reminders ?? []).some(r => r.property_id === propId), dash.body?.reminders?.length);

    console.log("== Backup ==");
    const backup = await req("POST", "/backup/create", { token });
    check("backup created", backup.body?.ok === true, backup.body);
    check("backup file exists", backup.body?.file_path && fs.existsSync(backup.body.file_path), backup.body?.file_path);
    check("backup size > 0", backup.body?.file_size > 0, backup.body?.file_size);
    const backupPath = backup.body.file_path;
    const hist = await req("GET", "/backup/history", { token });
    check("backup history has job", hist.body?.jobs?.length >= 1, hist.body?.jobs?.length);
    check("last_backup_at set", !!hist.body?.last_backup_at);

    console.log("== Manual Export (chosen path) ==");
    const exportTarget = path.join(tmp, "Manual_Export.zip");
    const emptyExport = await req("POST", "/backup/export", { token, body: { outputPath: "" } });
    check("export empty path rejected", emptyExport.status >= 400, emptyExport.status);
    const exp = await req("POST", "/backup/export", { token, body: { outputPath: exportTarget } });
    check("export ok", exp.body?.ok === true, exp.body);
    check("export file at chosen path", fs.existsSync(exportTarget) && exp.body?.file_path === exportTarget, exp.body?.file_path);
    check("export size > 0", exp.body?.file_size > 0, exp.body?.file_size);
    // تحقق من metadata داخل الأرشيف
    {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(exportTarget);
      const manifest = JSON.parse(zip.getEntry("manifest.json").getData().toString("utf8"));
      check("manifest backup_type=manual_export", manifest.backup_type === "manual_export", manifest);
      check("manifest has tables_count", typeof manifest.tables_count === "number" && manifest.tables_count > 0, manifest.tables_count);
      check("manifest has app_version + created_at", !!manifest.app_version && !!manifest.created_at, manifest);
    }
    const histAfter = await req("GET", "/backup/history", { token });
    check("export logged in history (manual_export)", (histAfter.body?.jobs ?? []).some(j => j.type === "manual_export" && j.status === "success"), histAfter.body?.jobs?.map(j=>j.type));

    console.log("== Restore (full) ==");
    await req("DELETE", `/properties/${propId}`, { token });
    let after = await req("GET", "/properties", { token });
    check("property deleted before restore", (after.body ?? []).length === 0, after.body?.length);
    const restore = await req("POST", "/backup/restore", { token, body: { scope: "full", file_path: backupPath } });
    check("restore ok", restore.body?.ok === true, restore.body);
    // re-login (sessions were cascade-deleted when users table restored)
    token = (await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } })).body.token;
    check("re-login after restore", !!token);
    after = await req("GET", "/properties", { token });
    check("property restored", (after.body ?? []).some(p => p.id === propId), after.body?.length);
    const imgsR = await req("GET", `/properties/${propId}/images`, { token });
    check("images metadata restored", imgsR.body?.length === 1, imgsR.body?.length);

    console.log("== Excel import (validate + commit) ==");
    const importRows = [
      { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 500, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 200000, owner_name: "نور", owner_phone: "07811112222" },
      { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 500, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 200000, owner_name: "نور2", owner_phone: "07811112222" }, // dup phone
      { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: -5, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 200000, owner_name: "", owner_phone: "07833334444" } // invalid
    ];
    const val = await req("POST", "/import/properties/validate", { token, body: { rows: importRows } });
    check("import validate: 1 valid", val.body?.valid_count === 1, val.body);
    check("import validate: 1 duplicate", val.body?.duplicate_count === 1, val.body);
    check("import validate: 1 error", val.body?.error_count === 1, val.body);
    const commit = await req("POST", "/import/properties/commit", { token, body: { rows: importRows } });
    check("import commit: 1 inserted", commit.body?.inserted === 1, commit.body);
    check("import commit: 2 skipped", commit.body?.skipped === 2, commit.body);

    console.log("== RBAC perms present ==");
    const me = await req("GET", "/auth/me", { token });
    const perms = (me.body?.permissions ?? []).map(p => p.key);
    ["properties.images.manage", "backups.create", "backups.restore", "followups.create"].forEach(p =>
      check("perm " + p, perms.includes(p))
    );
  } catch (e) {
    failed++; console.log("FATAL", e?.stack || e?.message || e); console.log(logs.join(""));
  } finally {
    child.kill(); await new Promise(r => setTimeout(r, 500)); await dropDb();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==== PHASE 2: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) console.log(logs.join(""));
  process.exit(failed > 0 ? 1 : 0);
}
main();
