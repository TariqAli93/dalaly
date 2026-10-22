// Shared pieces of the performance harness: a seeded throwaway database, a
// packaged API process, request timing and Windows process metrics.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const serverRequire = createRequire(path.join(root, "server/package.json"));
const pg = serverRequire("pg");
serverRequire("dotenv").config({ path: path.join(root, ".env"), quiet: true });

const configured = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;
export const credentials = {
  host: configured?.hostname || process.env.DB_HOST || "127.0.0.1",
  port: Number(configured?.port || process.env.DB_PORT || 5432),
  user: configured
    ? decodeURIComponent(configured.username)
    : process.env.DB_USER || "postgres",
  password: configured
    ? decodeURIComponent(configured.password)
    : process.env.DB_PASSWORD || "",
};

export const ADMIN = { username: "perf_admin", pin: "482915" };
const PERF_DATABASE = /^dalaly_perf_\d+$/;

/** Paths inside an electron-builder `win-unpacked` folder. */
export function packagedApp(appDir) {
  const dir = path.resolve(appDir);
  const exe = fs
    .readdirSync(dir)
    .find((name) => name.endsWith(".exe") && !/^uninstall/i.test(name));
  if (!exe) throw new Error(`No application .exe in ${dir}`);
  return {
    dir,
    exe: path.join(dir, exe),
    serverEntry: path.join(dir, "resources/server/dist/index.js"),
    migrations: path.join(dir, "resources/server/drizzle"),
  };
}

export function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dalaly-perf-${label}-`));
}

export async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function portIsFree(port) {
  const server = createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

export function databaseUrl(name) {
  return `postgres://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port}/${name}`;
}

/** Creates an empty, uniquely named database; drop it with dropDatabase. */
export async function createDatabase() {
  const name = `dalaly_perf_${Date.now()}`;
  const admin = new pg.Pool({ ...credentials, database: "postgres" });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  return name;
}

export async function dropDatabase(name) {
  if (!PERF_DATABASE.test(name))
    throw new Error(`Refusing to drop ${name}: not a perf database`);
  const admin = new pg.Pool({ ...credentials, database: "postgres" });
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

export async function query(databaseName, sql, params) {
  if (!PERF_DATABASE.test(databaseName))
    throw new Error(`Refusing to write to ${databaseName}`);
  const pool = new pg.Pool({ ...credentials, database: databaseName });
  try {
    return await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

/**
 * Starts the packaged API the way Electron does (the app exe with
 * ELECTRON_RUN_AS_NODE), isolated from the repo's .env by its cwd.
 */
export function startApi(app, { databaseName, port, dataDir }) {
  const child = spawn(app.exe, [app.serverEntry], {
    cwd: dataDir,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...cleanEnv(),
      ELECTRON_RUN_AS_NODE: "1",
      DATABASE_URL: databaseUrl(databaseName),
      API_HOST: "127.0.0.1",
      API_PORT: String(port),
      DRIZZLE_MIGRATIONS_DIR: app.migrations,
      APP_DATA_DIR: dataDir,
      IMAGES_DIR: path.join(dataDir, "images", "properties"),
      BACKUP_DIR: path.join(dataDir, "backups"),
    },
  });
  // Drain the pipes like Electron's main process does.
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exited;
}

/** Environment without variables that would redirect the app or API. */
export function cleanEnv() {
  const drop = new Set([
    "ELECTRON_RUN_AS_NODE",
    "DATABASE_URL",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "API_PORT",
    "API_HOST",
    "VITE_DEV_SERVER_URL",
    "ENV_FILE",
  ]);
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => !drop.has(key) && typeof value === "string",
    ),
  );
}

export async function waitForHealth(port, accept, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      last = await response.json();
      if (accept(last)) return last;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error(`API health not accepted: ${JSON.stringify(last)}`);
}

