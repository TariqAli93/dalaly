// Phase-5 runtime smoke test: البحث الشامل عن العقار (كل الحقول + الهاتف المطبّع + الفلاتر + pagination).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "dist", "index.js");
const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");
const PORT = 45999;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB = "dalaly_phase5_test";
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
let TOKEN = "";
async function req(method, p, { token = TOKEN, body } = {}) {
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
const q = (term) => req("GET", `/properties?q=${encodeURIComponent(term)}`);
const has = (r, id) => Array.isArray(r.body) && r.body.some((p) => p.id === id);
const count = (r) => (Array.isArray(r.body) ? r.body.length : -1);

async function main() {
  await dropDb();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-p5-"));
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
    await req("POST", "/setup/initialize", { token: null, body: { host: "127.0.0.1", port: 5432, adminUsername: "postgres", adminPassword: "root", databaseName: TEST_DB, firstAdminUsername: "admin", firstAdminPin: "4321" } });
    TOKEN = (await req("POST", "/auth/login", { token: null, body: { username: "admin", pin: "4321" } })).body.token;
    check("login", !!TOKEN);

    const govId = (await req("POST", "/locations/governorates", { body: { name: "بغداد" } })).body.id;
    const distId = (await req("POST", "/locations/districts", { body: { governorate_id: govId, name: "الدورة" } })).body.id;
    const distId2 = (await req("POST", "/locations/districts", { body: { governorate_id: govId, name: "الرصافة" } })).body.id;
    const neighId = (await req("POST", "/locations/neighborhoods", { body: { district_id: distId, name: "حي دجلة" } })).body.id;

    // P: عرض غنيّ بكل الحقول.
    const P = await req("POST", "/properties", { body: {
      property_type: "بيت", legal_type: "طابو ملك صرف", area_value: 250, area_unit: "متر",
      pricing_method: "سعر على المتر", unit_price: 300000,
      owner_name: "علي حسن الموسوي", owner_phone: "0770 123 4567",
      governorate_id: govId, district_id: distId, neighborhood_id: neighId,
      address_details: "قرب جامع النور شارع 14", notes: "بيت زاوية مطل على الشارع",
      plot_number: "321", plot_letter: "أ", nazal: "12.5", frontage: "8",
      subdistrict_number: "م7", subdistrict_name: "المقاطعة الشمالية",
      mahalla: "محلة 620", alley: "زقاق 5", house_number: "دار 12", nearest_landmark: "قرب الحديقة"
    } });
    check("create P (201)", P.status === 201, P.status);
    const pId = P.body.id;

    // R, S: في نفس الحي (لاختبار pagination مع البحث).
    const R = await req("POST", "/properties", { body: { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 400, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 200000, owner_name: "ثاني", owner_phone: "07700000022", governorate_id: govId, district_id: distId, neighborhood_id: neighId, plot_number: "322" } });
    const S = await req("POST", "/properties", { body: { property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 500, area_unit: "متر", pricing_method: "سعر على المتر", unit_price: 200000, owner_name: "ثالث", owner_phone: "07700000033", governorate_id: govId, district_id: distId, neighborhood_id: neighId, plot_number: "323" } });

    // Q: عرض مُلهٍ في منطقة أخرى + تسعير بالدونم.
    const Q = await req("POST", "/properties", { body: { property_type: "مزرعة", legal_type: "طابو زراعي ملك صرف", area_value: 1000, area_unit: "دونم", pricing_method: "سعر على الدونم", unit_price: 500000, owner_name: "سعد كاظم", owner_phone: "07811112222", governorate_id: govId, district_id: distId2, plot_number: "999" } });
    const qId = Q.body.id;
    check("create R,S,Q (201)", R.status === 201 && S.status === 201 && Q.status === 201, [R.status, S.status, Q.status]);

    console.log("== بحث بكل حقل (يرجع P) ==");
    check("اسم المالك (الموسوي)", has(await q("الموسوي"), pId));
    check("هاتف المالك كامل (07701234567)", has(await q("07701234567"), pId));
    check("جزء من الهاتف (123)", has(await q("123"), pId));
    check("هاتف بمسافات (0770 123)", has(await q("0770 123"), pId));
    check("العنوان التفصيلي (جامع النور)", has(await q("جامع النور"), pId));
    check("الملاحظات (زاوية)", has(await q("زاوية"), pId));
    check("رقم القطعة (321)", has(await q("321"), pId));
    check("حرف القطعة (أ)", has(await q("أ"), pId));
    check("الحي (دجلة)", has(await q("دجلة"), pId));
    check("المنطقة (الدورة)", has(await q("الدورة"), pId));
    check("المحافظة (بغداد)", has(await q("بغداد"), pId));
    check("رقم المقاطعة (م7)", has(await q("م7"), pId));
    check("اسم المقاطعة (الشمالية)", has(await q("الشمالية"), pId));
    check("المحلة (محلة)", has(await q("محلة"), pId));
    check("الدار (دار 12)", has(await q("دار 12"), pId));
    check("الزقاق (زقاق)", has(await q("زقاق"), pId));
    check("سعر/طريقة المتر (المتر)", has(await q("المتر"), pId));
    check("سعر الوحدة (300000)", has(await q("300000"), pId));
    check("المساحة (250)", has(await q("250"), pId));

    console.log("== التسعير بالدونم (يرجع Q) ==");
    check("الدونم يرجع Q", has(await q("الدونم"), qId));

    console.log("== الانتقائية ==");
    const onlyOwner = await q("الموسوي");
    check("اسم المالك يرجع P فقط (لا Q)", has(onlyOwner, pId) && !has(onlyOwner, qId), count(onlyOwner));

    console.log("== بحث + فلاتر معاً ==");
    const combo = await req("GET", `/properties?q=${encodeURIComponent("دجلة")}&governorate_id=${govId}&district_id=${distId}`);
    check("بحث 'دجلة' + محافظة بغداد + منطقة الدورة يرجع P", has(combo, pId), count(combo));
    const comboNeigh = await req("GET", `/properties?q=${encodeURIComponent("الموسوي")}&neighborhood_id=${neighId}`);
    check("بحث 'الموسوي' + حي دجلة يرجع P", has(comboNeigh, pId));
    const comboNone = await req("GET", `/properties?q=${encodeURIComponent("الموسوي")}&district_id=${distId2}`);
    check("بحث 'الموسوي' + منطقة الرصافة يرجع 0 (الفلتر يقيّد)", count(comboNone) === 0, count(comboNone));

    console.log("== multi-token (AND) ==");
    check("'الموسوي 321' يرجع P", has(await q("الموسوي 321"), pId));
    const crossNone = await q("الموسوي 999");
    check("'الموسوي 999' يرجع 0 (لا عقار يجمع الاثنين)", count(crossNone) === 0, count(crossNone));

    console.log("== pagination مع البحث ==");
    const all = await q("دجلة");
    check("بحث 'دجلة' يرجع 3 (P,R,S)", count(all) === 3, count(all));
    const page1 = await req("GET", `/properties?q=${encodeURIComponent("دجلة")}&limit=2`);
    const page2 = await req("GET", `/properties?q=${encodeURIComponent("دجلة")}&limit=2&offset=2`);
    check("limit=2 يرجع 2", count(page1) === 2, count(page1));
    check("limit=2&offset=2 يرجع 1", count(page2) === 1, count(page2));
    const union = new Set([...(page1.body || []), ...(page2.body || [])].map((p) => p.id));
    check("صفحتان تغطّيان 3 عناصر مميّزة", union.size === 3, union.size);

    console.log("== alias search= ==");
    check("alias search= يعمل مثل q=", has(await req("GET", `/properties?search=${encodeURIComponent("الموسوي")}`), pId));

    console.log("== لا نتائج ==");
    check("نص بلا تطابق يرجع 0", count(await q("xيzغريبq123456789")) === 0);
  } catch (e) {
    failed++; console.log("FATAL", e?.stack || e?.message || e); console.log(logs.join(""));
  } finally {
    child.kill(); await new Promise(r => setTimeout(r, 500)); await dropDb();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==== PHASE 5: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) console.log(logs.join(""));
  process.exit(failed > 0 ? 1 : 0);
}
main();
