// Repeatable performance measurements of a packaged build.
//
//   node scripts/perf/measure.mjs --app apps/desktop/release/win-unpacked [--label main]
//        [--runs 8] [--properties 5000] [--photos 3] [--skip-api] [--skip-startup]
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
  download,
  dropDatabase,
  freePort,
  makeTempDir,
  packagedApp,
  portIsFree,
  root,
  seedDataset,
  seedPhotos,
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
  // pnpm 10 passes the `--` of `pnpm perf -- --app …` through.
  args: process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--")),
  options: {
    app: { type: "string" },
    label: { type: "string" },
    runs: { type: "string", default: "8" },
    properties: { type: "string", default: "5000" },
    // Photos per property and rental (12 MP JPEGs of 3–4.5 MB); 0 = none.
    photos: { type: "string", default: "0" },
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
const photosPerListing = Number(options.photos);
const sizes = {
  properties: propertyCount,
  rentals: Math.round(propertyCount * 0.4),
  people: Math.round(propertyCount * 0.3),
  requests: Math.round(propertyCount * 0.1),
  documents: Math.round(propertyCount * 0.6),
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
  people: /\/api\/people(\/paged)?(\?|$)/,
  rentalRequests: /\/api\/rental-requests(\/paged)?(\?|$)/,
  purchaseRequests: /\/api\/purchase-requests(\/paged)?(\?|$)/,
  documents: /\/api\/documents(\/paged)?(\?|$)/,
};
const PROPERTY_SEARCH_PLACEHOLDER = "ابحث باسم المالك، الهاتف، رقم القطعة، المنطقة أو أي وصف";
const PAGE_SEARCH = "بغداد";
// A seeded person ('زبون ' || g), searched for in the person pickers.
const PERSON_SEARCH = "زبون 777";

const results = {
  label,
  app: app.dir,
  measuredAt: new Date().toISOString(),
  machine: { platform: process.platform, node: process.version },
  dataset: sizes,
};

const temporary = makeTempDir(fileLabel);
// The API's images folder (startApi), shared with each app profile.
const seededImagesDir = () => path.join(temporary, "images", "properties");
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
  if (photosPerListing > 0)
    results.photos = await seedPhotos(databaseName, seededImagesDir(), photosPerListing);
  results.seedSeconds = Math.round((performance.now() - seedStarted) / 100) / 10;
  console.log(`Seeded ${databaseName} in ${results.seedSeconds} s`, sizes, results.photos ?? "no photos");
  results.build = await probeBuild(fixturePort);
  console.log("Build:", results.build);

  if (!options["skip-api"]) {
    // Restart so the API runs against the seeded data with cold caches.
    await stopProcess(apiChild);
    apiChild = startApi(app, { databaseName, port: fixturePort, dataDir: temporary });
    await waitForHealth(fixturePort, (health) => health.startup_state === "READY");
    results.api = await measureApi(fixturePort, apiChild.pid, results.build);
    printApi(results.api);
  }
  await stopProcess(apiChild);
  apiChild = undefined;

  if (!options["skip-startup"]) {
    if (!(await portIsFree(APP_API_PORT)))
      throw new Error(`Port ${APP_API_PORT} is in use; close Dalaly before measuring startup.`);
    results.startup = await measureStartup(results.build);
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

/**
 * What the build under test can do, so both passes send what its pages send:
 * server paging of properties and rentals (PR 5), and of people, requests and
 * documents with the owner filter (person details). Also the person whose
 * offers the person details page shows: the owner of the newest offer.
 */
async function probeBuild(port) {
  const { body: session } = await api(port, "/auth/login", { method: "POST", body: ADMIN });
  const ok = async (pathname) =>
    (await fetch(`http://127.0.0.1:${port}/api${pathname}`, { headers: { authorization: `Bearer ${session.token}` } }))
      .ok;
  const { body: newest } = await api(port, "/properties?limit=1", { token: session.token });
  const { body: newestRental } = await api(port, "/rentals?limit=1", { token: session.token });
  const pagedOffers = await ok("/properties/paged?page_size=1");
  const { body: images } = await api(port, `/properties/${newest[0].id}/images`, { token: session.token });
  return {
    pagedOffers,
    pagedPeople: await ok("/people/paged?page_size=1"),
    // Paged rows carry their primary image, so table rows ask for no image list.
    primaryImages:
      pagedOffers &&
      "primary_image" in (await api(port, "/properties/paged?page_size=1", { token: session.token })).body.items[0],
    ownerId: newest[0].owner_person_id,
    // Opened in their edit forms; the rental is linked to a person.
    propertyId: newest[0].id,
    rentalId: newestRental[0].id,
    imageId: images[0]?.id,
  };
}

async function measureApi(port, apiPid, build) {
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
    ...(build.imageId ? { "GET /properties/:id/images": `/properties/${build.propertyId}/images` } : {}),
  };
  const sequential = {};
  for (const [name, pathname] of Object.entries(endpoints)) {
    sequential[name] = await timeRequests(get(pathname), { warmup: 3, count: 30 });
  }
  if (build.imageId)
    sequential["GET /properties/:id/images/:imageId/file (original photo)"] = await timeRequests(
      () => download(port, `/properties/${build.propertyId}/images/${build.imageId}/file`, { token }),
      { warmup: 3, count: 30 },
    );

  // The request each list page sends for the same user action, so builds
  // before and after server paging compare like for like: before, every
  // action downloads the whole list and the renderer sorts and pages it.
  const paged = build.pagedOffers;
  const pageRequests = {};
  for (const [name, spec] of Object.entries(await listPageRequests(port, token, build))) {
    // A page that sends several requests for one action: all of them, in
    // parallel (Promise.all) or one after another as the page does.
    const { paths, sequential = false } = typeof spec === "string" ? { paths: [spec] } : spec;
    const send = async () => {
      const responses = [];
      if (sequential) for (const pathname of paths) responses.push(await get(pathname)());
      else responses.push(...(await Promise.all(paths.map((pathname) => get(pathname)()))));
      return { bytes: responses.reduce((sum, response) => sum + response.bytes, 0) };
    };
    pageRequests[name] = { path: paths.join(sequential ? " → " : " ∥ "), ...(await timeRequests(send, { warmup: 3, count: 30 })) };
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

/**
 * What each list page requests for each measured action: one path, or
 * { paths, sequential } when the page sends several requests.
 */
async function listPageRequests(port, token, build) {
  const first = "page=1&page_size=10&sort_by=created_at&sort_order=desc";
  let offers;
  if (!build.pagedOffers) {
    const all = "/properties";
    offers = {
      "Properties page: open": all,
      [`Properties page: search ${PAGE_SEARCH}`]: `/properties?q=${encodeURIComponent(PAGE_SEARCH)}`,
      "Properties page: sort by area": all,
      "Properties page: last page": all,
      "Rentals page: open": "/rentals",
    };
  } else {
    const { body } = await api(port, `/properties/paged?${first}`, { token });
    const lastPage = Math.max(1, Math.ceil(body.total / 10));
    offers = {
      "Properties page: open": `/properties/paged?${first}`,
      [`Properties page: search ${PAGE_SEARCH}`]: `/properties/paged?q=${encodeURIComponent(PAGE_SEARCH)}&${first}`,
      "Properties page: sort by area": "/properties/paged?page=1&page_size=10&sort_by=area&sort_order=desc",
      "Properties page: last page": `/properties/paged?page=${lastPage}&page_size=10&sort_by=created_at&sort_order=desc`,
      "Rentals page: open": `/rentals/paged?${first}`,
    };
  }
  // Before: person details downloads every active and archived offer to keep
  // the owner's; the requests pages download the whole list, then every
  // person (for the form's customer picker), on each load.
  if (!build.pagedPeople)
    return {
      ...offers,
      "Person details: properties": { paths: ["/properties", "/properties?status=archived"] },
      "People page: open": "/people",
      "Rental requests page: open": { paths: ["/rental-requests", "/people"], sequential: true },
      "Purchase requests page: open": { paths: ["/purchase-requests", "/people"], sequential: true },
      "Documents page: open (list request)": "/documents",
    };
  const updated = "page=1&page_size=10&sort_by=updated_at&sort_order=desc";
  return {
    ...offers,
    "Person details: properties": `/properties/paged?owner_person_id=${build.ownerId}&include_archived=true&q=&${first}`,
    "People page: open": `/people/paged?q=&${updated}`,
    "Rental requests page: open": `/rental-requests/paged?q=&${updated}`,
    "Purchase requests page: open": `/purchase-requests/paged?q=&${updated}`,
    "Documents page: open (list request)": "/documents/paged?page=1&page_size=10&sort_by=uploaded_at&sort_order=desc",
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

async function measureStartup(build) {
  const profiles = makeTempDir(`${fileLabel}-profiles`);
  const repeatProfile = path.join(profiles, "repeat");
  const launchApp = async (profile) => {
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(profile, "config.json"),
      JSON.stringify({ databaseUrl: databaseUrl(databaseName) }),
    );
    // Every profile sees the seeded photos (the app keeps images under its
    // profile); anything else the app writes under images/ stays per profile.
    const photos = path.join(profile, "images", "properties");
    if (photosPerListing > 0 && !fs.existsSync(photos)) {
      fs.mkdirSync(path.dirname(photos), { recursive: true });
      fs.symlinkSync(seededImagesDir(), photos, "junction");
    }
    return _electron.launch({
      executablePath: app.exe,
      args: [`--user-data-dir=${profile}`],
      env: cleanEnv(),
      timeout: 60_000,
    });
  };

  const samples = { fresh: [], repeat: [] };
  const memory = { fresh: undefined, repeat: undefined };
  try {
    // Untimed launch so the "repeat" profile has Chromium caches populated.
    // With photos it also walks the lists once, as a user did the day before
    // (whatever the app keeps for images it has shown is then in place).
    await runOnce(await launchApp(repeatProfile), { login: photosPerListing > 0, build });
    for (let index = 0; index < runs; index += 1) {
      for (const mode of ["fresh", "repeat"]) {
        const profile = mode === "fresh" ? path.join(profiles, `fresh-${index}`) : repeatProfile;
        const started = performance.now();
        const electron = await launchApp(profile);
        const timing = await runOnce(electron, {
          started,
          login: true,
          // The fresh profile only on the properties list, with photos.
          sampleMemory: index === 0 && (mode === "repeat" ? "all" : photosPerListing > 0 && "properties"),
          build,
        });
        samples[mode].push(timing.marks);
        memory[mode] ??= timing.memory;
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
  return {
    runs,
    fresh: summarize(samples.fresh),
    repeat: summarize(samples.repeat),
    memory: memory.repeat,
    memoryFresh: memory.fresh,
  };
}

async function runOnce(electron, { started = performance.now(), login, sampleMemory = false, build }) {
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
    const sampleAll = sampleMemory === "all";
    const memory = sampleMemory ? {} : undefined;
    if (sampleAll) memory.idleAtLogin = await sampleProcesses(electron);

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

    if (sampleAll) memory.idleOnDashboard = await sampleProcesses(electron);

    // Dashboard → properties list → a search → rentals list. `…Data` is the
    // list response fully received, `…Painted` the new rows on screen.
    // With photos, also when every row's photo is decoded and on screen
    // (`…ImagesPainted`) and what the step sent to the API (`…Requests`,
    // `…ImageRequests`, `…ApiKB`), until no request was in flight for 1 s.
    const images = photosPerListing > 0;
    const properties = await openList(page, "#/properties", LIST_REQUEST.properties, "PERF-P", 3, { images });
    Object.assign(marks, stepMarks("dashboardToProperties", properties));
    if (sampleMemory) memory.idleOnProperties = await sampleProcesses(electron);

    const search = await searchProperties(page, { images });
    Object.assign(marks, stepMarks("propertiesSearch", search));

    const rentals = await openList(page, "#/rentals", LIST_REQUEST.rentals, "PERF-R", 3, { images });
    Object.assign(marks, stepMarks("propertiesToRentals", rentals));

    // Rentals → people → one person's properties → rental requests →
    // purchase requests → documents (first row's code or number on screen).
    const people = await openList(page, "#/people", LIST_REQUEST.people, "PERF-C", 2);
    marks.rentalsToPeopleData = people.data;
    marks.rentalsToPeoplePainted = people.painted;
    if (sampleAll) memory.idleOnPeople = await sampleProcesses(electron);

    const person = await openPersonProperties(page, build);
    marks.peopleToPersonPropertiesData = person.data;
    marks.peopleToPersonPropertiesPainted = person.painted;

    const rentalRequests = await openList(page, "#/rental-requests", LIST_REQUEST.rentalRequests, "PERF-RQ", 1);
    marks.personToRentalRequestsData = rentalRequests.data;
    marks.personToRentalRequestsPainted = rentalRequests.painted;

    const purchaseRequests = await openList(page, "#/purchase-requests", LIST_REQUEST.purchaseRequests, "PERF-PQ", 1);
    marks.rentalToPurchaseRequestsData = purchaseRequests.data;
    marks.rentalToPurchaseRequestsPainted = purchaseRequests.painted;

    const documentsBytes = trackApiBytes(page);
    const documents = await openList(page, "#/documents", LIST_REQUEST.documents, "PERF-N", 3);
    marks.purchaseRequestsToDocumentsData = documents.data;
    marks.purchaseRequestsToDocumentsPainted = documents.painted;
    marks.documentsPageApiKB = await documentsBytes();
    if (sampleAll) memory.idleOnDocuments = await sampleProcesses(electron);

    // The person pickers: the documents filter, the request form's customer
    // list, the property and rental edit forms (`…ApiKB`: what each step
    // downloaded from the API, once its requests have settled).
    const filter = await searchPicker(page, "تصفية حسب الشخص", PERSON_SEARCH);
    marks.documentsPersonSearchShown = filter.shown;
    marks.documentsPersonSearchApiKB = filter.kb;

    const requestForm = await openRequestForm(page);
    marks.requestFormOpen = requestForm.open;
    marks.requestFormCustomersShown = requestForm.customers;
    marks.requestFormApiKB = requestForm.kb;

    const propertyEdit = await openEditForm(page, `#/properties/${build.propertyId}/edit`);
    marks.propertyEditReady = propertyEdit.ready;
    marks.propertyEditApiKB = propertyEdit.kb;

    const rentalEdit = await openEditForm(page, `#/rentals/${build.rentalId}/edit`, "ربط المالك بعميل");
    marks.rentalEditReady = rentalEdit.ready;
    marks.rentalEditOwnerShown = rentalEdit.owner;
    marks.rentalEditApiKB = rentalEdit.kb;
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

/** The first table row's cell in `column` starts with `prefix`. */
function firstRowStartsWith(page, column, prefix) {
  return page.waitForFunction(
    ([column, prefix]) =>
      document
        .querySelector(`.v-data-table tbody tr td:nth-child(${column})`)
        ?.textContent?.trim()
        .startsWith(prefix),
    [column, prefix],
    { timeout: 60_000 },
  );
}

async function painted(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/**
 * Routes to a list page and waits for its first rows: the code in the
 * `column`th cell (the third, in the properties and rentals grids). With
 * `images`, then for every row's photo and the API traffic of the step.
 */
async function openList(page, hash, request, codePrefix, column = 3, { images = false } = {}) {
  const traffic = images ? trackApi(page, { quietMs: 1000 }) : undefined;
  const started = performance.now();
  const finished = page.waitForEvent("requestfinished", {
    predicate: (entry) => request.test(entry.url()),
    timeout: 60_000,
  });
  await page.evaluate((target) => (location.hash = target), hash);
  await finished;
  const data = performance.now() - started;
  await firstRowStartsWith(page, column, codePrefix);
  await painted(page);
  const result = { data, painted: performance.now() - started };
  if (!images) return result;
  await rowImagesPainted(page);
  return { ...result, imagesPainted: performance.now() - started, traffic: await traffic() };
}

/** Every row of the list grid shows a loaded, decoded photo in its first cell. */
async function rowImagesPainted(page) {
  await page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll(".dal-grid tbody tr")];
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
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll(".dal-grid tbody tr td:first-child img")].map((image) =>
        image.decode().catch(() => {}),
      ),
    ),
  );
  await painted(page);
}

/** The marks of one list step, named after `prefix`. */
function stepMarks(prefix, step) {
  const marks = { [`${prefix}Data`]: step.data, [`${prefix}Painted`]: step.painted };
  if (step.imagesPainted === undefined) return marks;
  return {
    ...marks,
    [`${prefix}ImagesPainted`]: step.imagesPainted,
    [`${prefix}Requests`]: step.traffic.requests,
    [`${prefix}ImageRequests`]: step.traffic.imageRequests,
    [`${prefix}ApiKB`]: step.traffic.kb,
  };
}

/**
 * Opens a person (the owner of the newest offer) and the "linked properties"
 * tab as soon as it shows. `data` waits for every property list request the
 * page sends (two on builds without the owner filter).
 */
async function openPersonProperties(page, build) {
  const started = performance.now();
  let pending = build.pagedPeople ? 1 : 2;
  const finished = new Promise((resolve) => {
    const onFinished = (entry) => {
      if (!LIST_REQUEST.properties.test(entry.url()) || --pending > 0) return;
      page.off("requestfinished", onFinished);
      resolve(performance.now() - started);
    };
    page.on("requestfinished", onFinished);
  });
  await page.evaluate((target) => (location.hash = target), `#/clients/${build.ownerId}`);
  const tab = page.getByRole("tab", { name: "العقارات المرتبطة", exact: true });
  await tab.click({ timeout: 60_000 });
  // The name cell holds the offer's name and, under it, its code.
  await page.waitForFunction(
    () => document.querySelector(".v-window-item--active .v-data-table tbody tr td")?.textContent?.includes("PERF-P"),
    undefined,
    { timeout: 60_000 },
  );
  await painted(page);
  const paintedAt = performance.now() - started;
  return { data: await finished, painted: paintedAt };
}

/** Searches the properties list (Enter skips the 300 ms debounce). */
async function searchProperties(page, { images = false } = {}) {
  const before = await firstRowCode(page);
  const field = page.getByPlaceholder(PROPERTY_SEARCH_PLACEHOLDER, { exact: true });
  await field.fill(PAGE_SEARCH);
  const traffic = images ? trackApi(page, { quietMs: 1000 }) : undefined;
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
  const result = { data, painted: performance.now() - started };
  if (!images) return result;
  await rowImagesPainted(page);
  return { ...result, imagesPainted: performance.now() - started, traffic: await traffic() };
}

/**
 * Counts the API response bodies a step downloads. The returned function
 * waits until no API request has been in flight for 150 ms (at most 5 s),
 * stops counting and returns the KB.
 */
function trackApiBytes(page) {
  const traffic = trackApi(page);
  return async () => (await traffic()).kb;
}

/**
 * Counts a step's API requests, its image file requests (an original or a
 * thumbnail) and the KB of the response bodies. The returned function waits
 * until no API request has been in flight for `quietMs` (at most 5 s
 * longer), stops counting and returns { requests, imageRequests, kb }.
 */
function trackApi(page, { quietMs = 150 } = {}) {
  const sizes = [];
  let requests = 0;
  let imageRequests = 0;
  let inFlight = 0;
  let lastChange = performance.now();
  const isApi = (request) => request.url().includes("/api/");
  const onRequest = (request) => {
    if (!isApi(request)) return;
    requests += 1;
    if (/\/images\/\d+\/(file|thumbnail)(\?|$)/.test(request.url())) imageRequests += 1;
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
    return { requests, imageRequests, kb: Math.round(bytes / 1024) };
  };
}

/** Types into a person picker until the matching option shows. */
async function searchPicker(page, label, name) {
  const bytes = trackApiBytes(page);
  const field = page.getByRole("combobox", { name: label, exact: true });
  const started = performance.now();
  await field.fill(name);
  await page.getByRole("option", { name, exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  const shown = performance.now() - started;
  await page.keyboard.press("Escape");
  return { shown, kb: await bytes() };
}

/**
 * On the rental requests list: "add" → the form on screen, then a click on
 * the customer field → its first option on screen. Closes the form again.
 */
async function openRequestForm(page) {
  await openList(page, "#/rental-requests", LIST_REQUEST.rentalRequests, "PERF-RQ", 1);
  const bytes = trackApiBytes(page);
  let started = performance.now();
  await page.getByRole("button", { name: "إضافة طلب إيجار", exact: true }).click();
  const dialog = page.getByRole("dialog");
  // The field, not its input: older builds use a v-select, whose input is
  // not "visible" to Playwright.
  const customer = dialog
    .locator(".v-input")
    .filter({ has: page.locator(".v-label", { hasText: /^\s*العميل\s*$/ }) })
    .first();
  await customer.waitFor({ state: "visible", timeout: 60_000 });
  await painted(page);
  const open = performance.now() - started;
  started = performance.now();
  await customer.locator(".v-field").click();
  await page.locator(".v-overlay--active [role=option]").first().waitFor({ state: "visible", timeout: 60_000 });
  await painted(page);
  const customers = performance.now() - started;
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 60_000 });
  return { open, customers, kb: await bytes() };
}

/**
 * Opens an edit form; `ready` when the owner's name is filled in. With
 * `ownerPicker`, `owner` is when that picker shows the linked person's name.
 */
async function openEditForm(page, hash, ownerPicker) {
  const bytes = trackApiBytes(page);
  const started = performance.now();
  await page.evaluate((target) => (location.hash = target), hash);
  const ownerName = page.getByLabel("اسم المالك", { exact: true });
  const deadline = Date.now() + 60_000;
  while (!(await ownerName.inputValue({ timeout: 60_000 })).trim()) {
    if (Date.now() > deadline) throw new Error(`${hash}: the form was not filled in`);
    await sleep(10);
  }
  await painted(page);
  const ready = performance.now() - started;
  let owner;
  if (ownerPicker) {
    await page
      .locator(".v-input")
      .filter({ hasText: ownerPicker })
      .locator(".v-autocomplete__selection")
      .filter({ hasText: "زبون" })
      .waitFor({ state: "visible", timeout: 60_000 });
    owner = performance.now() - started;
  }
  return { ready, owner, kb: await bytes() };
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
  if (result.memoryFresh) {
    console.log("Fresh profile: memory and idle CPU on the properties list:");
    console.table(result.memoryFresh.idleOnProperties);
  }
  if (result.memory) {
    console.log("Memory and idle CPU at login form:");
    console.table(result.memory.idleAtLogin);
    console.log("Memory and idle CPU on dashboard:");
    console.table(result.memory.idleOnDashboard);
    console.log("Memory and idle CPU on the properties list:");
    console.table(result.memory.idleOnProperties);
    console.log("Memory and idle CPU on the people list:");
    console.table(result.memory.idleOnPeople);
    console.log("Memory and idle CPU on the documents list:");
    console.table(result.memory.idleOnDocuments);
  }
}
