// Prints a Markdown table comparing perf-results files side by side.
//
//   node scripts/perf/compare.mjs perf-results/main.json perf-results/branch.json
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass one or more perf-results/*.json files");
const results = files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));

const rows = [
  ["Startup, repeat profile: login form (median ms)", (r) => r.startup?.repeat.loginVisible.median],
  ["Startup, repeat profile: login form (max ms)", (r) => r.startup?.repeat.loginVisible.max],
  ["Startup, fresh profile: login form (median ms)", (r) => r.startup?.fresh.loginVisible.median],
  ["Startup, repeat: splash loaded (median ms)", (r) => r.startup?.repeat.splashLoaded.median],
  ["Startup, repeat: API READY (median ms)", (r) => r.startup?.repeat.apiReady.median],
  ["Login → dashboard painted (median ms)", (r) => r.startup?.repeat.loginToDashboardPainted.median],
  ["Memory at login form, all processes (working set MB)", (r) => r.startup?.memory?.idleAtLogin.total.workingSetMB],
  ["Memory on dashboard, all processes (working set MB)", (r) => r.startup?.memory?.idleOnDashboard.total.workingSetMB],
  ["Memory on dashboard, all processes (private MB)", (r) => r.startup?.memory?.idleOnDashboard.total.privateMB],
  ["Idle CPU on dashboard, all processes (%)", (r) => r.startup?.memory?.idleOnDashboard.total.cpuPercent],
  ...Object.keys(results[0].api?.sequential ?? {}).map((name) => [
    `${name} (median / p95 ms)`,
    (r) => {
      const s = r.api?.sequential[name];
      return s && `${s.median} / ${s.p95}`;
    },
  ]),
  ["4-client search (median / p95 ms)", (r) => r.api && `${r.api.concurrentSearch.median} / ${r.api.concurrentSearch.p95}`],
  ["4-client search (requests/s)", (r) => r.api?.concurrentSearch.requestsPerSecond],
  ["API working set after load (MB)", (r) => r.api?.apiProcess.workingSetMBAfter],
  ["API CPU during API pass (s)", (r) => r.api?.apiProcess.cpuSecondsDuringRun],
];

const header = ["", ...results.map((r, i) => r.label ?? path.basename(files[i], ".json"))];
console.log(`| ${header.join(" | ")} |`);
console.log(`| ${header.map((_, i) => (i ? "---:" : "---")).join(" | ")} |`);
for (const [name, pick] of rows)
  console.log(`| ${[name, ...results.map((r) => pick(r) ?? "–")].join(" | ")} |`);
