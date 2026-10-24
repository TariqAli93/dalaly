// How a backup and a restore affect the running API, on a packaged build.
//
//   node scripts/perf/backup.mjs --app <win-unpacked> [--label main]
//        [--properties 5000] [--photos-mb 2000] [--media-dir perf-results/media]
//        [--cpus 2] [--skip-restore]
//
// Seeds a throwaway dalaly_perf_<timestamp> database like measure.mjs, gives
// every property a photo (deterministic incompressible bytes, sized so the
// photos add up to --photos-mb) and every seeded identity document a file,
// reads them all once so every build starts with them in the OS file cache,
// then, each on a freshly started API so the OS peak counters cover only that
// operation:
//   1. POST /backup/create, the code path of the manual and scheduled backup;
//   2. POST /backup/restore with that archive (scope full), which first writes
//      the pre-restore copy.
// During each, GET /auth/me runs every 50 ms (the next request 50 ms after
// the previous one started, or at once if it took longer), and the API's
// memory and CPU are sampled every 250 ms.
//
// --media-dir keeps the generated files between runs (they take a while to
// write); without it everything lives in a temporary folder. --cpus limits the
// API to that many logical processors, threads included. Results go to
// perf-results/backup-<label>.json.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  ADMIN,
  api,
  createDatabase,
  dropDatabase,
  freePort,
  makeTempDir,
  packagedApp,
  query,
  root,
  sampleProcess,
  seedDataset,
  sleep,
  startApi,
  stats,
  stopProcess,
  waitForHealth,
} from "./lib.mjs";

const { values: options } = parseArgs({
  args: process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--")),
  options: {
    app: { type: "string" },
    label: { type: "string" },
    properties: { type: "string", default: "5000" },
    "photos-mb": { type: "string", default: "2000" },
    "media-dir": { type: "string" },
    cpus: { type: "string" },
    "skip-restore": { type: "boolean", default: false },
  },
});
if (!options.app) throw new Error("--app <win-unpacked folder> is required");

const app = packagedApp(options.app);
const label = options.label ?? path.basename(path.dirname(app.dir));
const fileLabel = label.replace(/[^A-Za-z0-9._-]+/g, "-");
const propertyCount = Number(options.properties);
const sizes = {
  properties: propertyCount,
  rentals: Math.round(propertyCount * 0.4),
  people: Math.round(propertyCount * 0.3),
  requests: Math.round(propertyCount * 0.1),
  documents: Math.round(propertyCount * 0.6),
  auditLogs: propertyCount * 4,
};
const media = {
  photos: propertyCount,
  photoBytes: Math.round(Number(options["photos-mb"]) * 1e6),
  documentBytes: 30_000,
};
const cpus = options.cpus ? Number(options.cpus) : null;
const LATENCY_EVERY_MS = 50;
const NOISE_KEY = Buffer.alloc(16, 7);

const results = {
  label,
  app: app.dir,
  measuredAt: new Date().toISOString(),
  machine: { platform: process.platform, node: process.version, cpus },
  dataset: sizes,
};

const dataDir = options["media-dir"] ? path.resolve(options["media-dir"]) : makeTempDir(`${fileLabel}-backup`);
const backupsDir = path.join(dataDir, "backups");
let databaseName;
let apiChild;
try {
  fs.rmSync(backupsDir, { recursive: true, force: true });
  // spawn reports a missing cwd as a missing executable.
  fs.mkdirSync(dataDir, { recursive: true });
  databaseName = await createDatabase();
  const port = await freePort();
  apiChild = startApi(app, { databaseName, port, dataDir });
  await waitForHealth(
    port,
    (health) => health.startup_state === "SETUP_REQUIRED" && health.startup_reason === "ADMIN_REQUIRED",
  );
  await api(port, "/auth/setup-admin", { method: "POST", body: ADMIN });
  await seedDataset(databaseName, sizes);
  results.media = await prepareMedia(databaseName, dataDir);
  console.log(`Seeded ${databaseName}`, sizes, results.media);
  // Every build starts with the files in the OS cache; files read from a cold
  // disk add their read time to the backup, more on a slow disk.
  results.media.warmCacheSeconds = warmFileCache([
    path.join(dataDir, "images"),
    path.join(dataDir, "documents"),
  ]);
  await stopProcess(apiChild);

  apiChild = await startReadyApi(port);
  results.backup = await measure(port, apiChild, "backup", (token) =>
    post(port, "/backup/create", token, {}),
  );
  printOperation("Backup", results.backup);
  await stopProcess(apiChild);
  apiChild = undefined;

  const archive = results.backup.response?.file_path;
  if (!options["skip-restore"] && archive) {
    apiChild = await startReadyApi(port);
    results.restore = await measure(port, apiChild, "restore", (token) =>
      post(port, "/backup/restore", token, { file_path: archive, scope: "full" }),
    );
    if (results.restore.status === 200) {
      const { rows } = await query(
        databaseName,
        "SELECT duration_ms FROM backup_jobs WHERE type = 'pre_restore' AND status = 'success' ORDER BY id DESC LIMIT 1",
      );
      results.restore.preRestoreBackupMs = rows[0]?.duration_ms ?? null;
    }
    printOperation("Restore", results.restore);
  }
} finally {
  await stopProcess(apiChild);
  if (databaseName) await dropDatabase(databaseName);
  if (options["media-dir"]) fs.rmSync(backupsDir, { recursive: true, force: true });
  else fs.rmSync(dataDir, { recursive: true, force: true });
}

