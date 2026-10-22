# Performance measurements

`pnpm perf` measures a **packaged** build the way users run it, against a
seeded throwaway database, so results can be compared between builds.

```bash
pnpm build
pnpm --filter @dalaly/desktop exec electron-builder --win --dir --publish never
pnpm perf -- --app apps/desktop/release/win-unpacked --label my-change
```

Options: `--runs 8` (launches per startup mode), `--properties 5000`
(dataset size; rentals, people, requests and audit rows scale with it),
`--skip-api`, `--skip-startup`. Results are written to
`perf-results/<label>.json` (git-ignored) and printed as tables. To compare
builds side by side as a Markdown table:

```bash
node scripts/perf/compare.mjs perf-results/main.json perf-results/my-change.json
```

Alternate builds when comparing (A, B, A, B) so drift in machine state does
not favour whichever ran second.

## What it does

1. Creates `dalaly_perf_<timestamp>` on the local PostgreSQL (`DB_*` from
   `.env`), starts the packaged API from the build (`<app>.exe` with
   `ELECTRON_RUN_AS_NODE`, exactly as Electron spawns it) so the build's own
   migrations run, creates an administrator through the setup endpoint and
   seeds a deterministic dataset. The database is dropped and temporary
   folders removed at the end, also on failure; the drop refuses any name
   other than `dalaly_perf_<digits>`.
2. **API pass**: restarts the API on the seeded data, logs in, then for each
   endpoint sends 3 warm-up and 30 sequential requests and reports
   median/p95/max and response size. The same is done for the request each
   list page sends for a given action — properties open, search `بغداد`,
   sort by area, last page; rentals open. Builds with server paging send one
   page from `/properties/paged` or `/rentals/paged`; older builds download
   the whole list for every one of those actions and sort and page it in the
   renderer, so their row is the full-list request. Then 4 parallel clients
   send 15 searches each (throughput and latency under contention), once as
   `GET /properties?search=…` (comparable with older results) and once in
   the form the properties page sends. API working set, private memory and
   CPU time are read before and after.
