// Repeatable performance measurements of a packaged build.
//
//   node scripts/perf/measure.mjs --app apps/desktop/release/win-unpacked [--label main]
//        [--runs 8] [--properties 5000] [--skip-api] [--skip-startup]
//
// Needs the local PostgreSQL (DB_* from .env). Creates and drops its own
// dalaly_perf_<timestamp> database and uses temporary profiles, so it never
// touches real data. The startup pass needs port 34567 free (close Dalaly).
// Results go to perf-results/<label>.json and are printed as tables.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { _electron } from "@playwright/test";
import {
  ADMIN,
  api,
  childPids,
  createDatabase,
  databaseUrl,
  dropDatabase,
  freePort,
  makeTempDir,
  packagedApp,
  portIsFree,
  root,
  seedDataset,
  sleep,
  startApi,
  stats,
  stopProcess,
  timeRequests,
  waitForHealth,
  windowsProcessInfo,
  cleanEnv,
} from "./lib.mjs";

const { values: options } = parseArgs({
  options: {
    app: { type: "string" },
    label: { type: "string" },
    runs: { type: "string", default: "8" },
    properties: { type: "string", default: "5000" },
    "skip-api": { type: "boolean", default: false },
    "skip-startup": { type: "boolean", default: false },
  },
});
if (!options.app) throw new Error("--app <win-unpacked folder> is required");

const app = packagedApp(options.app);
const label = options.label ?? path.basename(path.dirname(app.dir));
// For file and folder names: a branch-style label such as feature/perf
// would otherwise point into folders that do not exist.
const fileLabel = label.replace(/[^A-Za-z0-9._-]+/g, "-");
const runs = Number(options.runs);
const propertyCount = Number(options.properties);
const sizes = {
  properties: propertyCount,
  rentals: Math.round(propertyCount * 0.4),
  people: Math.round(propertyCount * 0.3),
  requests: Math.round(propertyCount * 0.1),
  auditLogs: propertyCount * 4,
};
// The renderer's API base is fixed at build time to this port.
const APP_API_PORT = 34567;
const IDLE_SAMPLE_MS = 10_000;
// The list request a page sends: the whole array (before server paging) or
// one page from /paged. Image and audit requests do not match.
const LIST_REQUEST = {
  properties: /\/api\/properties(\/paged)?(\?|$)/,
  rentals: /\/api\/rentals(\/paged)?(\?|$)/,
};
const PROPERTY_SEARCH_PLACEHOLDER = "ابحث باسم المالك، الهاتف، رقم القطعة، المنطقة أو أي وصف";
const PAGE_SEARCH = "بغداد";

const results = {
  label,
  app: app.dir,
  measuredAt: new Date().toISOString(),
  machine: { platform: process.platform, node: process.version },
  dataset: sizes,
};

const temporary = makeTempDir(fileLabel);
let databaseName;
let apiChild;
try {
  // Inside the try so the finally drops the database whatever fails next.
  databaseName = await createDatabase();
  // 1. Migrate through the packaged API, create the administrator, seed.
  const fixturePort = await freePort();
  apiChild = startApi(app, { databaseName, port: fixturePort, dataDir: temporary });
  await waitForHealth(
    fixturePort,
    (health) => health.startup_state === "SETUP_REQUIRED" && health.startup_reason === "ADMIN_REQUIRED",
  );
  await api(fixturePort, "/auth/setup-admin", { method: "POST", body: ADMIN });
  const seedStarted = performance.now();
  await seedDataset(databaseName, sizes);
  results.seedSeconds = Math.round((performance.now() - seedStarted) / 100) / 10;
  console.log(`Seeded ${databaseName} in ${results.seedSeconds} s`, sizes);

  if (!options["skip-api"]) {
    // Restart so the API runs against the seeded data with cold caches.
    await stopProcess(apiChild);
    apiChild = startApi(app, { databaseName, port: fixturePort, dataDir: temporary });
    await waitForHealth(fixturePort, (health) => health.startup_state === "READY");
    results.api = await measureApi(fixturePort, apiChild.pid);
    printApi(results.api);
  }
  await stopProcess(apiChild);
  apiChild = undefined;

  if (!options["skip-startup"]) {
    if (!(await portIsFree(APP_API_PORT)))
      throw new Error(`Port ${APP_API_PORT} is in use; close Dalaly before measuring startup.`);
    results.startup = await measureStartup();
    printStartup(results.startup);
  }
} finally {
  await stopProcess(apiChild);
  if (databaseName) await dropDatabase(databaseName);
  fs.rmSync(temporary, { recursive: true, force: true });
}