export async function api(port, pathname, { token, method = "GET", body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api${pathname}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${pathname} → ${response.status}: ${text}`);
  return { body: text ? JSON.parse(text) : null, bytes: Buffer.byteLength(text) };
}

/**
 * Seeds a deterministic dataset (no random()) so runs are comparable.
 * Sizes default to a busy single office after a few years of use.
 */
export async function seedDataset(databaseName, sizes) {
  const { properties, rentals, people, requests, documents, auditLogs } = sizes;
  const lists = {
    types: ["أرض", "أرض سكنية", "أرض زراعية", "بيت", "مزرعة", "فيلا", "شقة", "بناية", "عقار تجاري", "مكتب", "مخزن", "أخرى"],
    legal: ["طابو ملك صرف", "طابو زراعي ملك صرف", "طابو زراعي مملوك للدولة سند 25", "عقد زراعي 117", "عقد زراعي 35"],
    pricing: ["سعر على المتر", "سعر على الدونم", "سعر إجمالي مباشر"],
    governorates: ["بغداد", "البصرة", "أربيل", "النجف", "كربلاء", "نينوى"],
    statuses: ["available", "available", "available", "available", "available", "available", "reserved", "negotiating", "sold", "archived"],
    rentalTypes: ["بيت", "شقة", "مكتب", "محل", "مخزن"],
    periods: ["monthly", "monthly", "semi_annual", "annual"],
    rentalStatuses: ["available", "available", "available", "reserved", "rented"],
  };
  const sql = `
    INSERT INTO people(code, full_name, phone_primary, address)
    SELECT 'PERF-C' || g, 'زبون ' || g, '0770' || lpad(g::text, 7, '0'),
           ($5::text[])[1 + g % 6] || ' شارع ' || (g % 90)
    FROM generate_series(1, $1::int) g;

    INSERT INTO properties(code, name, property_type, legal_type, area_value, area_unit,
      pricing_method, total_price, owner_name, owner_phone, governorate, address_details,
      status, owner_person_id, created_at, updated_at)
    SELECT 'PERF-P' || g, 'عقار ' || g, ($6::text[])[1 + g % 12], ($7::text[])[1 + g % 5],
           100 + (g * 37) % 900, CASE WHEN g % 10 = 0 THEN 'دونم' ELSE 'متر' END,
           ($8::text[])[1 + g % 3], 50000000 + (g::bigint * 7919) % 900000000,
           'مالك ' || (g % $1::int), '0780' || lpad((g % $1::int)::text, 7, '0'),
           ($5::text[])[1 + g % 6], 'شارع ' || (g % 200) || ' زقاق ' || (g % 40),
           ($9::text[])[1 + g % 10], (SELECT min(id) FROM people) + g % $1::int,
           now() - make_interval(hours => g), now() - make_interval(hours => g / 2)
    FROM generate_series(1, $2::int) g;

    INSERT INTO rentals(code, name, property_type, rent_price, rent_period, area_value, area_unit,
      owner_name, owner_phone, governorate, address_details, status, owner_person_id, created_at)
    SELECT 'PERF-R' || g, 'إيجار ' || g, ($10::text[])[1 + g % 5], 250000 + (g * 4513) % 3000000,
           ($11::text[])[1 + g % 4], 80 + (g * 13) % 400, 'متر',
           'مؤجر ' || (g % $1::int), '0790' || lpad((g % $1::int)::text, 7, '0'),
           ($5::text[])[1 + g % 6], 'شارع ' || (g % 150), ($12::text[])[1 + g % 5],
           (SELECT min(id) FROM people) + g % $1::int, now() - make_interval(hours => g)
    FROM generate_series(1, $3::int) g;

    INSERT INTO rental_requests(code, person_id, property_type)
    SELECT 'PERF-RQ' || g, (SELECT min(id) FROM people) + g % $1::int, ($10::text[])[1 + g % 5]
    FROM generate_series(1, $4::int) g;

    INSERT INTO purchase_requests(code, person_id, property_type)
    SELECT 'PERF-PQ' || g, (SELECT min(id) FROM people) + g % $1::int, ($6::text[])[1 + g % 12]
    FROM generate_series(1, $4::int) g;

    WITH types AS (SELECT array_agg(id ORDER BY id) AS ids FROM document_types)
    INSERT INTO identity_documents(code, person_id, document_type_id, document_name, document_number,
      file_path, file_type, status, expires_at, uploaded_at)
    SELECT 'PERF-D' || g, (SELECT min(id) FROM people) + g % $1::int, types.ids[1 + g % nullif(cardinality(types.ids), 0)],
           'مستمسك ' || g, 'PERF-N' || g, 'people/perf/' || g || '.pdf', 'application/pdf',
           CASE WHEN g % 10 = 0 THEN 'archived' ELSE 'active' END,
           CASE g % 4 WHEN 0 THEN now() - make_interval(days => g % 365) WHEN 1 THEN NULL
                      ELSE now() + make_interval(days => g % 700) END,
           now() - make_interval(mins => g)
    FROM generate_series(1, $14::int) g, types;

    INSERT INTO audit_logs(entity_type, entity_id, action, user_id, created_at)
    SELECT 'property', (SELECT min(id) FROM properties) + g % $2::int,
           CASE WHEN g % 4 = 0 THEN 'create' ELSE 'update' END,
           (SELECT min(id) FROM users), now() - make_interval(mins => g)
    FROM generate_series(1, $13::int) g;

    ANALYZE;`;
  // pg cannot run multi-statement text with parameters; run statement by statement.
  const statements = sql
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  const params = [
    people, properties, rentals, requests,
    lists.governorates, lists.types, lists.legal, lists.pricing, lists.statuses,
    lists.rentalTypes, lists.periods, lists.rentalStatuses, auditLogs, documents,
  ];
  for (const statement of statements) {
    const used = [...statement.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    if (!used.length) {
      await query(databaseName, statement);
      continue;
    }
    // Renumber to the parameters this statement actually uses.
    const order = [...new Set(used)].sort((a, b) => a - b);
    const text = statement.replace(/\$(\d+)/g, (_, n) => `$${order.indexOf(Number(n)) + 1}`);
    await query(databaseName, text, order.map((n) => params[n - 1]));
  }
}

/** Runs `count` sequential requests after `warmup` and returns timing stats. */
export async function timeRequests(fn, { warmup = 5, count = 40 } = {}) {
  for (let i = 0; i < warmup; i += 1) await fn();
  const samples = [];
  let bytes = 0;
  for (let i = 0; i < count; i += 1) {
    const started = performance.now();
    const result = await fn();
    samples.push(performance.now() - started);
    bytes = result?.bytes ?? bytes;
  }
  return { ...stats(samples), bytes };
}

export function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  const round = (value) => Math.round(value * 10) / 10;
  return {
    n: sorted.length,
    min: round(sorted[0]),
    median: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted[sorted.length - 1]),
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Working set, private bytes and cumulative CPU time for processes, via
 * PowerShell (Windows only). Keyed by pid.
 */
export function windowsProcessInfo(pids) {
  if (!pids.length) return {};
  const script = `Get-Process -Id ${pids.join(",")} -ErrorAction SilentlyContinue | ForEach-Object { "{0} {1} {2} {3}" -f $_.Id, $_.WorkingSet64, $_.PrivateMemorySize64, $_.TotalProcessorTime.TotalMilliseconds }`;
  const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  const info = {};
  for (const line of output.trim().split(/\r?\n/).filter(Boolean)) {
    const [pid, workingSet, privateBytes, cpuMs] = line.trim().split(/\s+/).map(Number);
    info[pid] = { workingSetMB: workingSet / 2 ** 20, privateMB: privateBytes / 2 ** 20, cpuMs };
  }
  return info;
}

/** Direct children of `parentPid` whose command line matches `pattern`. */
export function childPids(parentPid, pattern) {
  const script = `Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid}" | ForEach-Object { "{0}\`t{1}" -f $_.ProcessId, $_.CommandLine }`;
  const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  return output
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .filter(([, command]) => pattern.test(command ?? ""))
    .map(([pid]) => Number(pid));
}
