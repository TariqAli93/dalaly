// Prints a Markdown table comparing perf-results files side by side.
//
//   node scripts/perf/compare.mjs perf-results/main.json perf-results/branch.json
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass one or more perf-results/*.json files");
const results = files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));

// Requests a step sent (median over the repeat launches): list requests, of
// them aborted, all API requests, locations requests.
const REQUEST_STEPS = [
  ["Dashboard → properties", "dashboardToProperties"],
  ["Properties search (Enter)", "propertiesSearch"],
  ["Properties → rentals", "propertiesToRentals"],
  ["Properties list, later visit", "propertiesRevisit"],
  ["Top-bar search on the properties list", "topbarSearch"],
  ["Clear filters from the empty list", "clearFilters"],
  ["Top-bar search from the rentals list", "topbarSearchFromRentals"],
  ["Rentals list after a reload", "rentalsAfterReload"],
];
const requestRows = REQUEST_STEPS.map(([name, step]) => [
  `${name}: requests — list (aborted) · all API · locations`,
  (r) => {
    const mark = (kind) => r.startup?.repeat[`${step}${kind}Requests`]?.median;
    if (mark("List") === undefined) return undefined;
    return `${mark("List")} (${mark("Aborted")}) · ${mark("Api")} · ${mark("Locations")}`;
  },
]);

const rows = [
  ["Renderer JS, all files (KB)", (r) => r.bundle?.totalJsKB],
  ["Renderer JS, properties page chunk (KB)", (r) => r.bundle?.propertiesPageKB],
  ["Renderer JS, xlsx chunk (KB)", (r) => r.bundle?.xlsxChunkKB],
  ["Dashboard → properties: JS files loaded (KB)", (r) => r.startup?.repeat.dashboardToPropertiesScriptKB?.median],
  ...requestRows,
  ["Clear filters → list painted (median ms)", (r) => r.startup?.repeat.clearFiltersPainted?.median],
  ["Top-bar search from rentals → list painted (median ms)", (r) => r.startup?.repeat.topbarSearchFromRentalsPainted?.median],
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
  ["API working set after load (MB)", (r) => r.api?.apiProcess.workingSetMBAfter],
  ["API CPU during API pass (s)", (r) => r.api?.apiProcess.cpuSecondsDuringRun],
];

const header = ["", ...results.map((r, i) => r.label ?? path.basename(files[i], ".json"))];
console.log(`| ${header.join(" | ")} |`);
console.log(`| ${header.map((_, i) => (i ? "---:" : "---")).join(" | ")} |`);
for (const [name, pick] of rows)
  console.log(`| ${[name, ...results.map((r) => pick(r) ?? "–")].join(" | ")} |`);