const outputDir = path.join(root, "perf-results");
fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `${fileLabel}.json`);
fs.writeFileSync(outputFile, `${JSON.stringify(results, null, 2)}\n`);
console.log(`\nWrote ${path.relative(root, outputFile)}`);

async function measureApi(port, apiPid) {
  const { body: session } = await api(port, "/auth/login", { method: "POST", body: ADMIN });
  const token = session.token;
  const get = (pathname) => () => api(port, pathname, { token });
  const { body: requests } = await api(port, "/rental-requests", { token });
  const requestId = requests[0]?.id;

  const before = windowsProcessInfo([apiPid])[apiPid];
  const endpoints = {
    "GET /auth/me": "/auth/me",
    "GET /dashboard/summary": "/dashboard/summary",
    "GET /properties": "/properties",
    "GET /properties?search=بغداد": `/properties?search=${encodeURIComponent("بغداد")}`,
    "GET /rentals": "/rentals",
    "GET /people": "/people",
    "GET /rental-requests": "/rental-requests",
    "GET /locations": "/locations",
    ...(requestId
      ? { "GET /matching/rental-requests/:id/offers": `/matching/rental-requests/${requestId}/offers` }
      : {}),
  };
  const sequential = {};
  for (const [name, pathname] of Object.entries(endpoints)) {
    sequential[name] = await timeRequests(get(pathname), { warmup: 3, count: 30 });
  }

  // The request each list page sends for the same user action, so builds
  // before and after server paging compare like for like: before, every
  // action downloads the whole list and the renderer sorts and pages it.
  const paged = (await fetch(`http://127.0.0.1:${port}/api/properties/paged?page_size=1`, {
    headers: { authorization: `Bearer ${token}` },
  })).ok;
  const pageRequests = {};
  for (const [name, pathname] of Object.entries(await listPageRequests(port, token, paged))) {
    pageRequests[name] = { path: pathname, ...(await timeRequests(get(pathname), { warmup: 3, count: 30 })) };
  }

  // Four parallel clients searching, as several office PCs would over the tunnel.
  const concurrentSearch = await concurrently(get(`/properties?search=${encodeURIComponent("شارع 1")}`));
  // The same, with the request the properties page sends for that search.
  const concurrentPageSearch = await concurrently(
    get(
      paged
        ? `/properties/paged?q=${encodeURIComponent("شارع 1")}&page=1&page_size=10&sort_by=created_at&sort_order=desc`
        : `/properties?q=${encodeURIComponent("شارع 1")}`,
    ),
  );
  const after = windowsProcessInfo([apiPid])[apiPid];

  return {
    sequential,
    paged,
    pageRequests,
    concurrentSearch,
    concurrentPageSearch,
    apiProcess: {
      workingSetMBBefore: round(before?.workingSetMB),
      workingSetMBAfter: round(after?.workingSetMB),
      privateMBAfter: round(after?.privateMB),
      cpuSecondsDuringRun: round(((after?.cpuMs ?? 0) - (before?.cpuMs ?? 0)) / 1000),
    },
  };
}

/** What the properties and rentals pages request for each measured action. */
async function listPageRequests(port, token, paged) {
  if (!paged) {
    const all = "/properties";
    return {
      "Properties page: open": all,
      [`Properties page: search ${PAGE_SEARCH}`]: `/properties?q=${encodeURIComponent(PAGE_SEARCH)}`,
      "Properties page: sort by area": all,
      "Properties page: last page": all,
      "Rentals page: open": "/rentals",
    };
  }
  const first = "page=1&page_size=10&sort_by=created_at&sort_order=desc";
  const { body } = await api(port, `/properties/paged?${first}`, { token });
  const lastPage = Math.max(1, Math.ceil(body.total / 10));
  return {
    "Properties page: open": `/properties/paged?${first}`,
    [`Properties page: search ${PAGE_SEARCH}`]: `/properties/paged?q=${encodeURIComponent(PAGE_SEARCH)}&${first}`,
    "Properties page: sort by area": "/properties/paged?page=1&page_size=10&sort_by=area&sort_order=desc",
    "Properties page: last page": `/properties/paged?page=${lastPage}&page_size=10&sort_by=created_at&sort_order=desc`,
    "Rentals page: open": `/rentals/paged?${first}`,
  };
}

