// The properties and rentals tables of a packaged build, with photos, in
// Playwright's Chromium instead of Electron: the build's own renderer files
// served over HTTP, against the build's API on a free port. Requests to the
// renderer's fixed API address (127.0.0.1:34567) are sent to that port, so
// this runs while Dalaly or `pnpm dev` holds 34567 (the startup pass of
// measure.mjs cannot).
//
//   node scripts/perf/tables.mjs --app perf-results/b [--label b] [--runs 5]
//        [--properties 5000] [--photos 3]
//
// Each run opens the properties list, then the rentals list, twice: in a new
// browser context with images as left by earlier uploads ("first view": no
// thumbnails yet, so the run's images folder starts without any), then again
// after logging in anew ("second view": with whatever the first view made).
// Routing requests turns Chromium's HTTP cache off, so nothing is served
// from it in either view. Results go to perf-results/<label>-tables.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import {
  ADMIN,
  api,
  createDatabase,
  dropDatabase,
  firstRowShows,
  freePort,
  makeTempDir,
  packagedApp,
  painted,
  root,
  rowImagesPainted,
  seedDataset,
  seedPhotos,
  startApi,
  stats,
  stopProcess,
  trackApi,
  waitForHealth,
  windowsProcessInfo,
} from "./lib.mjs";

const { values: options } = parseArgs({
  args: process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--")),
  options: {
    app: { type: "string" },
    label: { type: "string" },
    runs: { type: "string", default: "5" },
    properties: { type: "string", default: "5000" },
    photos: { type: "string", default: "3" },
  },
});
if (!options.app) throw new Error("--app <win-unpacked folder> is required");

const app = packagedApp(options.app);
const label = options.label ?? path.basename(app.dir);
const fileLabel = label.replace(/[^A-Za-z0-9._-]+/g, "-");
const runs = Number(options.runs);
const propertyCount = Number(options.properties);
const sizes = {
  properties: propertyCount,
  rentals: Math.round(propertyCount * 0.4),
  people: Math.round(propertyCount * 0.3),
  requests: Math.round(propertyCount * 0.1),
  documents: Math.round(propertyCount * 0.6),
  auditLogs: propertyCount * 4,
};
const RENDERER_API = "127.0.0.1:34567";
// An office PC's screen; all ten rows of a page are on it.
const VIEWPORT = { width: 1600, height: 1000 };
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

const temporary = makeTempDir(`${fileLabel}-tables`);
const thumbnailsDir = path.join(temporary, "images", "thumbnails");
const results = { label, app: app.dir, measuredAt: new Date().toISOString(), dataset: sizes, runs };
let databaseName;
let apiChild;
let web;
let browser;
try {
  databaseName = await createDatabase();
  const apiPort = await freePort();
  const webPort = await freePort();
  web = serveRenderer(path.join(app.dir, "resources", "renderer", "dist"), webPort);
  apiChild = startApi(app, {
    databaseName,
    port: apiPort,
    dataDir: temporary,
    env: { CORS_ORIGINS: `http://127.0.0.1:${webPort}` },
  });
  await waitForHealth(apiPort, (h) => h.startup_state === "SETUP_REQUIRED" && h.startup_reason === "ADMIN_REQUIRED");
  await api(apiPort, "/auth/setup-admin", { method: "POST", body: ADMIN });
  await seedDataset(databaseName, sizes);
  results.photos = await seedPhotos(databaseName, path.join(temporary, "images", "properties"), Number(options.photos));
  console.log(`Seeded ${databaseName}`, sizes, results.photos);

  browser = await chromium.launch();
  const samples = { first: [], second: [] };
  for (let run = 0; run < runs; run += 1) {
    fs.rmSync(thumbnailsDir, { recursive: true, force: true });
    for (const view of ["first", "second"]) {
      const sample = await openTables(browser, apiPort, webPort);
      samples[view].push(sample);
      console.log(
        `  run ${run + 1}, ${view} view: properties photos ${Math.round(sample.propertiesImagesPainted)} ms,`,
        `${sample.propertiesRequests} requests, ${sample.propertiesApiKB} KB, renderer ${sample.rendererPrivateMB} MB`,
      );
    }
  }
  const summarize = (list) =>
    Object.fromEntries(Object.keys(list[0]).map((key) => [key, stats(list.map((entry) => entry[key]))]));
  results.first = summarize(samples.first);
  results.second = summarize(samples.second);
  results.thumbnailFiles = countFiles(thumbnailsDir);
} finally {
  await browser?.close();
  web?.close();
  await stopProcess(apiChild);
  if (databaseName) await dropDatabase(databaseName);
  fs.rmSync(temporary, { recursive: true, force: true });
}