3. **Startup pass** (needs port 34567 free — close Dalaly first; the
   renderer's API base is fixed to that port): launches the packaged app with
   Playwright, alternating two modes, `--runs` times each:
   - **fresh**: a new profile every launch (first run after install);
   - **repeat**: the same profile every launch (normal daily start).

   Marks, in ms from just before launch: `launched` (Playwright attached),
   `splashLoaded`, `apiReady` (first `/api/health` READY, polled every
   25 ms), `loginVisible` (login form on screen: time to interactive),
   `splashClosed`, then after clicking login `loginToDashboardData`
   (dashboard response received) and `loginToDashboardPainted` (two frames
   later). From the dashboard it opens the properties list, searches it for
   `بغداد` (with Enter, so the 300 ms filter debounce is not counted) and
   opens the rentals list: `dashboardToProperties…`, `propertiesSearch…` and
   `propertiesToRentals…`, each as `…Data` (list response fully received)
   and `…Painted` (the new first row on screen, two frames later). On the
   first repeat launch it samples every Electron process
   (`app.getAppMetrics()`) plus the API child: working set, private memory
   and CPU over 10 s idle, at the login form, on the dashboard and on the
   properties list.

## Limits

- It is not a true cold boot: the Windows file cache stays warm between
  launches. "fresh" isolates Chromium profile and code-cache effects only.
- Playwright's debugger attach adds a constant overhead to `launched`; compare
  builds with each other, not with a stopwatch.
- Single machine, small samples (median/max over `--runs`). Treat
  differences below roughly 10% of the median as noise unless repeated runs
  agree.
- The API pass drains the API's stdout like Electron does but does not write
  it to electron-log, so log-volume costs in the main process show up only in
  the startup pass.
- Keep the packaged build in a short folder (the default
  `apps/desktop/release`, or `perf-results/…`). The same build that worked
  from a short folder failed from a 174-character one: the renderer could
  not load its lazy login chunk (`ERR_FILE_NOT_FOUND`, a 227-character file
  path) and the startup pass stopped before the login form.
- electron-builder runs `pnpm install` itself. In a checkout on `C:` (this
  machine's pnpm store is on `D:`) that step never finished; building in a
  checkout on the store's drive worked. To build another commit, a detached
  checkout in the same worktree is enough when the lockfile is unchanged.

## Baseline, October 2026

Machine: the development PC (Windows 11, PostgreSQL 18 local), so absolute
numbers are lower than an office's low-end hardware would show; use them for
relative comparisons and for finding where time goes. Dataset: 5,000
properties, 2,000 rentals, 1,500 people, 500 + 500 requests, 20,000 audit
rows. Builds: `main` before the first optimization batch (`a1b5e08`) and after
it (`c798039`, merged as PR 2), measured alternately in two rounds, 8 launches
per mode each.

|                                                             |  before r1 |   after r1 |  before r2 |   after r2 |
| ----------------------------------------------------------- | ---------: | ---------: | ---------: | ---------: |
| Login form visible, repeat profile (median ms)              |       2120 |       2228 |       2053 |       2119 |
| Login form visible, fresh profile (median ms)               |       2079 |       2095 |       2071 |       2085 |
| — Playwright launch + attach (`launched`)                   |       1029 |       1020 |       1003 |       1011 |
| — splash loaded                                             |       1218 |       1235 |       1197 |       1212 |
| — API READY                                                 |       1563 |       1580 |       1541 |       1527 |
| Login click → dashboard data (median ms)                    |        540 |        525 |        534 |        527 |
| Login click → dashboard painted (median ms)                 |       1098 |       1083 |       1090 |       1067 |
| Working set, all 5 processes, login form (MB)               |        485 |        480 |        488 |        479 |
| Working set, all 5 processes, dashboard (MB)                |        539 |        536 |        540 |        534 |
| Private memory, all processes, dashboard (MB)               |        402 |        391 |        400 |        391 |
| Idle CPU on dashboard, all processes (%)                    |        2.7 |        2.0 |        2.7 |        2.2 |
| `GET /properties`, all 5,000 rows, 4.9 MB (median / p95 ms) |  340 / 409 |  311 / 347 |  310 / 343 |  311 / 345 |
| `GET /properties?search=بغداد` (median / p95 ms)            |  125 / 181 |  134 / 179 |  133 / 163 |  135 / 187 |
| `GET /dashboard/summary` (median / p95 ms)                  |   74 / 114 |   90 / 123 |   94 / 169 |   86 / 151 |
| `GET /rentals`, 2,000 rows (median ms)                      |        105 |        108 |        105 |        104 |
| `GET /auth/me` (median ms)                                  |        5.8 |        5.4 |        5.1 |        5.9 |
| 4 parallel clients searching (median / p95 ms)              | 944 / 1182 | 951 / 1197 | 945 / 1189 | 946 / 1189 |
| 4 parallel clients searching (requests/s)                   |        4.2 |        4.1 |        4.2 |        4.2 |
| API working set, idle → after API pass (MB)                 |   82 → 218 |   82 → 199 |   82 → 239 |   82 → 238 |

Memory split on the dashboard (after, round 2): browser/main 117 MB, GPU
115 MB, utility 51 MB, renderer 159 MB, API 92 MB (working set).

Package size, same two builds: NSIS installer 114,107,209 B → 101,187,082 B
(−12.9 MB, −11.3%), built with `electron-builder --win nsis --prepackaged`
from each `win-unpacked`; unpacked app 411.5 MB → 359.4 MB.

### Reading it

- **The first batch did not change speed measurably.** Startup, API latency
  and memory moved by less than the run-to-run spread; the "after" login
  time was 3–5% higher in both rounds, below the 10% noise threshold. Private
  memory (−10 MB) and idle CPU (−0.5 to −0.7 points) were lower in both
  rounds. Its value was correctness, security and package size.
- **Startup**: of ~2.1 s to an interactive login form, about 1.0 s is process
  start plus the harness attaching. After the API is READY it takes another
  ~0.55 s to open the main window, load the renderer and route to the login
  page. That window has not been profiled yet; the renderer's 555 KB main
  chunk and ~870 KB of CSS (Vuetify plus the full icon-font CSS) are the
  likely bulk of it and the target of Vuetify tree-shaking and an SVG icon
  subset — re-measure after those to confirm.
- **Dashboard**: data arrives ~0.53 s after the login click (login with scrypt,
  three auth queries, route chunk, summary query), then rendering it takes
  another ~0.55 s. The rendering half is renderer work, not database work.
- **Properties list**: the page downloads all 5,000 rows (4.9 MB of JSON,
  ~310 ms on the API alone, plus parsing and deep reactivity in the
  renderer) on every visit and filter change. Server-side pagination is the
  largest single win for big offices. (Done for properties and rentals; see
  "Server pagination" below.)
- **Search under concurrency** is CPU-bound (~33 s of API CPU for the pass):
  4 clients get ~1 s per search. Fine for one desk, poor for an office using
  remote access.
- **API memory** grows from ~82 MB to 200–240 MB while serving the large
  lists and stays there at the end of the pass. Whether that is live heap or
  uncollected garbage has not been measured; smaller responses would cut it
  either way.

## Server pagination, October 2026

Builds: `main` at `56ace8d` against the server-paging branch at `04fbfdd`
(properties and rentals pages on `/paged` endpoints and
`v-data-table-server`), both measured with the branch's harness, alternately
in two rounds (A, B, A, B), 8 launches per mode, same dataset as the
baseline. Same development PC, but a different day: absolute numbers are
lower than in the baseline above (for example `GET /properties` ~139 ms
here, ~311 ms there), so compare only within this table.

|                                                                     |      main r1 |    paged r1 |      main r2 |    paged r2 |
| ------------------------------------------------------------------- | -----------: | ----------: | -----------: | ----------: |
| Properties page: open — request (median ms · response KB)           | 138.2 · 4801 |    8.6 · 11 | 130.9 · 4801 |    6.3 · 11 |
| Properties page: search `بغداد` — request (median ms · KB)          |   72.3 · 881 |   51.8 · 11 |   58.3 · 881 |   31.4 · 11 |
| Properties page: sort by area — request (median ms)                 |        142.2 |         8.4 |        129.8 |         7.6 |
| Properties page: last page — request (median ms)                    |        152.9 |         8.9 |        131.7 |         7.2 |
| Rentals page: open — request (median ms · KB)                       |  46.8 · 1441 |     4.3 · 7 |  43.3 · 1441 |     3.4 · 7 |
| 4 clients searching as the page does (median ms · requests/s)       |  548.9 · 6.8 | 59.3 · 63.9 |  438.8 · 9.0 | 60.0 · 63.6 |
| 4 clients, `GET /properties?search=` (unchanged; median ms · req/s) |  563.8 · 6.7 | 434.3 · 8.5 |  432.7 · 9.0 | 437.7 · 9.1 |
| API CPU during the API pass (s)                                     |         38.3 |        15.7 |         33.5 |        14.5 |
| Dashboard → properties list, response received (median ms)          |        334.7 |       164.5 |        316.0 |       164.7 |
| Dashboard → properties list painted (median ms)                     |        531.7 |       281.5 |        501.3 |       283.8 |
| Properties search (Enter) → painted (median ms)                     |        199.5 |       145.3 |        194.7 |       147.7 |
| Properties → rentals list painted (median ms)                       |        304.7 |       222.0 |        296.6 |       226.0 |
| Properties list, all processes: working set / private (MB)          |    610 / 470 |   552 / 420 |    604 / 478 |   553 / 429 |
| Properties list, renderer process: private (MB)                     |        122.9 |        99.7 |        120.2 |       100.6 |
| Idle CPU on the properties list, all processes (%)                  |          1.4 |         1.9 |          1.1 |         1.3 |
| Dashboard, all processes: working set (MB)                          |        533.6 |       532.5 |        529.2 |       529.8 |
| Login click → dashboard painted (median ms)                         |          556 |         556 |          553 |         548 |
| Login form visible, repeat profile (median ms)                      |         1429 |        1031 |         1431 |        1116 |
| Login form visible, fresh profile (median ms)                       |         1151 |        1412 |         1121 |        1418 |
| API working set after the API pass (MB)                             |          242 |         270 |          255 |         252 |

`node scripts/perf/compare.mjs perf-results/main-r1.json …` prints every
row; the ones above are the ones this change could affect.

### What improved

- **List requests**: every properties-page action (open, sort, page
  change) now costs one query returning 10 rows, ~6–9 ms and 11 KB, instead
  of ~130–155 ms and 4.8 MB for all 4,500 listed rows. Sorting by area and jumping
  to the last of 450 pages cost the same as the first page. Rentals: ~4 ms
  and 7 KB instead of ~45 ms and 1.4 MB.
- **Opening the properties list** from the dashboard paints in ~283 ms
  instead of ~500–530 ms (−43% to −47%). Of the ~165 ms still spent before the list
  response arrives, the list request itself is ~7 ms; the rest (route chunk,
  page mount, the locations request) has not been profiled. A search paints
  in ~146 ms instead of ~197 ms (−25%), the rentals list in ~224 ms instead
  of ~300 ms (−25%).
- **Memory on the properties list**: 51–58 MB less working set and about
  50 MB less private memory across the processes, 20–23 MB less private
  memory in the renderer.
- **Searching from several desks**: 4 clients searching the way the
  properties page searches get ~60 ms instead of ~440–550 ms, ~64 instead
  of 7–9 requests/s, because only one page of matches is serialized and
  sent. API CPU for the whole API pass fell from 33.5–38.3 s to 14.5–15.7 s; the
  passes differ exactly in those list requests.

### What did not improve

- **Search itself**: the paged search still evaluates the per-token `ILIKE`
  over every row; `بغداد` takes 31–52 ms per request instead of 58–72 ms,
  and the old-form 4-client search (`GET /properties?search=`) is unchanged
  at 433–564 ms. The search rewrite (roadmap Phase 2.7) is still needed.
- **Startup to the login form**: unchanged. On this machine each launch
  lands either at ~1.0–1.15 s or at ~1.4–1.7 s, and a median of 8 flips
  between the two; that is why the repeat median looks 300–400 ms faster and
  the fresh median 260–300 ms slower for the paged build in both rounds.
  Pooled over all 32 launches per build: median 1418 ms with 17 slow
  launches on `main`, 1398 ms with 18 on the branch. The cause of the
  ~400 ms step has not been investigated; until it is, compare startup on
  pooled launches, not on the per-mode medians.
- **Dashboard** (login → painted, memory): unchanged, as expected — it loads
  no list.
- **API memory after the API pass** (242–270 MB in all four runs): the
  harness's sequential section still requests the full lists on both builds,
  so it does not show what the pages no longer request.
- **The full-list endpoints** are unchanged (`GET /properties` ~139 ms,
  `GET /rentals` 43–53 ms); person details still downloads every property to
  filter by owner, and people, requests and documents are not paged yet.
- Idle CPU on the properties list stayed between 1.1% and 1.9%, within
  noise.

## Renderer startup and dashboard, October 2026

Profiled first with `scripts/perf/startup-trace.mjs` (per-launch timeline
from `main.log`, the renderer's startup marks and the login form), then
changed only what the trace and a CPU profile pointed at. Same development
PC and dataset; builds: `main` at `d8310e8` and branch
`perf/renderer-startup`, measured alternately.

### What the profile showed

- **The ~400 ms startup step was the health poll.** The database finished
  preparing 0.74–0.85 s after launch in every traced launch, but Electron
  polled `/api/health` every 350 ms and opened the main window only after a
  poll saw `READY`: database-ready → window start was either 22–31 ms or
  309–413 ms. Everything after that (≈120 ms to evaluate the renderer, ≈160 ms
  to the login form) was the same in fast and slow launches.
- **Renderer, after navigation start:** module evaluation ≈115 ms (all of
  Vuetify plus ~870 KB of CSS), the router's own health request ≈45 ms
  (a fresh PostgreSQL connection per call), login chunk ≈5 ms, mount ≈27 ms.
- **The splash's ~270 ms to DOMContentLoaded is not the icon CSS:** a build
  without the icon font stylesheet (splash CSS 590 KB → 274 KB) measured
  240–300 ms against 265–285 ms. Not changed; the remaining time could not
  be separated from Playwright attaching to Electron during that window.
- **Dashboard:** after its data arrived, ~255 ms passed before paint. A CPU
  profile put ~30 ms in `getComputedStyle` called by Chart.js while creating
  its canvases (a forced style recalculation of the freshly rendered page),
  and the page's first paint waited for both charts. The dashboard's DOM is
  small (~1,000 elements), so less DOM was not the lever.

### Changes and their effect

| Change                                                        | Measure                                                                          |              Before |               After |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------: | ------------------: |
| Health wait (`/api/health?wait=1` after the first `CHECKING`) | database ready → window start, 12 launches each                                  | 22–31 or 309–413 ms | 48–62 or 123–165 ms |
| Vuetify auto-import (`vite-plugin-vuetify`)                   | main-window startup JS / CSS                                                     |     719 KB / 850 KB |     328 KB / 628 KB |
|                                                               | module evaluation after navigation start, 12 launches each, alternating          |          115–125 ms |           92–107 ms |
| Charts drawn one frame after the page paints                  | login click → dashboard content painted (Element Timing), 2 rounds × 12 launches |          530–556 ms |          369–405 ms |
|                                                               | login click → charts drawn                                                       |          373–402 ms |          376–409 ms |

Whole build, `main` against the branch, two alternating rounds:

|                                                     |     main r1 |   branch r1 |     main r2 |   branch r2 |
| --------------------------------------------------- | ----------: | ----------: | ----------: | ----------: |
| Login form, repeat profile (median / max ms)        | 1292 / 1560 | 1183 / 1418 | 1203 / 1522 | 1089 / 1257 |
| Login form, fresh profile (median ms)               |        1439 |        1152 |        1247 |        1248 |
| Login click → dashboard painted (median ms)         |         549 |         412 |         521 |         415 |
| Login click → dashboard content painted (median ms) |           – |     384–402 |           – |     387–392 |
| Working set on dashboard, all processes (MB)        |         557 |         548 |         549 |         550 |

Pooled over 12 traced launches per build, login form visible: `main`
1016 / 1169 / 1446 / 1596 ms (min / median / p90 / max), branch
1031 / 1182 / 1261 / 1429 ms; mean 1260 → 1182 ms.

### Reading it

- **Startup:** the slow launches are gone (p90 −185 ms, max −170 ms, mean
  −80 ms) but the median launch did not change on this PC: half the launches
  were already in the fast group. The gains scale with how long database
  preparation takes, so slower office PCs should benefit more; that has not
  been measured.
- **Vuetify tree-shaking** saves ~20 ms of module evaluation here. On a
  slower CPU the saving should be proportionally larger (not measured).
- **Dashboard:** its figures and lists appear ~150 ms sooner; the charts
  arrive when they did before.
- **Not changed:** API, memory and idle CPU (within noise), the splash,
  and the router's health request (~45 ms); passing Electron's health
  result to the renderer would remove it but needs a new IPC path.
