// Where startup time goes, launch by launch.
//
//   node scripts/perf/startup-trace.mjs --app <win-unpacked> [--runs 12]
//
// Seeds a throwaway dalaly_perf_* database like measure.mjs, launches the
// packaged app repeatedly with one profile, and lines up three clocks per
// launch, all as ms after launch: Electron main's log (main.log, which also
// carries the API's stdout), the renderer's Navigation/Paint timing, and the
// moment the login form is visible. Needs port 34567 free.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { _electron } from "@playwright/test";
import {
  ADMIN,
  api,
  cleanEnv,
  createDatabase,
  databaseUrl,
  dropDatabase,
  freePort,
  makeTempDir,
  packagedApp,
  portIsFree,
  seedDataset,
  sleep,
  startApi,
  stats,
  stopProcess,
  waitForHealth,
} from "./lib.mjs";

const { values: options } = parseArgs({
  options: {
    app: { type: "string" },
    runs: { type: "string", default: "12" },
  },
});
if (!options.app) throw new Error("--app <win-unpacked folder> is required");
const app = packagedApp(options.app);
const runs = Number(options.runs);
const APP_API_PORT = 34567;

/** main.log entries: one per timestamped line, with continuation lines. */
function readLog(file) {
  if (!fs.existsSync(file)) return [];
  const entries = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]/.exec(line);
    if (match)
      entries.push({ at: new Date(match[1].replace(" ", "T")).getTime(), text: line });
    else if (entries.length) entries.at(-1).text += `\n${line}`;
  }
  return entries;
}

function firstAt(entries, test) {
  return entries.find((entry) => test(entry.text))?.at;
}

const databaseName = await createDatabase();
const temporary = makeTempDir("trace");
let apiChild;
const launches = [];
try {
  const port = await freePort();
  apiChild = startApi(app, { databaseName, port, dataDir: temporary });
  await waitForHealth(port, (h) => h.startup_reason === "ADMIN_REQUIRED");
  await api(port, "/auth/setup-admin", { method: "POST", body: ADMIN });
  await seedDataset(databaseName, { properties: 5000, rentals: 2000, people: 1500, requests: 500, auditLogs: 20000 });
  await stopProcess(apiChild);
  apiChild = undefined;
  if (!(await portIsFree(APP_API_PORT))) throw new Error(`Port ${APP_API_PORT} is in use; close Dalaly first.`);

  const profile = path.join(temporary, "profile");
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, "config.json"), JSON.stringify({ databaseUrl: databaseUrl(databaseName) }));
  const logFile = path.join(profile, "logs", "main.log");

  for (let run = 0; run <= runs; run += 1) {
    fs.rmSync(logFile, { force: true });
    const t0 = Date.now();
    const electron = await _electron.launch({ executablePath: app.exe, args: [`--user-data-dir=${profile}`], env: cleanEnv(), timeout: 60_000 });
    const launched = Date.now();
    let page;
    while (!(page = electron.windows().find((w) => w.url().includes("/index.html")))) await sleep(10);
    await page.getByLabel("اسم المستخدم", { exact: true }).waitFor({ state: "visible", timeout: 60_000 });
    const loginVisible = Date.now();
    const renderer = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paint = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, e.startTime]));
      const resources = performance
        .getEntriesByType("resource")
        .map((r) => ({
          name: r.name.split(/[\\/]/).pop().replace(/-[\w-]{8}\.(js|css)$/, ".$1"),
          start: Math.round(r.startTime),
          end: Math.round(r.responseEnd),
        }));
      return {
        timeOrigin: performance.timeOrigin,
        domContentLoaded: nav?.domContentLoadedEventEnd,
        load: nav?.loadEventEnd,
        firstContentfulPaint: paint["first-contentful-paint"],
        now: performance.now(),
        resources,
        marks: Object.fromEntries(
          performance.getEntriesByType("mark").map((m) => [m.name.replace("dalaly:", ""), Math.round(m.startTime)]),
        ),
      };
    });
    await electron.close();
    while (!(await portIsFree(APP_API_PORT))) await sleep(50);
    await sleep(300); // let electron-log flush
    const log = readLog(logFile);
    const rel = (at) => (at === undefined ? null : at - t0);
    const apiReady = firstAt(log, (t) => t.includes("[api stdout]") && t.includes("Startup state transition") && /to: '?READY/.test(t));
    const mainReady = firstAt(log, (t) => !t.includes("[api stdout]") && t.includes("Startup state transition") && /to: '?READY/.test(t));
    const launch = {
      launched: launched - t0,
      splashReady: rel(firstAt(log, (t) => t.includes("Splash window ready"))),
      apiSpawned: rel(firstAt(log, (t) => t.includes("Starting local API"))),
      apiListening: rel(firstAt(log, (t) => t.includes("API listening"))),
      dbPrepared: rel(firstAt(log, (t) => t.includes("Database prepared"))),
      apiReady: rel(apiReady),
      mainSawReady: rel(mainReady),
      readyNoticedAfter: apiReady && mainReady ? mainReady - apiReady : null,
      rendererNavStart: Math.round(renderer.timeOrigin - t0),
      domContentLoaded: Math.round(renderer.timeOrigin + renderer.domContentLoaded - t0),
      firstContentfulPaint: renderer.firstContentfulPaint ? Math.round(renderer.timeOrigin + renderer.firstContentfulPaint - t0) : null,
      loginVisible: loginVisible - t0,
      startupComplete: rel(firstAt(log, (t) => t.includes("Startup complete"))),
    };
    if (run === 0) continue; // warm-up launch populates the profile
    launches.push(launch);
    console.log(`#${run}`, JSON.stringify(launch));
    // Renderer resources, ms after the main window's navigation start.
    console.log(
      `   renderer: DCL ${Math.round(renderer.domContentLoaded)} marks ${JSON.stringify(renderer.marks)} login ${Math.round(renderer.now)}`,
      renderer.resources.map((r) => `${r.name} ${r.start}-${r.end}`).join(", "),
    );
  }
} finally {
  await stopProcess(apiChild);
  await dropDatabase(databaseName);
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log("\nPer mark over all launches (ms after launch):");
const marks = Object.keys(launches[0]);
console.table(Object.fromEntries(marks.map((mark) => [mark, stats(launches.map((l) => l[mark]).filter((v) => v !== null))])));