/** Four clients sending `request` 15 times each, in parallel. */
async function concurrently(request) {
  const samples = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let i = 0; i < 15; i += 1) {
        const t = performance.now();
        await request();
        samples.push(performance.now() - t);
      }
    }),
  );
  const elapsedSeconds = (performance.now() - started) / 1000;
  return {
    clients: 4,
    ...stats(samples),
    requestsPerSecond: Math.round((samples.length / elapsedSeconds) * 10) / 10,
  };
}

async function measureStartup() {
  const profiles = makeTempDir(`${fileLabel}-profiles`);
  const repeatProfile = path.join(profiles, "repeat");
  const launchApp = async (profile) => {
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, "config.json"),
      JSON.stringify({ databaseUrl: databaseUrl(databaseName) }),
    );
    return _electron.launch({
      executablePath: app.exe,
      args: [`--user-data-dir=${profile}`],
      env: cleanEnv(),
      timeout: 60_000,
    });
  };

  const samples = { fresh: [], repeat: [] };
  const memory = [];
  try {
    // Untimed launch so the "repeat" profile has Chromium caches populated.
    await runOnce(await launchApp(repeatProfile), { login: false });
    for (let index = 0; index < runs; index += 1) {
      for (const mode of ["fresh", "repeat"]) {
        const profile = mode === "fresh" ? path.join(profiles, `fresh-${index}`) : repeatProfile;
        const started = performance.now();
        const electron = await launchApp(profile);
        const timing = await runOnce(electron, {
          started,
          login: true,
          sampleMemory: mode === "repeat" && index === 0,
        });
        samples[mode].push(timing.marks);
        if (timing.memory) memory.push(timing.memory);
        console.log(`  ${mode} #${index + 1}: login form ${Math.round(timing.marks.loginVisible)} ms`);
      }
    }
  } finally {
    fs.rmSync(profiles, { recursive: true, force: true });
  }

  const summarize = (list) =>
    Object.fromEntries(
      Object.keys(list[0]).map((mark) => [mark, stats(list.map((entry) => entry[mark]))]),
    );
  return { runs, fresh: summarize(samples.fresh), repeat: summarize(samples.repeat), memory: memory[0] };
}

