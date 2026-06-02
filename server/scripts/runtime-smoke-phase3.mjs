// Phase-3 runtime smoke test: المحافظة→المنطقة→الحي، حرف القطعة، النزال/رقم العقار، الفلاتر، استيراد Excel.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "dist", "index.js");
const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");
const PORT = 45997;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB = "dalaly_phase3_test";
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

// حمولة عرض أساسية صحيحة.
function baseProp(extra = {}) {
  return {
    property_type: "أرض",
    legal_type: "طابو ملك صرف",
    area_value: 200,
    area_unit: "متر",
    pricing_method: "سعر على المتر",
    unit_price: 1000000,
    owner_name: "علي",
    owner_phone: "07700000000",
    ...extra
  };
}

async function main() {
  await dropDb();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-p3-"));
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

    console.log("== المحافظة → المنطقة → الحي ==");
    const gov = await req("POST", "/locations/governorates", { token, body: { name: "بغداد" } });
    check("create governorate بغداد (201)", gov.status === 201, gov.status);
    const govId = gov.body.id;
    const dist = await req("POST", "/locations/districts", { token, body: { governorate_id: govId, name: "الدورة" } });
    check("create district الدورة (201)", dist.status === 201, dist.status);
    const distId = dist.body.id;
    const neigh = await req("POST", "/locations/neighborhoods", { token, body: { district_id: distId, name: "حي دجلة" } });
    check("create neighborhood حي دجلة (201)", neigh.status === 201, neigh.status);
    const neighId = neigh.body.id;

    const locs = await req("GET", "/locations", { token });
    check("locations returns neighborhoods array", Array.isArray(locs.body?.neighborhoods), typeof locs.body?.neighborhoods);
    check("neighborhood listed under district", (locs.body?.neighborhoods ?? []).some(n => n.id === neighId && n.district_id === distId), locs.body?.neighborhoods);

    console.log("== إنشاء عروض (حرف القطعة + النزال) ==");
    // P1: ضمن بغداد→الدورة→حي دجلة، بدون حرف قطعة، مساحة 100، قطعة 100
    const p1 = await req("POST", "/properties", { token, body: baseProp({ area_value: 100, plot_number: "100", governorate_id: govId, district_id: distId, neighborhood_id: neighId, owner_phone: "07700000001" }) });
    check("create property بدون حرف قطعة (201)", p1.status === 201, p1.status);
    check("P1 plot_letter فارغ", !p1.body?.plot_letter, p1.body?.plot_letter);
    check("P1 neighborhood محلول = حي دجلة", p1.body?.neighborhood === "حي دجلة", p1.body?.neighborhood);
    check("P1 neighborhood_id مضبوط", p1.body?.neighborhood_id === neighId, p1.body?.neighborhood_id);
    const p1Id = p1.body.id;

    // P2: حرف عربي "أ"، مساحة 500، قطعة 321
    const p2 = await req("POST", "/properties", { token, body: baseProp({ area_value: 500, plot_number: "321", plot_letter: "أ", owner_phone: "07700000002" }) });
    check("create property بحرف عربي أ (201)", p2.status === 201, p2.status);
    check("P2 plot_letter = أ", p2.body?.plot_letter === "أ", p2.body?.plot_letter);

    // P3: حرف إنجليزي "A"، مساحة 900، قطعة 321
    const p3 = await req("POST", "/properties", { token, body: baseProp({ area_value: 900, plot_number: "321", plot_letter: "A", owner_phone: "07700000003" }) });
    check("create property بحرف إنجليزي A (201)", p3.status === 201, p3.status);
    check("P3 plot_letter = A", p3.body?.plot_letter === "A", p3.body?.plot_letter);

    // P4: مع الواجهة 8 والنزال (العمق) 12.5، مساحة 1500، قطعة 777
    const p4 = await req("POST", "/properties", { token, body: baseProp({ area_value: 1500, plot_number: "777", frontage: "8", nazal: "12.5", owner_phone: "07700000004" }) });
    check("create property مع الواجهة + النزال (201)", p4.status === 201, p4.status);
    check("P4 frontage = 8", p4.body?.frontage === "8", p4.body?.frontage);
    check("P4 nazal (العمق) = 12.5", p4.body?.nazal === "12.5", p4.body?.nazal);

    // get يعيد الحقول
    const getP2 = await req("GET", `/properties/${p2.body.id}`, { token });
    check("GET يعيد plot_number + plot_letter", getP2.body?.plot_number === "321" && getP2.body?.plot_letter === "أ", getP2.body);

    console.log("== الفلاتر ==");
    const fArea = await req("GET", "/properties?area_min=400&area_max=1000", { token });
    const areaIds = (fArea.body ?? []).map(p => p.id);
    check("فلتر المساحة 400-1000 يضم P2,P3", areaIds.includes(p2.body.id) && areaIds.includes(p3.body.id), areaIds);
    check("فلتر المساحة يستبعد P1(100),P4(1500)", !areaIds.includes(p1Id) && !areaIds.includes(p4.body.id), areaIds);

    const fPlot = await req("GET", "/properties?plot_number=321", { token });
    const plotIds = (fPlot.body ?? []).map(p => p.id);
    check("فلتر رقم القطعة 321 يضم P2,P3", plotIds.includes(p2.body.id) && plotIds.includes(p3.body.id), plotIds);
    check("فلتر رقم القطعة 321 يستبعد P1(100)", !plotIds.includes(p1Id), plotIds);

    const fLetterAr = await req("GET", `/properties?plot_letter=${encodeURIComponent("أ")}`, { token });
    const letterArIds = (fLetterAr.body ?? []).map(p => p.id);
    check("فلتر حرف القطعة أ يضم P2 فقط", letterArIds.includes(p2.body.id) && !letterArIds.includes(p3.body.id), letterArIds);

    const fLetterEn = await req("GET", "/properties?plot_letter=A", { token });
    const letterEnIds = (fLetterEn.body ?? []).map(p => p.id);
    check("فلتر حرف القطعة A يضم P3 فقط", letterEnIds.includes(p3.body.id) && !letterEnIds.includes(p2.body.id), letterEnIds);

    const fGov = await req("GET", `/properties?governorate_id=${govId}`, { token });
    const govIds = (fGov.body ?? []).map(p => p.id);
    check("فلتر المحافظة يضم P1 فقط", govIds.includes(p1Id) && !govIds.includes(p2.body.id), govIds);

    const fDist = await req("GET", `/properties?district_id=${distId}`, { token });
    check("فلتر المنطقة يضم P1", (fDist.body ?? []).some(p => p.id === p1Id), (fDist.body ?? []).map(p => p.id));

    const fNeigh = await req("GET", `/properties?neighborhood_id=${neighId}`, { token });
    const neighIds = (fNeigh.body ?? []).map(p => p.id);
    check("فلتر الحي يضم P1 فقط", neighIds.includes(p1Id) && neighIds.length === 1, neighIds);

    // بحث q عن قيمة النزال (العمق)
    const fq = await req("GET", `/properties?q=${encodeURIComponent("12.5")}`, { token });
    check("بحث q يجد العرض حسب النزال (العمق)", (fq.body ?? []).some(p => p.id === p4.body.id), (fq.body ?? []).map(p => p.id));

    console.log("== استيراد Excel (أعمدة جديدة + توافق قديم) ==");
    const importRows = [
      { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 600, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 200000, owner_name: "نور", owner_phone: "07811110000", neighborhood_text: "حي الإمام", plot_number: "55", plot_letter: "ب", frontage: "9", nazal: "13.5" },
      { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 700, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 200000, owner_name: "سعد", owner_phone: "07811110001" }
    ];
    const val = await req("POST", "/import/properties/validate", { token, body: { rows: importRows } });
    check("import validate: 2 valid", val.body?.valid_count === 2, val.body);
    const commit = await req("POST", "/import/properties/commit", { token, body: { rows: importRows } });
    check("import commit: 2 inserted", commit.body?.inserted === 2, commit.body);

    const listAll = await req("GET", "/properties", { token });
    const imported1 = (listAll.body ?? []).find(p => p.owner_phone === "07811110000");
    const imported2 = (listAll.body ?? []).find(p => p.owner_phone === "07811110001");
    check("صف الاستيراد الجديد يحمل الحي/الحرف/الواجهة/النزال",
      imported1?.neighborhood_text === "حي الإمام" && imported1?.plot_letter === "ب" && imported1?.frontage === "9" && imported1?.nazal === "13.5",
      imported1);
    check("صف الاستيراد القديم (بلا أعمدة جديدة) أُدرج بقيم فارغة",
      !!imported2 && !imported2.plot_letter && !imported2.nazal && !imported2.neighborhood_text,
      imported2);

    console.log("== حارس حذف الحي المرتبط ==");
    const delNeigh = await req("DELETE", `/locations/neighborhoods/${neighId}`, { token });
    check("منع حذف حي مرتبط بعقار (>=400)", delNeigh.status >= 400, delNeigh.status);
  } catch (e) {
    failed++; console.log("FATAL", e?.stack || e?.message || e); console.log(logs.join(""));
  } finally {
    child.kill(); await new Promise(r => setTimeout(r, 500)); await dropDb();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==== PHASE 3: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) console.log(logs.join(""));
  process.exit(failed > 0 ? 1 : 0);
}
main();
