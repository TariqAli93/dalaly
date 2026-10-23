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
export function startApi(app, { databaseName, port, dataDir, env = {} }) {
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
      ...env,
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
  const response = await fetchOnce(`http://127.0.0.1:${port}/api${pathname}`, {
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
 * fetch, sent again once if the API reset the connection: after a pause
 * longer than its 72 s keep-alive (a long seed), the pooled socket may
 * already be closed when it is reused.
 */
async function fetchOnce(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error?.cause?.code !== "ECONNRESET") throw error;
    return fetch(url, init);
  }
}

/** GET of a binary response, such as an image file; returns its size. */
export async function download(port, pathname, { token } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api${pathname}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`GET ${pathname} → ${response.status}`);
  return { bytes: (await response.arrayBuffer()).byteLength };
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

/**
 * Gives every property and rental `perListing` photos (the first one
 * primary): image rows in the database and files under `imagesDir`, hard
 * links to a few synthetic phone-sized JPEGs so thousands of them take no
 * disk space. Returns the number of images and source photos.
 */
export async function seedPhotos(databaseName, imagesDir, perListing) {
  await query(
    databaseName,
    `INSERT INTO property_images(property_id, file_path, original_name, is_primary, sort_order)
     SELECT p.id, p.id || '/perf-' || k || '.jpg', 'IMG_' || p.id || '_' || k || '.jpg', k = 0, k + 1
     FROM properties p CROSS JOIN generate_series(0, $1::int - 1) k`,
    [perListing],
  );
  await query(
    databaseName,
    `INSERT INTO rental_images(rental_id, file_path, original_name, is_primary, sort_order)
     SELECT r.id, 'rentals/' || r.id || '/perf-' || k || '.jpg', 'IMG_R' || r.id || '_' || k || '.jpg', k = 0, k + 1
     FROM rentals r CROSS JOIN generate_series(0, $1::int - 1) k`,
    [perListing],
  );
  const { rows } = await query(
    databaseName,
    "SELECT file_path FROM property_images UNION ALL SELECT file_path FROM rental_images",
  );
  // NTFS allows 1,024 links to one file.
  const sources = await ensurePhotos(Math.max(24, Math.ceil(rows.length / 900)));
  const folders = new Set();
  rows.forEach((row, index) => {
    const target = path.join(imagesDir, row.file_path);
    const folder = path.dirname(target);
    if (!folders.has(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      folders.add(folder);
    }
    fs.linkSync(sources[index % sources.length], target);
  });
  const sizes = sources.map((file) => fs.statSync(file).size);
  return {
    perListing,
    images: rows.length,
    sourcePhotos: sources.length,
    averagePhotoMB: Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length / 2 ** 20) * 100) / 100,
  };
}

/**
 * Synthetic 12-megapixel JPEGs of 3–4.5 MB, like phone photos: drawn in
 * Chromium from a fixed seed and kept in the temp folder (the volume the
 * data folders are on, so seeding can hard-link them) for later runs.
 */
async function ensurePhotos(count) {
  const dir = path.join(os.tmpdir(), "dalaly-perf-photos-v1");
  fs.mkdirSync(dir, { recursive: true });
  const files = Array.from({ length: count }, (_, index) =>
    path.join(dir, `photo-${String(index + 1).padStart(3, "0")}.jpg`),
  );
  const missing = files.filter((file) => !fs.existsSync(file));
  if (!missing.length) return files;
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const file of missing) {
      const base64 = await page.evaluate(drawPhoto, files.indexOf(file) + 1);
      fs.writeFileSync(`${file}.tmp`, Buffer.from(base64, "base64"));
      fs.renameSync(`${file}.tmp`, file);
    }
  } finally {
    await browser.close();
  }
  return files;
}