async function runOnce(electron, { started = performance.now(), login, sampleMemory = false }) {
  const marks = { launched: performance.now() - started };
  let apiReadyAt;
  let stopPolling = false;
  const healthPoll = (async () => {
    while (apiReadyAt === undefined && !stopPolling) {
      try {
        const response = await fetch(`http://127.0.0.1:${APP_API_PORT}/api/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if ((await response.json()).startup_state === "READY") apiReadyAt = performance.now();
      } catch {
        // API not listening yet
      }
      if (apiReadyAt === undefined) await sleep(25);
    }
  })();

  try {
    const splash = await electron.firstWindow();
    await splash.waitForLoadState("load");
    marks.splashLoaded = performance.now() - started;

    const page = await waitForWindow(electron, (url) => url.includes("/index.html"));
    await page.getByLabel("اسم المستخدم", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
    marks.loginVisible = performance.now() - started;
    await healthPoll;
    marks.apiReady = apiReadyAt - started;
    while (electron.windows().some((window) => window.url().includes("splash.html"))) await sleep(20);
    marks.splashClosed = performance.now() - started;

    if (!login) return { marks };
    let memory;
    if (sampleMemory) memory = { idleAtLogin: await sampleProcesses(electron) };

    await page.getByLabel("اسم المستخدم", { exact: true }).fill(ADMIN.username);
    await page.getByLabel("الرمز السري", { exact: true }).fill(ADMIN.pin);
    // Record the click on the page's own clock, which Element Timing and
    // performance marks also use.
    await page.evaluate(() => {
      window.__dalalyLoginClick = undefined;
      document.addEventListener("click", (event) => (window.__dalalyLoginClick ??= event.timeStamp), { capture: true });
    });
    const clicked = performance.now();
    const dashboard = page.waitForResponse((response) => response.url().includes("/api/dashboard/summary"), {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
    await dashboard;
    marks.loginToDashboardData = performance.now() - clicked;
    // Two frames after the data arrives, the dashboard has rendered it.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    marks.loginToDashboardPainted = performance.now() - clicked;
    // In-page clock, from the click event: when the dashboard's first heading
    // was painted (Element Timing, elementtiming="dashboard-content") and when
    // its last chart was drawn (performance mark). Absent on builds without them.
    const inPage = await page.evaluate(async () => {
      const click = window.__dalalyLoginClick;
      for (let i = 0; i < 50 && performance.getEntriesByName("dalaly:chart-drawn").length < 2; i += 1)
        await new Promise((resolve) => setTimeout(resolve, 20));
      // Element Timing entries reach observers only; buffered: true replays them.
      const content = await new Promise((resolve) => {
        new PerformanceObserver((list, observer) => {
          const entry = list.getEntries().find((e) => e.identifier === "dashboard-content");
          if (entry) {
            observer.disconnect();
            resolve(entry);
          }
        }).observe({ type: "element", buffered: true });
        setTimeout(() => resolve(undefined), 1000);
      });
      const charts = performance.getEntriesByName("dalaly:chart-drawn");
      return {
        content: content && click !== undefined ? content.renderTime - click : null,
        charts: charts.length && click !== undefined ? charts.at(-1).startTime - click : null,
      };
    });
    if (inPage.content !== null) marks.loginToDashboardContentPainted = inPage.content;
    if (inPage.charts !== null) marks.loginToDashboardChartsDrawn = inPage.charts;

    if (sampleMemory) memory.idleOnDashboard = await sampleProcesses(electron);

    // Dashboard → properties list → a search → rentals list. `…Data` is the
    // list response fully received, `…Painted` the new rows on screen.
    const properties = await openList(page, "#/properties", LIST_REQUEST.properties, "PERF-P");
    marks.dashboardToPropertiesData = properties.data;
    marks.dashboardToPropertiesPainted = properties.painted;
    if (sampleMemory) memory.idleOnProperties = await sampleProcesses(electron);

    const search = await searchProperties(page);
    marks.propertiesSearchData = search.data;
    marks.propertiesSearchPainted = search.painted;

    const rentals = await openList(page, "#/rentals", LIST_REQUEST.rentals, "PERF-R");
    marks.propertiesToRentalsData = rentals.data;
    marks.propertiesToRentalsPainted = rentals.painted;
    // The repeat profile would otherwise open straight on the dashboard next
    // time; a daily start normally finds the 12-hour session expired.
    await page.evaluate(() => localStorage.removeItem("dalaly.session"));
    return { marks, memory };
  } finally {
    stopPolling = true;
    await electron.close();
    // before-quit stops the API; the next launch needs its port.
    const deadline = Date.now() + 20_000;
    while (!(await portIsFree(APP_API_PORT))) {
      if (Date.now() > deadline) throw new Error(`API still holds port ${APP_API_PORT} after quit`);
      await sleep(100);
    }
  }
}

/** Code of the first row in the list table (third column), if rows are shown. */
function firstRowCode(page) {
  return page.evaluate(() =>
    document.querySelector(".dal-grid tbody tr td:nth-child(3)")?.textContent?.trim(),
  );
}

async function painted(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Routes to a list page and waits for its first rows. */
async function openList(page, hash, request, codePrefix) {
  const started = performance.now();
  const finished = page.waitForEvent("requestfinished", {
    predicate: (entry) => request.test(entry.url()),
    timeout: 60_000,
  });
  await page.evaluate((target) => (location.hash = target), hash);
  await finished;
  const data = performance.now() - started;
  await page.waitForFunction(
    (prefix) =>
      document.querySelector(".dal-grid tbody tr td:nth-child(3)")?.textContent?.trim().startsWith(prefix),
    codePrefix,
    { timeout: 60_000 },
  );
  await painted(page);
  return { data, painted: performance.now() - started };
}

/** Searches the properties list (Enter skips the 300 ms debounce). */
async function searchProperties(page) {
  const before = await firstRowCode(page);
  const field = page.getByPlaceholder(PROPERTY_SEARCH_PLACEHOLDER, { exact: true });
  await field.fill(PAGE_SEARCH);
  const started = performance.now();
  const finished = page.waitForEvent("requestfinished", {
    predicate: (entry) =>
      LIST_REQUEST.properties.test(entry.url()) && decodeURIComponent(entry.url()).includes(PAGE_SEARCH),
    timeout: 60_000,
  });
  await field.press("Enter");
  await finished;
  const data = performance.now() - started;
  await page.waitForFunction(
    (previous) => {
      const code = document.querySelector(".dal-grid tbody tr td:nth-child(3)")?.textContent?.trim();
      return Boolean(code) && code !== previous;
    },
    before,
    { timeout: 60_000 },
  );
  await painted(page);
  return { data, painted: performance.now() - started };
}

async function waitForWindow(electron, matches) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const page = electron.windows().find((window) => matches(window.url()));
    if (page) return page;
    await sleep(20);
  }
  throw new Error("Main window did not open");
}

/** Memory and idle CPU of every Electron process plus the API child. */
async function sampleProcesses(electron) {
  // electron.process() can be a launcher; ask the main process itself.
  const mainPid = await electron.evaluate(() => process.pid);
  const apiPids = childPids(mainPid, /server[\\/]dist[\\/]index\.js/);
  const metrics = () =>
    electron.evaluate(({ app }) =>
      app.getAppMetrics().map((metric) => ({ pid: metric.pid, type: metric.type })),
    );
  const pids = [...new Set([...(await metrics()).map((metric) => metric.pid), ...apiPids])];
  const typeByPid = Object.fromEntries((await metrics()).map((metric) => [metric.pid, metric.type]));
  for (const pid of apiPids) typeByPid[pid] = "API";

  const before = windowsProcessInfo(pids);
  await sleep(IDLE_SAMPLE_MS);
  const after = windowsProcessInfo(pids);

  const byType = {};
  for (const pid of pids) {
    if (!after[pid]) continue;
    const type = typeByPid[pid] ?? "other";
    const entry = (byType[type] ??= { processes: 0, workingSetMB: 0, privateMB: 0, cpuPercent: 0 });
    entry.processes += 1;
    entry.workingSetMB += after[pid].workingSetMB;
    entry.privateMB += after[pid].privateMB;
    entry.cpuPercent += ((after[pid].cpuMs - (before[pid]?.cpuMs ?? after[pid].cpuMs)) / IDLE_SAMPLE_MS) * 100;
  }
  const total = { processes: 0, workingSetMB: 0, privateMB: 0, cpuPercent: 0 };
  for (const entry of Object.values(byType)) {
    for (const key of Object.keys(total)) total[key] += entry[key];
  }
  byType.total = total;
  for (const entry of Object.values(byType))
    for (const key of ["workingSetMB", "privateMB", "cpuPercent"]) entry[key] = round(entry[key]);
  return byType;
}

function round(value) {
  return value === undefined ? undefined : Math.round(value * 10) / 10;
}

function printApi(result) {
  console.log("\nAPI latency (ms, sequential, 30 samples after 3 warm-up)");
  console.table(
    Object.fromEntries(
      Object.entries(result.sequential).map(([name, s]) => [
        name,
        { median: s.median, p95: s.p95, max: s.max, KB: Math.round(s.bytes / 1024) },
      ]),
    ),
  );
  console.log(`List page requests (${result.paged ? "server paging" : "whole list"})`);
  console.table(
    Object.fromEntries(
      Object.entries(result.pageRequests).map(([name, s]) => [
        name,
        { median: s.median, p95: s.p95, max: s.max, KB: Math.round(s.bytes / 1024) },
      ]),
    ),
  );
  console.log("Concurrent search:", result.concurrentSearch);
  console.log("Concurrent search, as the page sends it:", result.concurrentPageSearch);
  console.log("API process:", result.apiProcess);
}

function printStartup(result) {
  console.log(`\nStartup (ms from launch, ${result.runs} runs each; median / max)`);
  const rows = {};
  for (const mode of ["fresh", "repeat"])
    for (const [mark, s] of Object.entries(result[mode])) rows[`${mode} ${mark}`] = { median: s.median, max: s.max };
  console.table(rows);
  if (result.memory) {
    console.log("Memory and idle CPU at login form:");
    console.table(result.memory.idleAtLogin);
    console.log("Memory and idle CPU on dashboard:");
    console.table(result.memory.idleOnDashboard);
    console.log("Memory and idle CPU on the properties list:");
    console.table(result.memory.idleOnProperties);
  }
}
