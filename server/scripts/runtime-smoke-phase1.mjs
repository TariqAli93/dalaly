// Phase-1 runtime smoke test: locations, extra fields, audit, change-PIN, search.
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
const TEST_DB = "dalaly_phase1_test";
const ADMIN = { host: "127.0.0.1", port: 5432, user: "postgres", password: "root" };

let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log("  PASS " + n); } else { failed++; console.log("  FAIL " + n + (e ? " -> " + JSON.stringify(e) : "")); } };

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-p1-"));
  const runDir = path.join(tmp, "run"); fs.mkdirSync(runDir, { recursive: true });
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: runDir,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, API_HOST: "127.0.0.1", API_PORT: String(PORT), DRIZZLE_MIGRATIONS_DIR: MIGRATIONS_DIR },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = []; child.stdout.on("data", c => logs.push("" + c)); child.stderr.on("data", c => logs.push("" + c));

  try {
    await waitHealth();
    // init
    const init = await req("POST", "/setup/initialize", { body: { host: "127.0.0.1", port: 5432, adminUsername: "postgres", adminPassword: "root", databaseName: TEST_DB, firstAdminUsername: "admin", firstAdminPin: "4321" } });
    check("initialize ok", init.body?.ok === true, init.body);
    const login = await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } });
    const token = login.body?.token;
    check("login token", !!token);
    const perms = (login.body?.permissions ?? []).map(p => p.key);
    check("has locations.manage perm", perms.includes("locations.manage"), perms);
    check("has audit.read perm", perms.includes("audit.read"));
    check("has security.change_pin perm", perms.includes("security.change_pin"));
    check("has backups.create perm", perms.includes("backups.create"));

    console.log("== Locations ==");
    const gov = await req("POST", "/locations/governorates", { token, body: { name: "بغداد" } });
    check("create governorate 201", gov.status === 201, gov);
    const govId = gov.body?.id;
    const dist = await req("POST", "/locations/districts", { token, body: { governorate_id: govId, name: "الكرادة" } });
    check("create district 201", dist.status === 201, dist);
    const distId = dist.body?.id;
    const locs = await req("GET", "/locations", { token });
    check("locations list has gov+dist", (locs.body?.governorates?.length === 1) && (locs.body?.districts?.length === 1), locs.body);

    console.log("== Property with location from list + extra fields ==");
    const create = await req("POST", "/properties", { token, body: {
      property_type: "بيت", legal_type: "طابو ملك صرف", area_value: 300, area_unit: "متر",
      pricing_method: "سعر على المتر", unit_price: 500000, owner_name: "سعد", owner_phone: "07811111111",
      status: "negotiating", governorate_id: govId, district_id: distId,
      plot_number: "12/3", mahalla: "929", rooms_count: 3, bathrooms_count: 2, is_negotiable: true, frontage: "شمالي"
    }});
    check("create property 201", create.status === 201, create);
    const propId = create.body?.id;
    check("status negotiating saved", create.body?.status === "negotiating", create.body?.status);
    check("governorate_id stored", Number(create.body?.governorate_id) === Number(govId), create.body?.governorate_id);
    check("governorate denormalized = بغداد", create.body?.governorate === "بغداد", create.body?.governorate);
    check("district denormalized = الكرادة", create.body?.district === "الكرادة", create.body?.district);
    check("extra field rooms_count", Number(create.body?.rooms_count) === 3, create.body?.rooms_count);
    check("extra field is_negotiable", create.body?.is_negotiable === true, create.body?.is_negotiable);
    check("extra field mahalla", create.body?.mahalla === "929", create.body?.mahalla);

    console.log("== Property with manual district text ==");
    const create2 = await req("POST", "/properties", { token, body: {
      property_type: "أرض", legal_type: "طابو ملك صرف", area_value: 1000, area_unit: "متر",
      pricing_method: "سعر على المتر", unit_price: 100000, owner_name: "نور", owner_phone: "07822222222",
      governorate_id: govId, district_text: "حي الرسالة"
    }});
    check("create manual-district 201", create2.status === 201, create2);
    check("district_text stored", create2.body?.district_text === "حي الرسالة", create2.body?.district_text);
    check("district denormalized = manual text", create2.body?.district === "حي الرسالة", create2.body?.district);

    console.log("== Cannot delete governorate/district in use ==");
    const delGov = await req("DELETE", `/locations/governorates/${govId}`, { token });
    check("delete governorate blocked (400)", delGov.status === 400, delGov);
    const delDist = await req("DELETE", `/locations/districts/${distId}`, { token });
    check("delete district blocked (400)", delDist.status === 400, delDist);

    console.log("== Search ==");
    const searchMahalla = await req("GET", "/properties?q=929", { token });
    check("search by mahalla finds property", Array.isArray(searchMahalla.body) && searchMahalla.body.some(p => p.id === propId), searchMahalla.body?.length);
    const searchArea = await req("GET", "/properties?q=1000", { token });
    check("search by area value finds property", Array.isArray(searchArea.body) && searchArea.body.length >= 1, searchArea.body?.length);
    const searchGov = await req("GET", `/properties?governorate_id=${govId}`, { token });
    check("filter by governorate_id", Array.isArray(searchGov.body) && searchGov.body.length === 2, searchGov.body?.length);

    console.log("== Audit log ==");
    await req("PUT", `/properties/${propId}`, { token, body: {
      property_type: "بيت", legal_type: "طابو ملك صرف", area_value: 300, area_unit: "متر",
      pricing_method: "سعر على المتر", unit_price: 600000, owner_name: "سعد", owner_phone: "07811111111",
      status: "sold", governorate_id: govId, district_id: distId
    }});
    await req("PATCH", `/properties/${propId}/archive`, { token });
    const audit = await req("GET", `/properties/${propId}/audit`, { token });
    const actions = (audit.body ?? []).map(a => a.action);
    check("audit has created", actions.includes("created"), actions);
    check("audit has price_changed", actions.includes("price_changed"), actions);
    check("audit has status_changed", actions.includes("status_changed"), actions);
    check("audit has archived", actions.includes("archived"), actions);
    check("audit entry has user_name", (audit.body ?? []).some(a => a.user_name === "admin"), audit.body?.[0]);

    console.log("== Change PIN ==");
    const badChange = await req("POST", "/auth/change-pin", { token, body: { current_pin: "0000", new_pin: "9999" } });
    check("change-pin wrong current -> 400", badChange.status === 400, badChange);
    const change = await req("POST", "/auth/change-pin", { token, body: { current_pin: "4321", new_pin: "9999" } });
    check("change-pin ok", change.status === 200 && change.body?.ok === true, change);
    const reLoginOld = await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } });
    check("old pin rejected after change", reLoginOld.status === 401, reLoginOld.status);
    const reLoginNew = await req("POST", "/auth/login", { body: { username: "admin", pin: "9999" } });
    check("new pin works", reLoginNew.status === 200, reLoginNew.status);
  } catch (e) {
    failed++; console.log("FATAL", e?.message ?? e); console.log(logs.join(""));
  } finally {
    child.kill(); await new Promise(r => setTimeout(r, 500)); await dropDb();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==== PHASE 1: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) { console.log(logs.join("")); }
  process.exit(failed > 0 ? 1 : 0);
}
main();
