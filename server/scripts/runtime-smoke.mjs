// Runtime smoke test for the First Run Wizard + core flows.
// Simulates a fresh client install (no .env, no DATABASE_URL) and drives the
// real HTTP endpoints against a throwaway database.
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
const TEST_DB = "dalaly_runtime_test";
const ADMIN = { host: "127.0.0.1", port: 5432, user: "postgres", password: "root" };

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? ` -> ${JSON.stringify(extra)}` : ""}`);
  }
}

async function adminQuery(sql, params) {
  const p = new pg.Pool({ ...ADMIN, database: "postgres", connectionTimeoutMillis: 4000 });
  try {
    return await p.query(sql, params);
  } finally {
    await p.end().catch(() => {});
  }
}

async function dropTestDb() {
  try {
    await adminQuery(`DROP DATABASE IF EXISTS "${TEST_DB}" WITH (FORCE)`);
  } catch {
    await adminQuery(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1`,
      [TEST_DB],
    ).catch(() => {});
    await adminQuery(`DROP DATABASE IF EXISTS "${TEST_DB}"`).catch(() => {});
  }
}

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return await res.json();
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("server did not become healthy in time");
}

async function main() {
  console.log("== Cleanup: drop throwaway DB if present ==");
  await dropTestDb();

  // Clean temp cwd so dotenv loads nothing -> simulates a fresh client (db not configured).
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dalaly-rt-"));
  const runDir = path.join(tmpRoot, "run");
  fs.mkdirSync(runDir, { recursive: true });

  console.log("== Spawn bundled server (first-run simulation) ==");
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: runDir,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      API_HOST: "127.0.0.1",
      API_PORT: String(PORT),
      DRIZZLE_MIGRATIONS_DIR: MIGRATIONS_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push(`[out] ${c}`));
  child.stderr.on("data", (c) => logs.push(`[err] ${c}`));

  try {
    const health = await waitForHealth();

    console.log("== Step 1: health / status on fresh install ==");
    check("health.api_running true", health.api_running === true, health);
    check("health.db_configured false (fresh)", health.db_configured === false, health);

    const status0 = await req("GET", "/setup/status");
    check("GET /setup/status 200", status0.status === 200, status0);
    check("status.db_configured false", status0.body?.db_configured === false, status0.body);

    console.log("== Step 2: test-postgres ==");
    const tBad = await req("POST", "/setup/test-postgres", {
      body: { host: "127.0.0.1", port: 5432, adminUsername: "postgres", adminPassword: "wrong-pass", databaseName: TEST_DB },
    });
    check("test-postgres wrong password -> 400", tBad.status === 400, tBad);

    const tGood = await req("POST", "/setup/test-postgres", {
      body: { host: "127.0.0.1", port: 5432, adminUsername: "postgres", adminPassword: "root", databaseName: TEST_DB },
    });
    check("test-postgres ok", tGood.status === 200 && tGood.body?.ok === true, tGood);
    check("test-postgres database_exists false", tGood.body?.database_exists === false, tGood.body);

    console.log("== Step 3: initialize (create db + migrate + seed + admin) ==");
    const init = await req("POST", "/setup/initialize", {
      body: {
        host: "127.0.0.1",
        port: 5432,
        adminUsername: "postgres",
        adminPassword: "root",
        databaseName: TEST_DB,
        firstAdminUsername: "admin",
        firstAdminPin: "4321",
      },
    });
    check("initialize ok", init.status === 200 && init.body?.ok === true, init);
    check("initialize database_created true", init.body?.database_created === true, init.body);
    check("initialize migrations_ok true", init.body?.migrations_ok === true, init.body);
    check("initialize admin.username admin", init.body?.admin?.username === "admin", init.body);
    check("initialize admin.pin returned once", init.body?.admin?.pin === "4321", init.body);

    console.log("== Step 4: status after initialize ==");
    const status1 = await req("GET", "/setup/status");
    check("status.db_configured true", status1.body?.db_configured === true, status1.body);
    check("status.db_connected true", status1.body?.db_connected === true, status1.body);
    check("status.migrations_ok true", status1.body?.migrations_ok === true, status1.body);
    check("status.users_table_exists true", status1.body?.users_table_exists === true, status1.body);
    check("status.admin_exists true", status1.body?.admin_exists === true, status1.body);

    console.log("== Step 5: login ==");
    const badLogin = await req("POST", "/auth/login", { body: { username: "admin", pin: "0000" } });
    check("login wrong pin -> 401", badLogin.status === 401, badLogin);

    const login = await req("POST", "/auth/login", { body: { username: "admin", pin: "4321" } });
    check("login ok 200", login.status === 200, login);
    const token = login.body?.token;
    check("login returns token", typeof token === "string" && token.length > 0);
    const perms = (login.body?.permissions ?? []).map((p) => p.key);
    check("admin has properties.create perm", perms.includes("properties.create"), perms);
    check("admin has users.create perm", perms.includes("users.create"), perms);

    console.log("== Step 6: auth guard ==");
    const noAuth = await req("GET", "/properties");
    check("GET /properties without token -> 401", noAuth.status === 401, noAuth);

    console.log("== Step 7: property CRUD ==");
    const createProp = await req("POST", "/properties", {
      token,
      body: {
        property_type: "أرض",
        legal_type: "طابو ملك صرف",
        area_value: 200,
        area_unit: "متر",
        pricing_method: "سعر على المتر",
        unit_price: 1000,
        owner_name: "علي",
        owner_phone: "07700000000",
        status: "available",
      },
    });
    check("create property 201", createProp.status === 201, createProp);
    const propId = createProp.body?.id;
    check("created property has code", typeof createProp.body?.code === "string", createProp.body);
    check("total_price computed = 200000", Number(createProp.body?.total_price) === 200000, createProp.body);

    const list = await req("GET", "/properties", { token });
    check("list properties returns 1", Array.isArray(list.body) && list.body.length === 1, list.body);

    const upd = await req("PUT", `/properties/${propId}`, {
      token,
      body: {
        property_type: "أرض",
        legal_type: "طابو ملك صرف",
        area_value: 200,
        area_unit: "متر",
        pricing_method: "سعر على المتر",
        unit_price: 1500,
        owner_name: "علي",
        owner_phone: "07700000000",
        status: "available",
      },
    });
    check("update property total=300000", Number(upd.body?.total_price) === 300000, upd.body);

    const arch = await req("PATCH", `/properties/${propId}/archive`, { token });
    check("archive -> status archived", arch.body?.status === "archived", arch.body);

    const rest = await req("PATCH", `/properties/${propId}/restore`, { token });
    check("restore -> status available", rest.body?.status === "available", rest.body);

    const del = await req("DELETE", `/properties/${propId}`, { token });
    check("delete property ok", del.status === 200 && del.body?.deleted === true, del);

    console.log("== Step 8: users + roles + permissions ==");
    const roles = await req("GET", "/roles", { token });
    check("roles includes Super Admin", Array.isArray(roles.body) && roles.body.some((r) => r.name === "Super Admin"), roles.body);

    const permissionsList = await req("GET", "/permissions", { token });
    check("permissions seeded (>=16)", Array.isArray(permissionsList.body) && permissionsList.body.length >= 16, permissionsList.body?.length);

    const newUser = await req("POST", "/users", {
      token,
      body: { username: "broker1", display_name: "موظف", pin: "5678", is_active: true, role_ids: [] },
    });
    check("create user 201", newUser.status === 201, newUser);

    const users = await req("GET", "/users", { token });
    check("users list has 2", Array.isArray(users.body) && users.body.length === 2, users.body?.length);

    console.log("== Step 9: idempotency of initialize ==");
    const init2 = await req("POST", "/setup/initialize", {
      body: {
        host: "127.0.0.1",
        port: 5432,
        adminUsername: "postgres",
        adminPassword: "root",
        databaseName: TEST_DB,
        firstAdminUsername: "admin",
        firstAdminPin: "4321",
      },
    });
    check("re-initialize ok", init2.body?.ok === true, init2.body);
    check("re-initialize database_created false", init2.body?.database_created === false, init2.body);
    check("re-initialize admin.pin null (no duplicate)", init2.body?.admin?.pin === null, init2.body);

    const usersAfter = await req("GET", "/users", { token });
    check("no duplicate users after re-init (still 2)", Array.isArray(usersAfter.body) && usersAfter.body.length === 2, usersAfter.body?.length);
    const rolesAfter = await req("GET", "/roles", { token });
    const superAdminCount = (rolesAfter.body ?? []).filter((r) => r.name === "Super Admin").length;
    check("no duplicate Super Admin role", superAdminCount === 1, superAdminCount);
  } catch (error) {
    failed++;
    console.log("FATAL", error?.message ?? error);
    console.log(logs.join(""));
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
    await dropTestDb();
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
  if (failed > 0) {
    console.log("\n--- server logs ---");
    console.log(logs.join(""));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
