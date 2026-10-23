# Performance measurements

`pnpm perf` measures a **packaged** build the way users run it, against a
seeded throwaway database, so results can be compared between builds.

```bash
pnpm build
pnpm --filter @dalaly/desktop exec electron-builder --win --dir --publish never
pnpm perf -- --app apps/desktop/release/win-unpacked --label my-change
```

Options: `--runs 8` (launches per startup mode), `--properties 5000`
(dataset size; rentals, people, requests, documents and audit rows scale
with it), `--photos 3` (photos per property and rental: synthetic
12-megapixel JPEGs of 3–4.5 MB, hard links to 24 sources cached in the temp
folder; none by default),
`--skip-api`, `--skip-startup`. Results are written to
`perf-results/<label>.json` (git-ignored) and printed as tables. To compare
builds side by side as a Markdown table:

```bash
node scripts/perf/compare.mjs perf-results/main.json perf-results/my-change.json
```

Alternate builds when comparing (A, B, A, B) so drift in machine state does
not favour whichever ran second.

When port 34567 is taken (Dalaly or `pnpm dev` running), the startup pass
cannot run; the results file then holds the API pass only, with
`startupSkipped`, and the command exits with code 1. The API pass is also
written before the startup pass begins, so a failed launch keeps it. `scripts/perf/tables.mjs` measures the properties and rentals
tables, with photos, in Playwright's Chromium instead: it serves the build's
renderer over HTTP and sends its requests for 127.0.0.1:34567 to the build's
API on a free port.

```bash
node scripts/perf/tables.mjs --app apps/desktop/release/win-unpacked --label my-change --runs 5
```

It is Chromium, not Electron, and request routing turns the HTTP cache off;
compare its results only with its own.

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
   median/p95/max and response size. The same is done for the requests
   each list page sends for a given action — properties open, search
   `بغداد`, sort by area, last page; rentals open; a person's properties;
   people, rental requests, purchase requests and documents open. Builds
   with server paging send one page from `/<domain>/paged`; older builds
   download the whole list for every one of those actions and sort and page
   it in the renderer, so their row is the full-list request (for person
   details both full property lists, for the requests pages the list and
   then every person, as those pages sent them). What a build supports is
   probed once after seeding. Then 4 parallel clients
   send 15 searches each (throughput and latency under contention), once as
   `GET /properties?search=…` (comparable with older results) and once in
   the form the properties page sends, and once more loading
   `/dashboard/summary`. API working set, private memory and CPU time are
   read before and after. Last, `GET /auth/me` and `GET /dashboard/summary`
   are timed 6 times each after a 12 s pause with no requests (longer than
   pg's default 10 s idle timeout, after which the next request waits for a
   new database connection), and the API's connections to the database are
   counted after the load and after the pauses.
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
   and `…Painted` (the new first row on screen, two frames later). It goes
   on to the people list (`rentalsToPeople…`), the owner of the newest
   offer with the "linked properties" tab clicked as soon as it shows
   (`peopleToPersonProperties…`; `…Data` waits for every property list
   request the page sends), the rental and purchase requests lists and the
   documents list. On the first repeat launch it samples every Electron
   process (`app.getAppMetrics()`) plus the API child: working set, private
   memory and CPU over 10 s idle, at the login form, on the dashboard, on
   the properties list and on the people list.

   With `--photos`, every profile sees the seeded photos (a junction to the
   API pass's images folder). The properties open, search and rentals steps
   also record `…ImagesPainted` (every on-screen row's photo loaded and
   decoded), `…Requests`, `…ImageRequests` (originals or thumbnails),
   `…Writes` (thumbnails saved) and `…ApiKB`, each until no API request has
   been in flight for 1 s; memory is also sampled on the properties list on
   the first fresh launch; and the untimed first launch walks the lists, so
   the repeat profile starts with what a previous day's use left (such as
   thumbnails). Fresh profiles start without them.

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
  filter by owner, and people, requests and documents are not paged yet
  (both done since; see "Paging the remaining lists" below).
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

## Paging the remaining lists, October 2026

