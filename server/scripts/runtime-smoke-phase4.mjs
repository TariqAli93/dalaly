// Phase-4 runtime smoke test: منع تكرار القطعة (409 + اسم المالك السابق + التطبيع).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "dist", "index.js");
const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");
const PORT = 45998;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB = "dalaly_phase4_test";
const ADMIN = { host: "127.0.0.1", port: 5432, user: "postgres", password: "root" };

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

function plotProp(extra = {}) {
  return {
    property_type: "أرض",
    legal_type: "طابو ملك صرف",
    area_value: 250,
    area_unit: "متر",
    pricing_method: "سعر على المتر",
    unit_price: 300000,
    owner_name: "مالك",
    owner_phone: "07700000000",
    ...extra
  };
}

async function main() {
  await dropDb();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-p4-"));
  const runDir = path.join(tmp, "run"); fs.mkdirSync(runDir, { recursive: true });
  const appData = path.join(tmp, "appdata"); fs.mkdirSync(appData, { recursive: true });
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
    const token = (await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } })).body.token;
    check("login", !!token);

    // محافظة → منطقة → حي
    const govId = (await req("POST", "/locations/governorates", { token, body: { name: "بغداد" } })).body.id;
    const distId = (await req("POST", "/locations/districts", { token, body: { governorate_id: govId, name: "الكرخ" } })).body.id;
    const neighId = (await req("POST", "/locations/neighborhoods", { token, body: { district_id: distId, name: "حي العامل" } })).body.id;
    const loc = { governorate_id: govId, district_id: distId, neighborhood_id: neighId };

    console.log("== إنشاء قطعة أول مرة ==");
    const p1 = await req("POST", "/properties", { token, body: plotProp({ ...loc, plot_number: "321", plot_letter: "أ", owner_name: "علي بابا", owner_phone: "07700000001" }) });
    check("إنشاء 321/أ أول مرة ينجح (201)", p1.status === 201, p1.status);

    console.log("== تكرار نفس القطعة ==");
    const dup = await req("POST", "/properties", { token, body: plotProp({ ...loc, plot_number: "321", plot_letter: "أ", owner_name: "خصم", owner_phone: "07700000002" }) });
    check("تكرار 321/أ يفشل (409)", dup.status === 409, dup.status);
    check("رسالة التكرار تحتوي اسم المالك السابق (علي بابا)", typeof dup.body?.message === "string" && dup.body.message.includes("علي بابا"), dup.body);

    console.log("== التطبيع (مسافات زائدة) ==");
    const dupSpaces = await req("POST", "/properties", { token, body: plotProp({ ...loc, plot_number: "  321 ", plot_letter: " أ ", owner_name: "آخر", owner_phone: "07700000003" }) });
    check("321 بمسافات زائدة يُعتبر تكراراً (409)", dupSpaces.status === 409, dupSpaces.status);

    console.log("== حرف مختلف / بدون حرف ==");
    const diffLetter = await req("POST", "/properties", { token, body: plotProp({ ...loc, plot_number: "321", plot_letter: "ب", owner_name: "صاحب ب", owner_phone: "07700000004" }) });
    check("نفس الرقم بحرف مختلف (321/ب) ينجح (201)", diffLetter.status === 201, diffLetter.status);

    const noLetter = await req("POST", "/properties", { token, body: plotProp({ ...loc, plot_number: "321", owner_name: "بدون حرف", owner_phone: "07700000005" }) });
    check("نفس الرقم بدون حرف (321) يختلف عن (321/أ) → ينجح (201)", noLetter.status === 201, noLetter.status);

    const noLetterDup = await req("POST", "/properties", { token, body: plotProp({ ...loc, plot_number: "321", plot_letter: "", owner_name: "مكرر بدون حرف", owner_phone: "07700000006" }) });
    check("تكرار 321 بدون حرف (null=='') يفشل (409)", noLetterDup.status === 409, noLetterDup.status);

    const enLetter = await req("POST", "/properties", { token, body: plotProp({ ...loc, plot_number: "321", plot_letter: "A", owner_name: "إنجليزي", owner_phone: "07700000007" }) });
    check("نفس الرقم بحرف إنجليزي A يختلف عن العربي أ → ينجح (201)", enLetter.status === 201, enLetter.status);

    console.log("== اختلاف الموقع ==");
    const distId2 = (await req("POST", "/locations/districts", { token, body: { governorate_id: govId, name: "الرصافة" } })).body.id;
    const diffLoc = await req("POST", "/properties", { token, body: plotProp({ governorate_id: govId, district_id: distId2, plot_number: "321", plot_letter: "أ", owner_name: "موقع آخر", owner_phone: "07700000008" }) });
    check("نفس القطعة في منطقة مختلفة → ينجح (201)", diffLoc.status === 201, diffLoc.status);

    console.log("== التعديل ==");
    const sameUpdate = await req("PUT", `/properties/${p1.body.id}`, { token, body: plotProp({ ...loc, plot_number: "321", plot_letter: "أ", owner_name: "علي بابا", owner_phone: "07700000001" }) });
    check("تعديل القطعة بنفس بياناتها لا يفشل (200)", sameUpdate.status === 200, sameUpdate.status);

    // اجعل قطعة (321/ب) تطابق (321/أ) → يجب أن يفشل
    const collideUpdate = await req("PUT", `/properties/${diffLetter.body.id}`, { token, body: plotProp({ ...loc, plot_number: "321", plot_letter: "أ", owner_name: "صاحب ب", owner_phone: "07700000004" }) });
    check("تعديل (321/ب) لتطابق (321/أ) يفشل (409)", collideUpdate.status === 409, collideUpdate.status);
    check("رسالة تعارض التعديل تحتوي اسم المالك (علي بابا)", typeof collideUpdate.body?.message === "string" && collideUpdate.body.message.includes("علي بابا"), collideUpdate.body);

    console.log("== عرض بلا رقم قطعة لا يتأثر ==");
    const noPlot1 = await req("POST", "/properties", { token, body: plotProp({ ...loc, owner_name: "بلا قطعة 1", owner_phone: "07700000009" }) });
    const noPlot2 = await req("POST", "/properties", { token, body: plotProp({ ...loc, owner_name: "بلا قطعة 2", owner_phone: "07700000010" }) });
    check("عرضان بلا رقم قطعة لا يتعارضان (201,201)", noPlot1.status === 201 && noPlot2.status === 201, [noPlot1.status, noPlot2.status]);
  } catch (e) {
    failed++; console.log("FATAL", e?.stack || e?.message || e); console.log(logs.join(""));
  } finally {
    child.kill(); await new Promise(r => setTimeout(r, 500)); await dropDb();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==== PHASE 4: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) console.log(logs.join(""));
  process.exit(failed > 0 ? 1 : 0);
}
main();
