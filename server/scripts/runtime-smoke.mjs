// Runtime smoke test for the First Run Wizard + core flows.
// Simulates a fresh client install (no .env, no DATABASE_URL) and drives the
// real HTTP endpoints against a throwaway database.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN, adminConnection, dropTestDatabase, testDatabaseName } from "./runtime-smoke-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, "..", "dist", "index.js");
const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");
const PORT = 45999;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB = testDatabaseName("runtime");

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
  console.log(`== Throwaway database: ${TEST_DB} ==`);

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
      body: { ...adminConnection(TEST_DB), adminPassword: `${ADMIN.password}-wrong` },
    });
    check("test-postgres wrong password -> 400", tBad.status === 400, tBad);

    const tGood = await req("POST", "/setup/test-postgres", {
      body: adminConnection(TEST_DB),
    });
    check("test-postgres ok", tGood.status === 200 && tGood.body?.ok === true, tGood);
    check("test-postgres database_exists false", tGood.body?.database_exists === false, tGood.body);

    console.log("== Step 3: initialize (create db + migrate + seed + admin) ==");
    const init = await req("POST", "/setup/initialize", {
      body: {
        ...adminConnection(TEST_DB),
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

    console.log("== Step 8: CRM modules + rental matching ==");
    const person = await req("POST", "/people", {
      token,
      body: { full_name: "CRM Test Customer", phone_primary: "07700000001", person_type: "individual" },
    });
    check("create person 201", person.status === 201 && typeof person.body?.id === "number", person);
    const personId = person.body?.id;

    const rental = await req("POST", "/rentals", {
      token,
      body: {
        property_type: "apartment",
        rent_price: 750,
        rent_period: "monthly",
        area_value: 120,
        area_unit: "متر",
        owner_person_id: personId,
        owner_name: "CRM Test Customer",
        owner_phone: "07700000001",
        status: "available",
      },
    });
    check("create rental 201", rental.status === 201 && typeof rental.body?.id === "number", rental);
    const rentalId = rental.body?.id;

    const rentalRequest = await req("POST", "/rental-requests", {
      token,
      body: {
        person_id: personId,
        property_type: "apartment",
        rent_period: "monthly",
        budget_max: 1000,
        area_min: 80,
        rooms_count: 2,
        status: "open",
      },
    });
    check("create rental request 201", rentalRequest.status === 201 && typeof rentalRequest.body?.id === "number", rentalRequest);
    const rentalRequestId = rentalRequest.body?.id;
    const rentalMatches = await req("GET", `/matching/rental-requests/${rentalRequestId}/offers`, { token });
    check("rental matching finds offer", rentalMatches.status === 200 && rentalMatches.body?.count >= 1, rentalMatches);

    const sale = await req("POST", "/properties", {
      token,
      body: {
        property_type: "أرض",
        legal_type: "طابو ملك صرف",
        area_value: 200,
        area_unit: "متر",
        pricing_method: "سعر إجمالي مباشر",
        total_price: 100000,
        owner_name: "CRM Test Customer",
        owner_phone: "07700000001",
        status: "available",
      },
    });
    check("create sale offer 201", sale.status === 201 && typeof sale.body?.id === "number", sale);
    const purchaseRequest = await req("POST", "/purchase-requests", {
      token,
      body: { person_id: personId, property_type: "أرض", budget_max: 150000, status: "open" },
    });
    check("create purchase request 201", purchaseRequest.status === 201 && typeof purchaseRequest.body?.id === "number", purchaseRequest);
    const purchaseMatches = await req("GET", `/matching/purchase-requests/${purchaseRequest.body?.id}/offers`, { token });
    check("purchase matching finds offer", purchaseMatches.status === 200 && purchaseMatches.body?.count >= 1, purchaseMatches);

    const documentTypes = await req("GET", "/documents/types", { token });
    check("document types available", documentTypes.status === 200 && documentTypes.body?.length >= 1, documentTypes);
    const nationalIdType = documentTypes.body?.find((item) => item.key === "national_id")?.id;
    const document = await req("POST", "/documents", {
      token,
      body: {
        person_id: personId,
        document_type_id: nationalIdType,
        document_name: "CRM test document",
        original_name: "test.txt",
        file_type: "text/plain",
        data: "data:text/plain;base64,SGVsbG8=",
      },
    });
    check("upload person document 201", document.status === 201 && typeof document.body?.id === "number", document);
    const documentFile = await req("GET", `/documents/${document.body?.id}/file`, { token });
    check("read person document file", documentFile.status === 200 && documentFile.body === "Hello", documentFile);
    const companySettings = await req("GET", "/office", { token });
    check("office settings available", companySettings.status === 200 && companySettings.body?.id === 1, companySettings);
    console.log("== Step 9: users + roles + permissions ==");
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

    // An initialized installation must never be re-initialized anonymously.
    console.log("== Step 10: initialize is refused once the system is set up ==");
    const init2 = await req("POST", "/setup/initialize", {
      body: {
        ...adminConnection(TEST_DB),
        firstAdminUsername: "admin",
        firstAdminPin: "4321",
      },
    });
    check("re-initialize refused 409", init2.status === 409 && init2.body?.ok === false, init2);

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
    await dropTestDatabase(TEST_DB);
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