const outputDir = path.join(root, "perf-results");
fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `backup-${fileLabel}.json`);
fs.writeFileSync(outputFile, `${JSON.stringify(results, null, 2)}\n`);
console.log(`\nWrote ${path.relative(root, outputFile)}`);

async function startReadyApi(port) {
  const child = startApi(app, { databaseName, port, dataDir });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr = (stderr + chunk).slice(-4000)));
  child.stderrTail = () => stderr;
  if (cpus) {
    const mask = 2 ** cpus - 1;
    execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${child.pid}).ProcessorAffinity = ${mask}`]);
  }
  await waitForHealth(port, (health) => health.startup_state === "READY");
  return child;
}

/**
 * Logs in, records 3 s of idle latency, then runs `operation` while
 * sampling latency and the API process.
 */
async function measure(port, child, name, operation) {
  const { body: session } = await api(port, "/auth/login", { method: "POST", body: ADMIN });
  const idleLoop = latencyLoop(port, session.token);
  await sleep(3000);
  const idle = await idleLoop.stop();

  const sampler = sampleProcess(child.pid);
  await sampler.ready;
  const loop = latencyLoop(port, session.token);
  const started = performance.now();
  let response;
  try {
    response = await operation(session.token);
  } catch (error) {
    response = { status: "error", body: { message: error.message } };
  }
  const seconds = (performance.now() - started) / 1000;
  const during = await loop.stop();
  // One more sample after the response, so the peak covers the whole operation.
  await sleep(600);
  const samples = await sampler.stop();
  const first = samples[0];
  const last = samples.at(-1);
  const exitCode = child.exitCode;
  const result = {
    status: response.status,
    seconds: round(seconds),
    response: response.body,
    apiExitCode: exitCode,
    apiStderrTail: response.status === 200 ? undefined : child.stderrTail(),
    archiveEntries: response.body?.file_path ? zipEntryCount(response.body.file_path) : undefined,
    latencyIdle: idle,
    latencyDuring: during,
    memory: {
      workingSetMBBefore: round(first?.workingSetMB),
      privateMBBefore: round(first?.privateMB),
      peakWorkingSetMB: round(Math.max(...samples.map((s) => s.peakWorkingSetMB))),
      peakPrivateMB: round(Math.max(...samples.map((s) => s.peakPrivateMB))),
      workingSetMBAfter: round(last?.workingSetMB),
      cpuSeconds: round(((last?.cpuMs ?? 0) - (first?.cpuMs ?? 0)) / 1000),
      timeline: samples.map((s) => ({
        s: round((s.at - started) / 1000),
        ws: Math.round(s.workingSetMB),
        priv: Math.round(s.privateMB),
      })),
    },
  };
  console.log(`  ${name}: ${result.status} in ${result.seconds} s`);
  return result;
}

/** GET /auth/me every LATENCY_EVERY_MS until stopped. */
function latencyLoop(port, token) {
  const samples = [];
  const statuses = {};
  let stopped = false;
  const running = (async () => {
    while (!stopped) {
      const started = performance.now();
      let status;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
          headers: { authorization: `Bearer ${token}` },
        });
        await response.arrayBuffer();
        status = response.status;
      } catch {
        status = "error";
      }
      const ms = performance.now() - started;
      samples.push(ms);
      statuses[status] = (statuses[status] ?? 0) + 1;
      if (ms < LATENCY_EVERY_MS) await sleep(LATENCY_EVERY_MS - ms);
    }
  })();
  return {
    async stop() {
      stopped = true;
      await running;
      const sorted = [...samples].sort((a, b) => a - b);
      return {
        ...stats(samples),
        p99: round(sorted[Math.min(sorted.length - 1, Math.ceil(0.99 * sorted.length) - 1)]),
        over100ms: samples.filter((ms) => ms > 100).length,
        over1s: samples.filter((ms) => ms > 1000).length,
        secondsOver100ms: round(samples.filter((ms) => ms > 100).reduce((sum, ms) => sum + ms, 0) / 1000),
        statuses,
      };
    },
  };
}

/** A POST without client timeouts: a backup of a large folder takes minutes. */
function post(port, pathname, token, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        path: `/api${pathname}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          authorization: `Bearer ${token}`,
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          let parsed = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            // keep the raw text
          }
          resolve({ status: response.statusCode, body: parsed });
        });
      },
    );
    request.on("error", reject);
    request.end(payload);
  });
}

/**
 * One photo per property under images/properties/<id>/ (a JPEG marker
 * around AES-CTR keystream: incompressible like real photos, identical every
 * run) with its property_images row, and a file for every seeded identity
 * document. Files already on disk with the right size are kept.
 */