Builds: `main` at `1ca1e9f` against the branch at `253fac2` (person details
asks `/properties/paged` for its owner's offers; people, rental and purchase
requests and documents on `/paged` endpoints and `v-data-table-server`),
both measured with the branch's harness, alternately in two rounds (A, B, A,
B), 8 launches per mode. Same development PC, another day (`GET /properties`
242–267 ms here). The dataset is the baseline's plus 3,000 identity
documents, new in this harness (a tenth archived, about a quarter expired).

|                                                              |      main r1 |    paged r1 |      main r2 |    paged r2 |
| ------------------------------------------------------------ | -----------: | ----------: | -----------: | ----------: |
| Person details: properties — requests (median ms · KB)       | 268.3 · 5328 |     2.5 · 4 | 266.9 · 5328 |     2.4 · 4 |
| People page: open — request (median ms · KB)                 |   32.3 · 673 |     2.8 · 5 |   23.5 · 673 |     2.4 · 5 |
| Rental requests page: open — requests (median ms · KB)       |   47.7 · 957 |     2.5 · 6 |   38.7 · 957 |     2.5 · 6 |
| Purchase requests page: open — requests (median ms · KB)     |   37.9 · 949 |     2.6 · 6 |   47.4 · 949 |     2.4 · 6 |
| Documents page: open — list request (median ms · KB)         |  98.3 · 1574 |     4.9 · 5 |  95.4 · 1574 |     4.7 · 5 |
| API CPU during the API pass (s)                              |         34.2 |        23.2 |         33.9 |        21.4 |
| Rentals → people list painted (median ms)                    |        149.2 |       130.4 |        144.7 |       127.1 |
| People → person's properties, responses received (median ms) |        232.4 |        68.0 |        234.7 |        68.3 |
| People → person's properties painted (median / max ms)       |  246.5 / 402 | 154.8 / 188 |  248.9 / 385 | 157.3 / 321 |
| Person → rental requests painted (median ms)                 |        106.6 |        97.2 |        110.6 |       103.2 |
| Rental → purchase requests painted (median ms)               |        111.5 |        91.1 |        111.8 |        90.8 |
| Purchase requests → documents, list received (median ms)     |        166.7 |        80.6 |        165.1 |        80.6 |
| Purchase requests → documents painted (median ms)            |        211.8 |       118.8 |        212.4 |       121.2 |
| People list, all processes: working set / private (MB)       |    593 / 476 |   576 / 445 |    593 / 472 |   590 / 458 |
| People list, renderer process: private (MB)                  |        128.3 |       112.0 |        127.6 |       126.0 |
| Login form visible, repeat profile (median ms)               |         1077 |        1115 |         1101 |        1015 |
| Login click → dashboard painted (median ms)                  |          420 |         408 |          413 |         406 |
| Dashboard → properties list painted (median ms)              |          295 |         285 |          289 |         287 |
| `GET /people`, every person (unchanged; median ms)           |         40.6 |        41.9 |         36.7 |        21.8 |

The UI rows are the repeat profile; the fresh profile agrees (person's
properties painted 255 ms on `main`, 151–155 ms on the branch; documents
painted 212 ms against 115 ms). `node scripts/perf/compare.mjs` prints
every row.

### What improved

- **Person details** sends one request for 4 KB (~2.5 ms on the API)
  instead of two full property lists, 5.3 MB and ~267 ms on the API alone
  before the renderer parsed them. Its properties tab paints ~156 ms after
  navigating to the person instead of ~248 ms (−37%), and the slowest
  launch 188–321 ms instead of 385–402 ms. The response now arrives ~68 ms
  after navigation, before the tab is on screen; what remains is the
  person's own record, the page and the tab switch.
- **Each list page** opens with one request of 5–6 KB, 2.4–4.9 ms on the
  API, instead of 0.7–1.6 MB and 24–98 ms. The requests pages also no
  longer download every person on each load and search.
- **Documents** paints in ~120 ms instead of ~212 ms (−43%): its list is
  5 KB instead of 1.6 MB and is requested together with the pickers'
  people and types instead of after them.
- **Purchase requests** paint in ~91 ms instead of ~112 ms (−19%), **people**
  in ~129 ms instead of ~147 ms (−12%).