const outputFile = path.join(root, "perf-results", `${fileLabel}-tables.json`);
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(results, null, 2)}\n`);
console.log("\nFirst view (medians)");
console.table(medians(results.first));
console.log("Second view (medians)");
console.table(medians(results.second));
console.log(`Thumbnail files made: ${results.thumbnailFiles}\nWrote ${path.relative(root, outputFile)}`);

/** Logs in, then opens the properties list and the rentals list. */
async function openTables(browser, apiPort, webPort) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.route(
    (url) => url.host === RENDERER_API,
    (route) => route.continue({ url: route.request().url().replace(RENDERER_API, `127.0.0.1:${apiPort}`) }),
  );
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${webPort}/index.html#/login`);
    await page.getByLabel("اسم المستخدم", { exact: true }).fill(ADMIN.username);
    await page.getByLabel("الرمز السري", { exact: true }).fill(ADMIN.pin);
    // The dashboard's first data: /dashboard/overview since the operational
    // dashboard, /dashboard/summary on builds before it.
    const dashboard = page.waitForResponse((response) =>
      /\/api\/dashboard\/(overview|summary)/.test(response.url()),
    );
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await dashboard;
    await painted(page);

    const sample = {};
    const properties = await openList(page, "#/properties", /\/api\/properties\/paged/, "PERF-P");
    Object.assign(sample, prefixed("properties", properties));
    sample.rendererPrivateMB = rendererPrivateMB(await rendererPids(browser));
    const rentals = await openList(page, "#/rentals", /\/api\/rentals\/paged/, "PERF-R");
    Object.assign(sample, prefixed("rentals", rentals));
    return sample;
  } finally {
    await context.close();
  }
}

/** Routes to a list, waits for its first row, every row's photo and the traffic to settle. */
async function openList(page, hash, request, codePrefix) {
  const traffic = trackApi(page, { quietMs: 1000 });
  const started = performance.now();
  const finished = page.waitForEvent("requestfinished", { predicate: (entry) => request.test(entry.url()), timeout: 60_000 });
  await page.evaluate((target) => (location.hash = target), hash);
  await finished;
  const data = performance.now() - started;
  await firstRowShows(page, codePrefix);
  await painted(page);
  const rowsPainted = performance.now() - started;
  const imageRows = await rowImagesPainted(page);
  const imagesPainted = performance.now() - started;
  return { data, painted: rowsPainted, imagesPainted, imageRows, ...(await traffic()) };
}

function prefixed(prefix, step) {
  return {
    [`${prefix}Data`]: step.data,
    [`${prefix}Painted`]: step.painted,
    [`${prefix}ImagesPainted`]: step.imagesPainted,
    [`${prefix}ImageRows`]: step.imageRows,
    [`${prefix}Requests`]: step.requests,
    [`${prefix}ImageRequests`]: step.imageRequests,
    [`${prefix}Writes`]: step.writes,
    [`${prefix}ApiKB`]: step.kb,
  };
}

/** Chromium's renderer processes (one page is open). */
async function rendererPids(browser) {
  const session = await browser.newBrowserCDPSession();
  try {
    const { processInfo } = await session.send("SystemInfo.getProcessInfo");
    return processInfo.filter((entry) => entry.type === "renderer").map((entry) => entry.id);
  } finally {
    await session.detach();
  }
}

function rendererPrivateMB(pids) {
  const info = windowsProcessInfo(pids);
  const largest = Math.max(...Object.values(info).map((entry) => entry.privateMB));
  return Math.round(largest * 10) / 10;
}

function serveRenderer(dir, port) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.resolve(dir, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
  });
  server.listen(port, "127.0.0.1");
  return server;
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length;
}

function medians(summary) {
  return Object.fromEntries(Object.entries(summary).map(([key, s]) => [key, { median: s.median, max: s.max }]));
}