async function prepareMedia(databaseName, dataDir) {
  const { rows: properties } = await query(databaseName, "SELECT id FROM properties ORDER BY id");
  const average = media.photoBytes / media.photos;
  const rows = { propertyId: [], filePath: [], name: [] };
  const files = [];
  for (let index = 0; index < media.photos; index += 1) {
    const propertyId = Number(properties[index % properties.length].id);
    const name = `${crypto.createHash("sha1").update(`photo-${index}`).digest("hex").slice(0, 32)}.jpg`;
    const size = Math.round(average * 0.25 + ((index * 7919) % Math.round(average * 1.5)));
    const relative = `${propertyId}/${name}`;
    files.push({ absolute: path.join(dataDir, "images", "properties", relative), size, seed: index });
    rows.propertyId.push(propertyId);
    rows.filePath.push(relative);
    rows.name.push(`IMG_${index}.jpg`);
  }
  await query(
    databaseName,
    `INSERT INTO property_images(property_id, file_path, original_name, is_primary)
     SELECT p, f, n, true FROM unnest($1::bigint[], $2::text[], $3::text[]) AS t(p, f, n)`,
    [rows.propertyId, rows.filePath, rows.name],
  );
  const { rows: documents } = await query(databaseName, "SELECT id, file_path FROM identity_documents ORDER BY id");
  for (const document of documents)
    files.push({
      absolute: path.join(dataDir, "documents", document.file_path),
      size: media.documentBytes,
      seed: 1_000_000 + Number(document.id),
    });

  let written = 0;
  for (const file of files) {
    if (fs.statSync(file.absolute, { throwIfNoEntry: false })?.size === file.size) continue;
    fs.mkdirSync(path.dirname(file.absolute), { recursive: true });
    fs.writeFileSync(file.absolute, noise(file.seed, file.size));
    written += 1;
  }
  const photoTotal = files.slice(0, media.photos).reduce((sum, file) => sum + file.size, 0);
  const documentTotal = files.slice(media.photos).reduce((sum, file) => sum + file.size, 0);
  return {
    photos: media.photos,
    photoMB: Math.round(photoTotal / 1e6),
    documents: documents.length,
    documentMB: Math.round(documentTotal / 1e6),
    filesWritten: written,
  };
}

function warmFileCache(dirs) {
  const started = performance.now();
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else fs.readFileSync(absolute);
    }
  };
  for (const dir of dirs) if (fs.existsSync(dir)) visit(dir);
  return round((performance.now() - started) / 1000);
}

function noise(seed, size) {
  const iv = Buffer.alloc(16);
  iv.writeUInt32BE(seed, 12);
  const body = crypto.createCipheriv("aes-128-ctr", NOISE_KEY, iv).update(Buffer.alloc(size));
  // JPEG start and end markers; the content between is never decoded.
  body.set([0xff, 0xd8, 0xff, 0xe0], 0);
  body.set([0xff, 0xd9], size - 2);
  return body;
}

/** Entries in a zip's central directory, from its end record. */
function zipEntryCount(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, 66_000);
    const tail = Buffer.alloc(length);
    fs.readSync(fd, tail, 0, length, size - length);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = tail.readUInt16LE(end + 10);
    if (count !== 0xffff) return count;
    const locator = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    const record = Number(tail.readBigUInt64LE(locator + 8));
    const zip64 = Buffer.alloc(56);
    fs.readSync(fd, zip64, 0, 56, record);
    return Number(zip64.readBigUInt64LE(32));
  } finally {
    fs.closeSync(fd);
  }
}

function printOperation(name, result) {
  const { latencyIdle: idle, latencyDuring: during, memory } = result;
  console.log(`\n${name}: HTTP ${result.status}, ${result.seconds} s`);
  if (result.response?.file_size) console.log(`  archive ${Math.round(result.response.file_size / 1e6)} MB, ${result.archiveEntries} entries`);
  if (result.preRestoreBackupMs) console.log(`  of which the pre-restore copy ${round(result.preRestoreBackupMs / 1000)} s`);
  if (result.status !== 200) console.log("  response:", result.response, "\n  API exit:", result.apiExitCode, result.apiStderrTail);
  console.table({
    "GET /auth/me idle (ms)": { n: idle.n, median: idle.median, p95: idle.p95, p99: idle.p99, max: idle.max },
    [`GET /auth/me during ${name.toLowerCase()} (ms)`]: { n: during.n, median: during.median, p95: during.p95, p99: during.p99, max: during.max },
  });
  console.log(
    `  requests over 100 ms: ${during.over100ms} (${during.secondsOver100ms} s), over 1 s: ${during.over1s}, statuses ${JSON.stringify(during.statuses)}`,
  );
  console.log(
    `  API memory: working set ${memory.workingSetMBBefore} → peak ${memory.peakWorkingSetMB} MB, private ${memory.privateMBBefore} → peak ${memory.peakPrivateMB} MB; CPU ${memory.cpuSeconds} s`,
  );
}

function round(value) {
  return value === undefined || Number.isNaN(value) ? undefined : Math.round(value * 10) / 10;
}