- **API CPU** for the API pass fell from ~34 s to 21–23 s; the passes
  differ only in the page requests above.

### What did not improve

- **Rental requests** paint 7–9% sooner (97–103 ms against 107–111 ms),
  inside the noise: the old page showed its rows after its first request,
  and the people download that followed did not hold them back. Why
  purchase requests, which loaded the same way, gained 19% was not
  investigated.
- **The person pickers** still download every person (673 KB, 22–42 ms on
  the API): the documents page's filter on every visit, the requests form
  on first opening, the offer and rental forms. A picker that searches the
  server would remove that. (Done since; see "Person pickers" below.)
- **Memory on the people list**: inconclusive. The renderer held 16 MB less
  private memory in round 1 and 1.6 MB less in round 2.
- **Startup, the dashboard and the properties and rentals lists**:
  unchanged, as expected; the differences are within noise.
- **The full-list endpoints** are unchanged (`GET /people` 22–42 ms,
  `GET /rental-requests` 11–21 ms) and are still used by the pickers,
  matching and the API pass's sequential section.

### No index for the owner filter

`EXPLAIN (ANALYZE, BUFFERS)` of the person details query on the seeded
dataset: a sequential scan of `properties` (163 shared buffers) taking
0.8 ms; the rentals equivalent 0.35 ms. With ten times the data (50,000
properties) the same plans take 8.0 ms and 2.8 ms. The whole request takes
~2.5 ms at 5,000 properties, so an index on `owner_person_id` would save
under a millisecond here, and no migration was added. Revisit it with the
Phase 2.3 index migration if offices reach tens of thousands of offers. The
other first pages, at 50,000 properties: people (15,000 rows, a count over
all of them plus a top-N sort) 9.4 ms, rental requests 6.1 ms.

## Person pickers, October 2026

The documents filter, the request form's customer field and the rental
form's owner field share `PersonPicker`, which searches `/people/paged`
instead of downloading every person; the property form page stopped
downloading the list it never showed. Three builds, alternately in two
rounds (main, paged, picker, main, paged, picker), 8 launches per mode:
`main` at `1ca1e9f`, the paged lists at `253fac2` (previous section) and
the picker at `3bfb035`. Same PC and dataset as the previous section; the
picker is compared with the paged build, `main` is there for reference.

|                                                        | main r1 | paged r1 | picker r1 | main r2 | paged r2 | picker r2 |
| ------------------------------------------------------ | ------: | -------: | --------: | ------: | -------: | --------: |
| Documents page: API downloads (KB)                     |    2249 |      680 |         6 |    2249 |      680 |         6 |
| Documents list painted (median ms)                     |   227.3 |    127.5 |     120.7 |   250.4 |    126.6 |     127.7 |
| Documents list, renderer process: private (MB)         |   181.1 |    142.3 |     134.4 |   176.7 |    140.4 |     148.7 |
| Documents filter: name typed → option shown (ms)       |    67.2 |     68.4 |     367.0 |    62.9 |     64.4 |     379.1 |
| Request form: "add" → form shown (ms)                  |   221.5 |    220.2 |     206.1 |   216.7 |    188.3 |     218.5 |
| Request form: customer field clicked → list shown (ms) |   333.3 |    474.2 |     255.1 |   338.7 |    357.6 |     282.9 |
| Request form: API downloads (KB)                       |     673 |      673 |         9 |     673 |      673 |         9 |
| Property edit form filled in (ms)                      |   331.9 |    316.5 |     287.9 |   334.4 |    310.5 |     315.2 |
| Rental edit form filled in (ms)                        |   266.6 |    258.6 |     254.5 |   230.3 |    238.1 |     287.0 |
| Rental edit form: linked owner's name shown (ms)       |   366.6 |    432.8 |     317.5 |   389.7 |    386.9 |     337.1 |
| Property or rental edit form: API downloads (KB)       |     674 |      674 |         1 |     674 |      674 |         1 |
| Login click → dashboard painted (median ms)            |     442 |      425 |       434 |     440 |      425 |       446 |

Medians of the repeat profile; times from the action (navigation, click or
typing). "API downloads" counts every API response body of the step until
its requests settle.

