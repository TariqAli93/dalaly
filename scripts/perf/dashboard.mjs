// API cost of the dashboard against a seeded throwaway database: the old
// summary and the operational dashboard's overview and matching requests,
// one after another and from four clients at once.
//
//   node scripts/perf/dashboard.mjs [--server server/dist/index.js]
//        [--label name] [--properties 5000] [--requests 0.1]
//
// --requests is the open purchase and rental requests per property (each).
// The shared seed's requests state only a property type, so every request
// matches every available listing of its type: the most pairs the matching
// query can meet for that many requests. Results go to
// perf-results/<label>-dashboard.json.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  ADMIN,
  api,
  createDatabase,
  dropDatabase,
  freePort,
  makeTempDir,
  query,
  root,
  seedDataset,
  startApi,
  stats,
  stopProcess,
  timeRequests,
  waitForHealth,
} from "./lib.mjs";

const { values: options } = parseArgs({
  args: process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--")),
  options: {
    server: { type: "string", default: "server/dist/index.js" },
    label: { type: "string", default: "dashboard" },
    properties: { type: "string", default: "5000" },
    requests: { type: "string", default: "0.1" },
  },
});

const serverEntry = path.resolve(root, options.server);
if (!fs.existsSync(serverEntry)) throw new Error(`No API bundle at ${serverEntry}`);
const label = options.label.replace(/[^A-Za-z0-9._-]+/g, "-");
const propertyCount = Number(options.properties);
const sizes = {
  properties: propertyCount,
  rentals: Math.round(propertyCount * 0.4),
  people: Math.round(propertyCount * 0.3),
  requests: Math.round(propertyCount * Number(options.requests)),
  documents: Math.round(propertyCount * 0.6),
  auditLogs: propertyCount * 4,
};
const app = { exe: process.execPath, serverEntry, migrations: path.join(root, "server/drizzle") };
const results = {
  label,
  server: serverEntry,
  measuredAt: new Date().toISOString(),
  machine: { platform: process.platform, node: process.version },
  dataset: sizes,
};

const OVERVIEW = "/dashboard/overview?stale_days=30";
const MATCHING = "/dashboard/matching?kind=all&page=1&page_size=8";

/** Four clients each sending `send` 25 times, as office PCs opening the dashboard. */
async function concurrently(send, clients = 4, each = 25) {
  const samples = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: clients }, async () => {
      for (let i = 0; i < each; i += 1) {
        const t = performance.now();
        await send();
        samples.push(performance.now() - t);
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  return { ...stats(samples), requestsPerSecond: Math.round((samples.length / seconds) * 10) / 10 };
}

const temporary = makeTempDir(label);
let databaseName;
let apiChild;
try {
  databaseName = await createDatabase();
  const port = await freePort();
  apiChild = startApi(app, { databaseName, port, dataDir: temporary });
  await waitForHealth(
    port,
    (health) => health.startup_state === "SETUP_REQUIRED" && health.startup_reason === "ADMIN_REQUIRED",
  );
  await api(port, "/auth/setup-admin", { method: "POST", body: ADMIN });
  await seedDataset(databaseName, sizes);
  // Follow-ups for the appointments and viewings sections: one per 10
  // listings, spread from 40 days ago to 10 days ahead.
  await query(
    databaseName,
    `INSERT INTO property_followups(property_id, type, scheduled_at, created_at)
     SELECT id, CASE WHEN id % 3 = 0 THEN 'visit' ELSE 'phone_call' END,
            now() + make_interval(hours => (id % 1200)::int - 960), now() - make_interval(days => 41)
     FROM properties WHERE id % 10 = 0`,
  );
  const pairs = await query(
    databaseName,
    `SELECT (SELECT count(*) FROM purchase_requests r JOIN properties o ON o.status = 'available' AND o.property_type = r.property_type) AS sale,
            (SELECT count(*) FROM rental_requests r JOIN rentals o ON o.status = 'available' AND o.property_type = r.property_type) AS rental`,
  );
  results.pairs = { sale: Number(pairs.rows[0].sale), rental: Number(pairs.rows[0].rental) };
  console.log(`Seeded ${databaseName}`, results.dataset, "request × listing pairs", results.pairs);

  await stopProcess(apiChild);
  apiChild = startApi(app, { databaseName, port, dataDir: temporary });
  await waitForHealth(port, (health) => health.startup_state === "READY");
  const { body: session } = await api(port, "/auth/login", { method: "POST", body: ADMIN });
  const token = session.token;
  const get = (pathname) => () => api(port, pathname, { token });

  const endpoints = {
    "GET /dashboard/summary": "/dashboard/summary",
    "GET /dashboard/overview": OVERVIEW,
    "GET /dashboard/matching (all)": MATCHING,
    "GET /dashboard/matching (sale)": "/dashboard/matching?kind=sale&page=1&page_size=8",
    "GET /dashboard/matching (rental, page 3)": "/dashboard/matching?kind=rental&page=3&page_size=8",
    "GET /dashboard/matching (search)": `/dashboard/matching?q=${encodeURIComponent("زبون 12")}`,
  };
  results.sequential = {};
  for (const [name, pathname] of Object.entries(endpoints)) {
    results.sequential[name] = await timeRequests(get(pathname), { warmup: 3, count: 20 });
    console.log(name, results.sequential[name]);
  }
  // What the dashboard sends when it opens: before, the summary; now,
  // overview and matching at once.
  results.opening = {
    before: await timeRequests(get("/dashboard/summary"), { warmup: 3, count: 20 }),
    after: await timeRequests(() => Promise.all([get(OVERVIEW)(), get(MATCHING)()]), { warmup: 3, count: 20 }),
  };
  console.log("Opening the dashboard", results.opening);
  results.concurrent = {
    before: await concurrently(get("/dashboard/summary")),
    after: await concurrently(() => Promise.all([get(OVERVIEW)(), get(MATCHING)()])),
  };
  console.log("Four clients opening the dashboard", results.concurrent);
} finally {
  if (apiChild) await stopProcess(apiChild);
  if (databaseName) await dropDatabase(databaseName);
  fs.rmSync(temporary, { recursive: true, force: true });
}

const outputFile = path.join(root, "perf-results", `${label}-dashboard.json`);
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(results, null, 2)}\n`);
console.log(`Wrote ${outputFile}`);
