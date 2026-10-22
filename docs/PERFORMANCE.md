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
   median/p95/max and response size. Then 4 parallel clients send 15
   searches each (throughput and latency under contention). API working set,
   private memory and CPU time are read before and after.
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
   later). On the first repeat launch it samples every Electron process
   (`app.getAppMetrics()`) plus the API child: working set, private memory
   and CPU over 10 s idle, at the login form and on the dashboard.

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
  largest single win for big offices.
- **Search under concurrency** is CPU-bound (~33 s of API CPU for the pass):
  4 clients get ~1 s per search. Fine for one desk, poor for an office using
  remote access.
- **API memory** grows from ~82 MB to 200–240 MB while serving the large
  lists and stays there at the end of the pass. Whether that is live heap or
  uncollected garbage has not been measured; smaller responses would cut it
  either way.