### What improved

- **Downloads**: each of the four places now downloads 1–10 KB instead of
  673–680 KB.
- **The request form's customer list** shows in 255–283 ms instead of
  333–339 ms on `main` and 358–474 ms on the paged build: 20 options to
  render instead of a list of 1,500.
- **The rental edit form** shows the linked owner's name in 318–337 ms
  instead of 387–433 ms: one person fetched by id instead of the whole list
  first.

### What did not improve, or got worse

- **Typing a name** into the documents filter shows the match after
  ~370 ms instead of ~65 ms. The picker waits for a 300 ms pause in typing
  (the same pause as the list filters), then asks the server (~3 ms on the
  API); the old list filtered 1,500 people locally on every keystroke. A
  shorter pause would narrow the gap at one request per pause.
- **Pages and forms** (documents painted, the form opening, both edit forms
  filled in) are within noise, including the property form, which used to
  wait for the people list before loading its offer. On this PC 673 KB from
  the local API costs tens of milliseconds; on slower hardware or over the
  remote-access tunnel it should matter more (not measured).
- **Memory on the documents list**: inconclusive against the paged build
  (renderer 8 MB less in round 1, 8 MB more in round 2). The drop from
  `main` came with paging the documents list.

## Table thumbnails, October 2026

Every row of the properties and rentals tables used to mount the image
manager: one `GET …/images` per row, then the full-size original in a
`v-img` (48×40 on screen). Now the paged list response names each row's
primary image and whether it has a thumbnail; the row is a lazy `<img>` of
the thumbnail (JPEG, 320 px on its longest side), or of the original until
the thumbnail exists. The renderer makes thumbnails on upload, and for
images uploaded earlier the first time a table shows them to a user who may
manage images; the API only stores and serves them.

Builds: `main` at `d5c5921` against the branch at `f7b923b` (the later
`2abe5c9` only passes the EXIF orientation option explicitly; these
photos have none), alternately in two rounds (A, B, A, B). Dataset: the
usual 5,000 properties and 2,000 rentals, each with 3 photos
(`--photos 3`): 21,000 synthetic 12-megapixel JPEGs, 3.6 MB on average.

**The startup pass has not run yet**: port 34567 was held by a `pnpm dev`
session on this PC the whole time, and the packaged renderer's API address
is fixed to that port. The table figures below come from
`scripts/perf/tables.mjs` instead: the same packaged renderers and APIs, in
Playwright's Chromium 149 (Electron 39 is Chromium 142), viewport 1600×1000
with all ten rows on screen, 5 runs per round, HTTP cache off (request
routing). "First view" is a table whose images have no thumbnails yet
(right after upgrading); "second view" is the same table after a new login.
On `main` both views are the same.

|                                                       |    main r1 |   branch r1 |    main r2 |   branch r2 |
| ----------------------------------------------------- | ---------: | ----------: | ---------: | ----------: |
| Properties, second view: API requests (images)        |    23 (10) |     13 (10) |    23 (10) |     13 (10) |
| Properties, second view: downloaded (KB)              |     36,171 |          98 |     36,171 |          98 |
| Properties, second view: rows painted (median ms)     |      284.6 |       282.5 |      272.8 |       276.2 |
| Properties, second view: photos painted (median ms)   |      868.7 |       345.0 |      786.0 |       315.1 |
| Properties, second view: renderer private (median MB) |      167.0 |       116.3 |      171.0 |       117.2 |
| Rentals, second view: downloaded (KB)                 |     36,650 |          98 |     36,650 |          98 |
| Rentals, second view: photos painted (median ms)      |      957.0 |       252.3 |    1,079.2 |       271.7 |
| Properties, first view: API requests (images, saves)  | 23 (10, 0) | 33 (20, 10) | 23 (10, 0) | 33 (20, 10) |
| Properties, first view: downloaded (KB)               |     36,171 |      72,323 |     36,171 |      72,323 |
| Properties, first view: rows painted (median ms)      |      327.7 |       248.1 |      314.9 |       277.0 |
| Properties, first view: photos painted (median ms)    |      847.5 |       696.3 |      762.7 |       678.8 |
| Properties, first view: renderer private (median MB)  |      169.9 |       162.0 |      169.1 |       161.8 |
| Rentals, first view: rows painted (median ms)         |      231.4 |       351.9 |      213.4 |       356.4 |
| Rentals, first view: photos painted (median ms)       |    1,094.2 |     1,130.5 |    1,038.1 |     1,135.9 |