/** Runs in the page: sky, ground, buildings with windows and sensor-like noise. */
async function drawPhoto(seed) {
  const width = 4000;
  const height = 3000;
  let state = seed * 7919;
  const rand = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.55);
  sky.addColorStop(0, `hsl(${200 + rand() * 20}, 55%, ${55 + rand() * 15}%)`);
  sky.addColorStop(1, `hsl(${190 + rand() * 20}, 35%, 88%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = `hsl(${25 + rand() * 30}, 30%, ${35 + rand() * 20}%)`;
  ctx.fillRect(0, height * 0.55, width, height * 0.45);
  for (let building = 0; building < 9; building += 1) {
    const w = 300 + rand() * 900;
    const h = 400 + rand() * 1200;
    const x = rand() * (width - w);
    const y = height * 0.6 - h;
    ctx.fillStyle = `hsl(${rand() * 360}, ${20 + rand() * 30}%, ${40 + rand() * 40}%)`;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = `hsl(${180 + rand() * 40}, 30%, ${20 + rand() * 30}%)`;
    for (let wy = y + 60; wy < y + h - 80; wy += 140)
      for (let wx = x + 40; wx < x + w - 80; wx += 120) ctx.fillRect(wx, wy, 60, 80);
  }
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rand() - 0.5) * 16;
    data[i] += noise;
    data[i + 1] += noise + (rand() - 0.5) * 4;
    data[i + 2] += noise;
  }
  ctx.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.93 + rand() * 0.02 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
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

/** Two frames: whatever the page rendered is on screen. */
export async function painted(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/**
 * Every row of the list grid that is on screen shows a loaded, decoded photo
 * in its first cell (rows below the fold load theirs lazily, if at all).
 * Returns how many rows that was.
 */
export async function rowImagesPainted(page) {
  await page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll(".dal-grid tbody tr")].filter(
        (row) => row.getBoundingClientRect().top < innerHeight,
      );
      return (
        rows.length > 0 &&
        rows.every((row) => {
          const image = row.querySelector("td:first-child img");
          return image?.complete && image.naturalWidth > 0;
        })
      );
    },
    undefined,
    { timeout: 60_000, polling: "raf" },
  );
  const rows = await page.evaluate(async () => {
    const images = [...document.querySelectorAll(".dal-grid tbody tr td:first-child img")].filter(
      (image) => image.complete && image.naturalWidth > 0,
    );
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
    return images.length;
  });
  await painted(page);
  return rows;
}

/**
 * Counts a step's API requests, its image file requests (an original or a
 * thumbnail), its writes (a thumbnail saved) and the KB of the response
 * bodies. The returned function waits until no API request has been in
 * flight for `quietMs` (at most 5 s longer), stops counting and returns
 * { requests, imageRequests, writes, kb }.
 */
export function trackApi(page, { quietMs = 150 } = {}) {
  const sizes = [];
  let requests = 0;
  let imageRequests = 0;
  let writes = 0;
  let inFlight = 0;
  let lastChange = performance.now();
  const isApi = (request) => request.url().includes("/api/");
  const onRequest = (request) => {
    if (!isApi(request)) return;
    requests += 1;
    if (/\/images\/\d+\/(file|thumbnail)(\?|$)/.test(request.url()) && request.method() === "GET") imageRequests += 1;
    if (request.method() !== "GET") writes += 1;
    inFlight += 1;
    lastChange = performance.now();
  };
  const onDone = (request) => {
    if (!isApi(request)) return;
    inFlight -= 1;
    lastChange = performance.now();
    sizes.push(request.sizes().then((size) => size.responseBodySize, () => 0));
  };
  const onFailed = (request) => {
    if (!isApi(request)) return;
    inFlight -= 1;
    lastChange = performance.now();
  };
  page.on("request", onRequest);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onFailed);
  return async () => {
    const deadline = performance.now() + quietMs + 5_000;
    while ((inFlight > 0 || performance.now() - lastChange < quietMs) && performance.now() < deadline) await sleep(25);
    page.off("request", onRequest);
    page.off("requestfinished", onDone);
    page.off("requestfailed", onFailed);
    const bytes = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);
    return { requests, imageRequests, writes, kb: Math.round(bytes / 1024) };
  };
}

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

/**
 * Samples one process every `intervalMs` from a single long-running
 * PowerShell (Windows only): working set, private bytes, CPU time and the
 * OS peak counters, which cover the whole life of the process. `ready`
 * resolves on the third sample, as PowerShell takes up to seconds to reach
 * a steady pace; `stop()` returns every sample.
 */
export function sampleProcess(pid, intervalMs = 250) {
  const script = `$p = Get-Process -Id ${pid}; while (-not $p.HasExited) { $p.Refresh(); "{0} {1} {2} {3} {4}" -f $p.WorkingSet64, $p.PrivateMemorySize64, $p.PeakWorkingSet64, $p.PeakPagedMemorySize64, [int64]$p.TotalProcessorTime.TotalMilliseconds; Start-Sleep -Milliseconds ${intervalMs} }`;
  const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const samples = [];
  let pending = "";
  let resolveReady;
  const ready = new Promise((resolve) => (resolveReady = resolve));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines.filter((text) => text.trim())) {
      const [workingSet, privateBytes, peakWorkingSet, peakPrivate, cpuMs] = line.trim().split(/\s+/).map(Number);
      samples.push({
        at: performance.now(),
        workingSetMB: workingSet / 2 ** 20,
        privateMB: privateBytes / 2 ** 20,
        peakWorkingSetMB: peakWorkingSet / 2 ** 20,
        peakPrivateMB: peakPrivate / 2 ** 20,
        cpuMs,
      });
      if (samples.length >= 3) resolveReady();
    }
  });
  child.once("exit", () => resolveReady());
  return {
    ready,
    samples,
    async stop() {
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill();
        await exited;
      }
      return samples;
    },
  };
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
