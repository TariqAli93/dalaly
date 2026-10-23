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
  ["Dashboard → properties list data (median ms)", (r) => r.startup?.repeat.dashboardToPropertiesData?.median],
  ["Dashboard → properties list painted (median ms)", (r) => r.startup?.repeat.dashboardToPropertiesPainted?.median],
  ["Properties search → data (median ms)", (r) => r.startup?.repeat.propertiesSearchData?.median],
  ["Properties search → painted (median ms)", (r) => r.startup?.repeat.propertiesSearchPainted?.median],
  ["Properties → rentals list painted (median ms)", (r) => r.startup?.repeat.propertiesToRentalsPainted?.median],
  ["Memory on properties list, all processes (working set MB)", (r) => r.startup?.memory?.idleOnProperties?.total.workingSetMB],
  ["Memory on properties list, all processes (private MB)", (r) => r.startup?.memory?.idleOnProperties?.total.privateMB],
  ["Memory on properties list, renderer (private MB)", (r) => r.startup?.memory?.idleOnProperties?.Tab?.privateMB],
  ["Idle CPU on properties list, all processes (%)", (r) => r.startup?.memory?.idleOnProperties?.total.cpuPercent],
  // With --photos: every row's photo on screen, and what the step sent to the API.
  ...[
    ["Dashboard → properties list", "dashboardToProperties"],
    ["Properties search", "propertiesSearch"],
    ["Properties → rentals list", "propertiesToRentals"],
  ].flatMap(([step, prefix]) =>
    ["repeat", "fresh"].flatMap((mode) => [
      [`${step}: row photos painted, ${mode} (median ms)`, (r) => r.startup?.[mode][`${prefix}ImagesPainted`]?.median],
      [`${step}: API requests / image requests, ${mode}`, (r) => {
        const requests = r.startup?.[mode][`${prefix}Requests`];
        return requests && `${requests.median} / ${r.startup[mode][`${prefix}ImageRequests`].median}`;
      }],
      [`${step}: API downloads, ${mode} (median KB)`, (r) => r.startup?.[mode][`${prefix}ApiKB`]?.median],
    ]),
  ),
  ["Memory on properties list, fresh profile, renderer (private MB)", (r) => r.startup?.memoryFresh?.idleOnProperties?.Tab?.privateMB],
  ["Memory on properties list, fresh profile, all processes (private MB)", (r) => r.startup?.memoryFresh?.idleOnProperties?.total.privateMB],
  ["Idle CPU on properties list, fresh profile, all processes (%)", (r) => r.startup?.memoryFresh?.idleOnProperties?.total.cpuPercent],
  ["Rentals → people list data (median ms)", (r) => r.startup?.repeat.rentalsToPeopleData?.median],
  ["Rentals → people list painted (median ms)", (r) => r.startup?.repeat.rentalsToPeoplePainted?.median],
  ["Memory on people list, all processes (working set MB)", (r) => r.startup?.memory?.idleOnPeople?.total.workingSetMB],
  ["Memory on people list, renderer (private MB)", (r) => r.startup?.memory?.idleOnPeople?.Tab?.privateMB],
  ["People → person's properties data (median ms)", (r) => r.startup?.repeat.peopleToPersonPropertiesData?.median],
  ["People → person's properties painted (median ms)", (r) => r.startup?.repeat.peopleToPersonPropertiesPainted?.median],
  ["Person → rental requests painted (median ms)", (r) => r.startup?.repeat.personToRentalRequestsPainted?.median],
  ["Rental → purchase requests painted (median ms)", (r) => r.startup?.repeat.rentalToPurchaseRequestsPainted?.median],
  ["Purchase requests → documents data (median ms)", (r) => r.startup?.repeat.purchaseRequestsToDocumentsData?.median],
  ["Purchase requests → documents painted (median ms)", (r) => r.startup?.repeat.purchaseRequestsToDocumentsPainted?.median],
  ["Documents page: API downloads (KB)", (r) => r.startup?.repeat.documentsPageApiKB?.median],
  ["Memory on documents list, all processes (working set MB)", (r) => r.startup?.memory?.idleOnDocuments?.total.workingSetMB],
  ["Memory on documents list, renderer (private MB)", (r) => r.startup?.memory?.idleOnDocuments?.Tab?.privateMB],
  ["Documents person filter: typed → option shown (median ms)", (r) => r.startup?.repeat.documentsPersonSearchShown?.median],
  ["Documents person filter: API downloads (KB)", (r) => r.startup?.repeat.documentsPersonSearchApiKB?.median],
  ["Request form: add → form shown (median ms)", (r) => r.startup?.repeat.requestFormOpen?.median],
  ["Request form: customer list shown (median ms)", (r) => r.startup?.repeat.requestFormCustomersShown?.median],
  ["Request form: API downloads (KB)", (r) => r.startup?.repeat.requestFormApiKB?.median],
  ["Property edit form ready (median ms)", (r) => r.startup?.repeat.propertyEditReady?.median],
  ["Property edit form: API downloads (KB)", (r) => r.startup?.repeat.propertyEditApiKB?.median],
  ["Rental edit form ready (median ms)", (r) => r.startup?.repeat.rentalEditReady?.median],
  ["Rental edit form: owner shown (median ms)", (r) => r.startup?.repeat.rentalEditOwnerShown?.median],
  ["Rental edit form: API downloads (KB)", (r) => r.startup?.repeat.rentalEditApiKB?.median],
  ...Object.keys(results[0].api?.sequential ?? {}).map((name) => [
    `${name} (median / p95 ms)`,
    (r) => {
      const s = r.api?.sequential[name];
      return s && `${s.median} / ${s.p95}`;
    },
  ]),
  ...Object.keys(results[0].api?.pageRequests ?? {}).map((name) => [
    `${name} (median / p95 ms, KB)`,
    (r) => {
      const s = r.api?.pageRequests?.[name];
      return s && `${s.median} / ${s.p95}, ${Math.round(s.bytes / 1024)}`;
    },
  ]),
  ["4-client search (median / p95 ms)", (r) => r.api && `${r.api.concurrentSearch.median} / ${r.api.concurrentSearch.p95}`],
  ["4-client search (requests/s)", (r) => r.api?.concurrentSearch.requestsPerSecond],
  [
    "4-client search as the page sends it (median / p95 ms)",
    (r) => r.api?.concurrentPageSearch && `${r.api.concurrentPageSearch.median} / ${r.api.concurrentPageSearch.p95}`,
  ],
  ["4-client search as the page sends it (requests/s)", (r) => r.api?.concurrentPageSearch?.requestsPerSecond],
  [
    "4-client dashboard (median / p95 ms)",
    (r) => r.api?.concurrentDashboard && `${r.api.concurrentDashboard.median} / ${r.api.concurrentDashboard.p95}`,
  ],
  ["4-client dashboard (requests/s)", (r) => r.api?.concurrentDashboard?.requestsPerSecond],
  ...["GET /auth/me", "GET /dashboard/summary"].map((name) => [
    `${name} after a 12 s pause (median / max ms)`,
    (r) => {
      const s = r.api?.afterPause?.[name];
      return s && `${s.median} / ${s.max}`;
    },
  ]),
  [
    "API database connections after the pass / after a pause",
    (r) => r.api?.connections && `${r.api.connections.afterLoad} / ${r.api.connections.afterPause}`,
  ],
  ["API working set after load (MB)", (r) => r.api?.apiProcess.workingSetMBAfter],
  ["API CPU during API pass (s)", (r) => r.api?.apiProcess.cpuSecondsDuringRun],
];

const header = ["", ...results.map((r, i) => r.label ?? path.basename(files[i], ".json"))];
console.log(`| ${header.join(" | ")} |`);
console.log(`| ${header.map((_, i) => (i ? "---:" : "---")).join(" | ")} |`);
for (const [name, pick] of rows)
  console.log(`| ${[name, ...results.map((r) => pick(r) ?? "–")].join(" | ")} |`);