Times from the navigation; "photos painted" is every row's photo loaded
and decoded. Requests and downloads count every API request of the step
until none has been in flight for 1 s, so a first view includes the
thumbnails it makes. "images" are original or thumbnail files, "saves"
thumbnails written. The API pass (`pnpm perf --photos 3 --skip-startup`):

|                                                 |      main r1 |    branch r1 |      main r2 |    branch r2 |
| ----------------------------------------------- | -----------: | -----------: | -----------: | -----------: |
| Properties page: open (median / p95 ms)         |   5.8 / 11.0 |  12.3 / 15.4 |  10.4 / 13.9 |  11.8 / 14.7 |
| Properties page: last page (median / p95 ms)    |  10.5 / 12.3 |  12.8 / 14.1 |  11.2 / 15.0 |  12.6 / 15.4 |
| Rentals page: open (median / p95 ms, KB)        | 5.2 / 6.6, 7 | 6.4 / 8.5, 8 | 5.5 / 6.7, 7 | 6.6 / 8.6, 8 |
| `GET …/images/:imageId/file`, one original (ms) |         31.3 |         25.3 |         29.4 |         33.1 |
| API CPU during the API pass (s)                 |         26.0 |         26.0 |         25.2 |         26.4 |

Making one thumbnail in Chromium (10 of the 3.6 MB photos, medians, a
one-off script not kept in the repository):
decoding with `createImageBitmap` 62 ms, off the main thread; drawing at
320×240 and encoding the JPEG 16 ms on the main thread; result 8.9 KB.
With the main thread slowed 4× (CDP CPU throttling, roughly a low-end
office PC): 102 + 48 ms.

### What improved

- **A table page with thumbnails** downloads 98 KB instead of 36 MB and
  sends 13 requests instead of 23 (no image list per row). Its photos are
  on screen 315–345 ms after navigating instead of 786–869 ms (−60%); on
  the rentals table 252–272 ms instead of 957–1,079 ms (−74%).
- **Renderer memory** on the properties list: 116–117 MB private instead
  of 167–171 MB: ten 12-megapixel images are no longer decoded to fill
  48×40 cells.
- **The rows themselves** (text) paint 40–80 ms sooner on a first view (no
  image manager per row); with thumbnails they are unchanged.

### What did not improve, or got worse

- **The first view of older images costs more than before**, once per
  image: the row shows the original (as before), then the page downloads
  it again to make the thumbnail and saves it (20 image requests and 10
  writes instead of 10; 72 MB instead of 36 MB on this local API). The
  photos still appear 85–150 ms sooner (no image list per row), and the
  renderer holds 8 MB less, but the next page opened right after it was
  slower: the rentals table's rows painted ~350 ms after navigating instead
  of 213–231 ms, its photos 40–100 ms later. Most likely the thumbnail
  work (ten decodes of 12 MP) and the memory it frees; not profiled. In
  Electron the second download may come from the HTTP cache (this
  measurement had it off); the startup pass will tell. Users without the
  images permission never make thumbnails, so they keep seeing originals
  until someone who has it opens those pages.
- **The list request** takes 1–2 ms more on the API (one `DISTINCT ON`
  query for the page's primary images and a file check per row; round 1's
  5.8 ms on `main` is an outlier) and the rentals page is 1 KB larger.
  Everything else in the API pass is within noise.
- **Uploading** a photo now first makes its thumbnail (~80 ms, ~150 ms on a
  slow PC). Originals are still sent as base64 JSON and stored unchanged:
  a 4 MB photo is still 4 MB on disk and in every backup.
- **Galleries** (the property panel, the rental dialog) still load
  originals, including their small thumbnail strips; they could use the
  thumbnails for the strip.
- **Not measured yet**: Electron startup, dashboard and list timings and
  the per-process memory of the startup pass (port 34567 was taken), and
  anything on a real low-end PC.

## Pool, statement timeout and dashboard, October 2026

Roadmap Phase 2 items 2 and 4. The API's pool used pg's defaults (at most
10 connections, each closed after 10 s unused, 1.5 s to get one, no
statement timeout), and `reconfigurePool` built a pool with none of the
settings. The dashboard summary ran 13–14 statements one after another,
reading the properties table about 8 times.

Now one `buildPoolConfig(target)` serves the request pool, the pool after
setup and the startup pool: max 10, 2 connections kept however long the app
is idle, the rest closed after 5 minutes, 5 s to get a connection, and
PostgreSQL cancels any statement after 15 s except inside the backup
snapshot, the restore and the migration transaction. The dashboard reads
each table's status counts and money figures in one aggregate, counts the
monthly activity in one pass, takes the 20 newest audit rows before joining
them, and runs its 12 statements two at a time. Its response is unchanged
(`test:dashboard` compares it with the old queries).

### Packaged builds

`pnpm perf` (8 launches per mode), `main` at `aaf9930` against the branch
at `6350bc1`, usual dataset. The rounds ran main, branch, branch, main,
branch: another process listened on port 34567 twice during the session and
stopped again (most likely a `pnpm dev`; nothing was closed for this),
so branch round 1 has the API pass only, and the second main round's first
launch timed out and lost the run (the harness now writes the API pass
before the startup pass begins). `GET /properties`, which this branch does
not change, shows the machine's state: branch rounds 1 and 2 ran on a
faster machine than the other three.

|                                                       |      main r1 |   branch r1 |   branch r2 |      main r3 |   branch r3 |
| ----------------------------------------------------- | -----------: | ----------: | ----------: | -----------: | ----------: |
| `GET /dashboard/summary` (median / p95 ms)            |  42.9 / 44.9 | 21.3 / 25.8 | 15.6 / 17.5 |  42.5 / 50.9 | 21.4 / 34.5 |
| 4-client dashboard (median / p95 ms)                  |  66.0 / 95.8 | 22.1 / 57.8 | 20.4 / 57.9 |  56.1 / 64.0 | 22.9 / 58.9 |
| 4-client dashboard (requests/s)                       |         57.2 |       142.0 |       135.1 |         68.5 |       130.2 |
| 4-client dashboard, slowest of 60 (ms)                |        105.2 |        64.4 |       166.3 |         73.9 |       159.3 |
| `GET /auth/me` after a 12 s pause (median / max ms)   | 41.2 / 149.3 |   4.0 / 5.7 |   4.6 / 5.1 | 42.0 / 159.7 |  3.4 / 10.9 |
| `GET /dashboard/summary` after a pause (median / max) | 95.7 / 107.7 | 23.4 / 35.0 | 31.4 / 52.7 | 90.0 / 116.3 | 15.7 / 29.1 |
| API database connections after the load / the pauses  |        4 / 1 |       8 / 8 |       8 / 8 |        4 / 1 |       8 / 8 |
| `GET /auth/me` warm (median ms)                       |          2.6 |         4.4 |         2.8 |          3.0 |         4.1 |
| `GET /properties`, all 5,000 rows (median ms)         |        259.8 |       161.8 |       140.3 |        257.1 |       265.2 |
| 4-client search (requests/s)                          |          4.5 |         8.4 |         5.9 |          5.1 |         5.1 |
| API CPU during the API pass (s)                       |         25.9 |        17.0 |        18.4 |         25.3 |        24.8 |
| Login → dashboard data, repeat profile (median ms)    |        344.4 |           – |       341.9 |        357.3 |       310.4 |
| Login → dashboard painted, repeat profile (median ms) |        469.0 |           – |       475.3 |        493.0 |       441.9 |
| Login form visible, repeat profile (median ms)        |       1181.2 |           – |      1188.2 |       1253.9 |      1224.1 |

The dashboard response is the same 30,236 bytes from both builds' APIs on
one seeded database (compared byte for byte, three times).

### How the values were chosen

Dev PC (Windows 11, i5-14400F, PostgreSQL 18.3, SCRAM-SHA-256 with 4,096
iterations), a seeded perf database (5,000 properties, 2,000 rentals,
20,000 audit rows).

**What a new connection costs.** Opening one (TCP, SCRAM login, a new
backend process) and running `select 1`: 32.5 ms median (25 connections).
Opened at the same moment, as a pool does when several queries arrive
after its connections were closed, the last one is ready after:

| connections at once             |    1 |    2 |    4 |     6 |    10 |
| ------------------------------- | ---: | ---: | ---: | ----: | ----: |
| all ready (median ms, 8 rounds) | 34.2 | 39.4 | 51.0 | 141.0 | 146.7 |

A new backend also plans its first queries with cold catalog caches: the
old dashboard took 64 ms on a connection that had only run `select 1`, 38 ms
on a used one. An idle backend holds 4.4 MB of private memory after
connecting and 5.6 MB after serving dashboards (24 MB working set, most of
it shared memory).

**Idle connections: min 2, 5 minutes.** Nothing in the renderer polls, so
between two clicks the pool used to close everything after 10 s. Over HTTP
(the API from source on the seeded database, medians of 4 requests each
after 12 s without any):

|                                               | pg defaults | min 2, idle 5 min |
| --------------------------------------------- | ----------: | ----------------: |
| `GET /auth/me` after the pause (ms)           |        38.8 |              13.2 |
| `GET /dashboard/summary` after the pause (ms) |        77.2 |              35.3 |
| `GET /dashboard/summary` warm (ms)            |        17.1 |              14.8 |

The remaining cost after a pause is not the pool: on one connection kept
open, the first `select count(*) from properties` after 12 s idle took 27,
13, 0.9 and 0.8 ms (0.6–0.8 ms warm), while a CPU-only loop in Node took
4.1–3.0 ms instead of 3.0 ms. Windows and PostgreSQL waking up costs
0–30 ms per pause, connections or not.

**Connect/queue timeout: 5 s.** pg-pool uses one value both for waiting for
a free connection and for opening a new one. With another session holding
`LOCK TABLE properties IN ACCESS EXCLUSIVE MODE` for 3 s while 16 clients
load the dashboard: at 1.5 s all 16 failed with a 500 ("timeout exceeded
when trying to connect") after 1.65 s, because each dashboard request
acquires several connections in turn and every acquire waited behind the
blocked ones; at 5 s all 16 succeeded after 3.1 s. Health checks and the
startup steps keep 1.5 s, so an unreachable database is reported as fast
as before.

**Max connections: 10.** Dashboard requests from N parallel clients, 15
each, two rounds (requests/s):

| max | 4 clients | 16 clients |
| --: | --------: | ---------: |
|   4 |    97–106 |     96–113 |
|  10 |    97–138 |    128–159 |
|  20 |   119–130 |    160–171 |

(three rounds for max 10.) The spread at 4 clients is as large as the
differences; at 16 clients 4 is clearly slower and 20 somewhat faster, on a
PC with 10 cores. An office PC has 2–4, one desk sends a request at a time
and remote users are few, so 10 stays.

**Statement timeout: 15 s.** It is the limit the startup and setup
connections already had. The slowest request of the API pass,
`GET /properties` (all 5,000 rows), takes under 0.33 s (p95) on this PC
including serialization, and the 5,000-row Excel import commits in statements of
≤ 55 ms, so ordinary work stays far below it even on a PC ten times slower.
The backup snapshot and the restore rewrite whole tables and migrations may
build indexes on large tables; they set `SET LOCAL statement_timeout = 0` in
their transactions (`test:timeouts` checks each, and that the limit is back
afterwards).

**Dashboard queries, in-process** (`getDashboard` timed in Node against the
same database, medians of 30 warm calls; "empty pool" is a call right after
every idle connection was closed). Each step is one commit:

| step                                                           |       warm (ms) | empty pool (ms) |
| -------------------------------------------------------------- | --------------: | --------------: |
| before (13–14 statements in sequence)                          |       35.6–40.5 |       85.0–95.9 |
| one aggregate per table for counts and money                   | 40.6 (old 39.5) | 98.1 (old 95.9) |
| monthly activity in one pass (was a nested loop, 9.3 → 4.6 ms) | 27.6 (old 35.6) | 75.6 (old 85.4) |
| 20 newest audit rows before the joins (7.0 → 3.7 ms)           | 25.0 (old 37.4) | 76.1 (old 88.2) |
| two statements at a time                                       | 14.9 (old 36.2) | 59.7 (old 85.0) |

Parallel width, same measurement (new queries, 20 calls each):

| statements at once |    1 |    2 |    3 |    4 |    10 |
| ------------------ | ---: | ---: | ---: | ---: | ----: |
| warm (ms)          | 24.7 | 15.0 | 16.8 | 15.4 |  16.1 |
| empty pool (ms)    | 78.8 | 60.8 | 64.6 | 70.3 | 138.2 |
| connections opened |    1 |    2 |    3 |    4 |    10 |

Running all of them at once (an unbounded `Promise.all`, the three rental
statements included) was faster warm, 11.9 ms, and the slowest on an empty
pool, 151.5 ms: ten new backends, started one at a time.

### What improved

- **The dashboard request** takes 15.6–21.4 ms instead of 42.5–42.9 (about
  half), p95 17.5–34.5 instead of 44.9–50.9. Four clients get 130–142
  dashboards a second instead of 57–69.
- **The first request after a pause** no longer opens a connection:
  `GET /auth/me` 3.4–4.6 ms instead of 41–42 ms (worst 5–11 instead of
  149–160), the dashboard 15.7–31.4 instead of 90–96. Nothing in the
  renderer polls, so before, every click after 10 s of reading paid this.
- **A busy or blocked database** no longer turns into 500s after 1.5 s: a
  request waits up to 5 s for a connection and gets an Arabic 503 if none
  comes, and a statement that runs 15 s is cancelled with an Arabic 503
  instead of holding its connection. Behind a 3 s lock, 16 dashboard
  requests now all succeed (all 16 failed before).
- `reconfigurePool` (the pool after the setup wizard) has the same settings
  as the pool at startup; it had none of them.

### What did not improve, or got worse

- **Login → dashboard in the app** is within noise (310–342 ms vs 344–357
  ms for the data, 442–475 vs 469–493 painted): the dashboard request was
  ~40 ms of it, the rest is login (scrypt), the route chunk and rendering.
- **Merging the counts and money figures into one aggregate**, the change
  roadmap item 2 named, made no measurable difference on its own (40.6 vs
  39.5 ms in-process): those statements took about 1 ms each. The time was
  in the monthly activity (a nested loop) and the recent activity (joins
  before the limit), and in running everything in sequence.
- **More open connections.** After the 4-client load the API keeps 8
  connections for 5 minutes instead of closing them after 10 s, and keeps 2
  for as long as it runs; PostgreSQL holds ~6 MB private memory per backend
  (~12 MB for the two that stay, ~48 MB for eight). One desk opens fewer:
  the dashboard uses 2 at a time.
- **The first requests of a burst** can be slower: the slowest of the 60
  four-client dashboards took 159–166 ms in two branch rounds (main 74–105),
  when the pool opens six more connections at once and Windows starts their
  backends one at a time.
- **A pause still costs something**: 0–30 ms on the first query after 12 s
  idle even on a connection that stays open (Windows and PostgreSQL waking
  up); see the table above.
- **Requests can now fail where they used to wait**: a statement still
  waiting after 15 s (for example a property save waiting for the record
  code lock behind a very slow Excel import) is cancelled with "استغرقت
  العملية وقتاً أطول من المسموح"; before, it waited however long it took.
  The routes that catch errors themselves (deleting a governorate, district,
  neighbourhood, role or user) still return the driver's English text as a
  400 in that case; Phase 5.2 removes those catch-alls.
- **Recent activity still reads every audit row** (3.7 ms at 20,000); an
  index on `audit_logs(entity_type, created_at)` is roadmap item 2.3.
- **Not measured** on a real low-end PC, where connections, cold caches and
  the 2-at-a-time choice may weigh differently.
