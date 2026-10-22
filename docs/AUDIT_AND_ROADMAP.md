# Audit and optimization roadmap (October 2026)

A read-only audit of the server, renderer, Electron shell, file handling,
packaging and test tooling, followed by a first batch of low-risk fixes on
branch `refactor/audit-and-quick-wins`. Findings marked **verified** were
re-checked against the code (and, where noted, reproduced). Everything else
is from the audit pass and should be confirmed before it is acted on.

Measurements are from this machine (Windows 11, Node 22.22, pnpm 10.28,
PostgreSQL 18). Nothing below is estimated unless it says so.

## 1. Baseline and first-batch results

| Measurement                          | Before        | After                            |
| ------------------------------------ | ------------- | -------------------------------- |
| Renderer `dist/`                     | 12,102,931 B  | 4,811,101 B (−60%)               |
| Server `dist/index.js`               | 3,220,237 B   | 3,226,323 B                      |
| Unpacked app (`win-unpacked`)        | 411,464,392 B | 359,393,049 B (−52.1 MB, −12.7%) |
| — Chromium `locales/` (55 → 2)       | 46,328,906 B  | 1,578,383 B                      |
| — `resources/renderer`               | 12,102,931 B  | 4,811,101 B                      |
| NSIS installer                       | 114,107,209 B | 101,187,082 B (−12.9 MB, −11.3%) |
| `pnpm typecheck`                     | passes, 43 s  | passes                           |
| `pnpm test`                          | 19 tests pass | 27 tests pass                    |
| Real Electron startup suite          | not run       | 11/11 pass                       |
| Backup round trip (`removal-backup`) | not run       | 20/20 pass                       |

Before-numbers come from a fresh `electron-builder --dir` of `main` at
`a1b5e08`; the checked-in `apps/desktop/release/win-unpacked` is stale (it
still contains a 441 MB `tools/chromium` from a retired configuration) and
should not be used for comparisons.

Startup, time to interactive, RAM/CPU and API latency are now measured by
`pnpm perf` (Phase 0); results and their reading are in
[`docs/PERFORMANCE.md`](PERFORMANCE.md). The first batch did not change speed
measurably. The remaining unpacked size is dominated by the Electron runtime
(`دلالي.exe` 211 MB, `dxcompiler.dll` 26 MB, ICU 10 MB) and
`cloudflared.exe` (54 MB, always bundled).

### What changed in this batch

| Commit                                                                 | Why                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fix(auth): throttle wrong PINs and refuse tunneled setup calls`       | **Verified.** Unlimited wrong PINs (4-digit minimum) over the optional public tunnel; tunneled requests also passed `requireLocalSetup`, exposing `/api/setup/test-postgres` as a remote credential/port probe. |
| `perf(renderer): ship splash and login backgrounds as WebP`            | 4.3 MB of PNG → 238 KB; the splash image is decoded on every launch.                                                                                                                                            |
| `perf(renderer): bundle only the WOFF2 Material Design Icons font`     | Vite emitted EOT/TTF/WOFF/WOFF2 (3.6 MB); Chromium loads only WOFF2.                                                                                                                                            |
| `perf(desktop): package only Arabic and English Chromium locales`      | 53 unused locale packs.                                                                                                                                                                                         |
| `fix(server): keep tokens out of logs and 4xx errors out of 500s`      | **Verified.** `?token=` session tokens were written to `main.log`; malformed JSON, oversize bodies and unique violations returned 500.                                                                          |
| `fix(backup): restore large tables in chunks`                          | **Reproduced.** Restore failed above ~1,300 properties (65,535 bind-parameter limit). New `test:restore:large` fails without the fix.                                                                           |
| `fix(desktop): single instance and non-overlapping scheduled backups`  | **Verified.** A second launch spawned a second API; a backup longer than one minute started another backup and email every minute.                                                                              |
| `fix(renderer): table thumbnails no longer take pastes or set primary` | **Verified.** Every table row registered a window paste listener, and clicking a row thumbnail sent a set-primary PATCH.                                                                                        |
| `fix(seed): refuse --reset on databases with non-seed properties`      | **Verified.** `db:seed:reset` deleted all properties and locations of whatever database `.env` pointed at.                                                                                                      |
| `chore(ci): typecheck, unit tests and build on windows-latest`         | There was no CI.                                                                                                                                                                                                |

## 2. Decisions needed from the owner

These are not code-quality calls; they change history, data or behavior.

1. **Migration history was squashed (commit `eb63ea4`).** `0001`–`0003` were
   deleted and `0000` renamed and re-stamped, contrary to the append-only rule
   in `CLAUDE.md`. Existing databases are _not_ re-migrated (the renamed
   `0000` has identical SQL, so the runner skips it by hash), but:
   - `run-migrations.ts` still special-cases the deleted tags (dead code), and
     `test:removal` (`removal-core.test.ts`) reads the deleted files and fails;
   - an installation that has not yet retired the contract system can no
     longer do so through `0003`;
   - _Resolved:_ the plot-identity unique index (`uq_properties_plot_identity`)
     and the five `pg_trgm` search indexes on `properties` were absent from
     `0000`, so fresh installs lacked them. `0002_restore_property_indexes`
     re-creates them with `IF NOT EXISTS` (databases that have them are
     untouched); like the originals, each block catches its own failure, so
     existing duplicate plots or an unusable `pg_trgm` skip that block, and
     the runner now logs the notice. Such a database stays without the index
     until the duplicates are removed and it is created by hand. The
     duplicate check in `properties.repository.ts` sent `'s+'` instead of
     `'\s+'` (the `sql` tag uses the cooked string), so it missed
     whitespace variants; on fresh installs those were saved silently.
   - _Resolved:_ the default document types were inserted only by the old data
     migrations, which an earlier consolidation (`152c7a5`) replaced with a
     schema-only baseline, so fresh installs had an empty type list.
     `0001_default_document_types` restores them (`ON CONFLICT DO NOTHING`).

   Decide whether any installed database predates the squash; then either
   restore the retirement path or formally retire it (update `CLAUDE.md`,
   `run-migrations.ts`, the removal tests).

2. **Files tracked in git that should not be** (~55 MB of the 84 MB `.git`):
   `tools/cloudflared/cloudflared.exe` (54 MB), PostgreSQL dumps under
   `server/data/backups/` (may contain legacy contract data — CLAUDE.md
   requires approval), `server/data/documents/**` (tracked despite
   `.gitignore`), demo images. Untracking is safe for the working tree;
   purging history is a separate, force-push decision.
3. **Synthetic English listing names.** `toApiObject` fills a missing `name`
   with `"properties P-0001"` / `"rentals R-…"`, so English shows in the Arabic
   UI and the renderer's Arabic fallbacks never run. Fixing it changes the
   API response (`name` becomes `null`); check exports/PDF first.
4. **Remote access defaults.** `REMOTE_ACCESS_ENABLED` is reported but never
   enforced, and the cloudflared child is not killed when the API exits, so a
   public tunnel can outlive the app. Decide whether the flag should gate
   `/api/remote-access/enable`.
5. **Backup contents.** Resolved in part: backups no longer include
   `config.json` (the database password). The scheduled backup still emails
   the archive, including ID scans, unencrypted.

## 3. Findings by area (open)

### Server and database

- **Pool defaults** (max 10, 10 s idle, 1.5 s connect/queue timeout, no
  statement timeout); `reconfigurePool` rebuilds a bare config.
- **Dashboard runs ~13 sequential queries** (properties scanned ~8 times);
  the RBAC leak (rentals, audit activity and follow-ups under
  `properties.read`; matching across domains) is fixed in Phase 1.
- **Every authenticated request costs 3 queries** (session + roles +
  permissions); a 20-thumbnail gallery ≈ 80 queries. A short-TTL, explicitly
  invalidated session cache is the single biggest backend win.
- **Record codes** (`P-…`, `R-…`, people, requests, documents) are read-max +1;
  Phase 1 retries on a collision, so simultaneous saves no longer fail.
- **No pagination** for the audit log. (Properties, rentals, people,
  requests and documents are paged on the server, and person details asks
  for its owner's offers; Phase 2.6.) The pickers that list every person
  (offer owner, request customer, documents filter) still download them
  all.
- **Search**: properties ORs `ILIKE` over ~28 columns plus casts per token;
  `%`/`_` not escaped; duplicate-plot check is a sequential scan per save.
- **N+1**: `listUsers` (2 per user), `listRoles`, location names (3 lookups per
  save), Excel import (~7 queries per row, no transaction or row cap).
- **Non-atomic writes**: entity write and audit row are separate, audit errors
  are swallowed; files are written before their row, orphaned on failure.
- **Backup/restore block the event loop**: adm-zip reads every image and
  compresses synchronously; no retention; images extracted after the DB
  commit. (Lock and pre-restore copy added in Phase 1.)
- **Uploads** are base64 inside JSON (50 MB route limit since Phase 1, 1 MB
  elsewhere), no per-file limit, no content sniffing, no thumbnails.
- **Error shapes** vary (`{code,messageKey,message}` / `{message}` /
  `{ok:false,message}`); several routes return raw driver text as 400;
  `DocumentError` is dead; `z.coerce.boolean()` turns `"false"` into `true`.
- Already good: no `any`, snapshot export and single-transaction restore
  with validation first (effective since Phase 1 made `db.transaction` real),
  path-traversal guards, advisory-locked
  migrations, scrypt PINs and hashed session tokens, streamed file serving.

### Renderer

- **Vuetify is not tree-shaken** (`import * as components`): main chunk 555 KB
  JS + 270 KB CSS. The MDI CSS (~7,400 icon rules, ~400 KB) is parsed by the
  splash and main window on every launch, while ~129 icons are used.
- **xlsx is in the Properties route chunk** (360 KB) though only needed after
  clicking "استيراد"; `xlsx@0.18.5` also has known parsing CVEs.
- **Table rows each mount an image manager**: one `GET /images` per row and
  full-size originals as thumbnails (paste/click bugs fixed in this batch).
- **Stale responses** can overwrite newer searches (no AbortController or
  request id); clearing filters and topbar navigation fire duplicate loads.
- **Waterfalls**: rentals, rental form, property form, documents and request
  pages load reference data sequentially; `RequestManager` reloads all people
  on every load/search/save; `useLocations` has no in-flight dedupe.
- **Shell remounts per route** (17 pages wrap themselves in `AppLayout`;
  sidebar rail state resets); `useRefresh` keeps the previous page's handler.
- **Types drift**: `RentalRecord.image` does not exist server-side;
  `RentalStatus` has 34 values vs 5 on the server.
- Dead exports: `exportPropertiesToXlsx`, `exportRentalsToXlsx`,
  `backupDownloadUrl`, `logoUrl`, several service functions.
- Already good: every route lazy-loaded, Leaflet and Chart.js loaded lazily
  and cleaned up, debounced filters, no `any`, no sourcemaps in production.

### Electron, packaging, logs

- ~~API child is not supervised~~: measured, not a problem on Windows — the
  API exits with Electron even when Electron is force-killed (see Phase 1).
  An API exit after startup is still only logged.
- `config.json` writes are not atomic and a parse failure silently returns
  `{}` (drops the user into Setup); the DB URL is stored in plaintext.
- electron-log keeps 1 MB + one archive; the default menu (with DevTools) is
  reachable in production; `splash:*` IPC is unguarded; no CSP.
- `nodemailer` is imported eagerly at startup.

### Tests and tooling

- Runtime smoke suites hardcode `postgres`/`root` on `127.0.0.1:5432` and fixed
  database names; `test:removal` is broken by the migration squash.
- No ESLint, no `.editorconfig`; `lint` equals `typecheck`. Renderer has no
  tests. `.gitignore` ignores `tests`.

## 4. Roadmap

Ordered by value against risk. Each item is meant to be one reviewable PR
with its own verification. Items in the same phase are independent unless
noted.

### Phase 0 — measurement harness — done

`pnpm perf -- --app <win-unpacked>` (see `docs/PERFORMANCE.md`): startup
marks for fresh and repeat profiles, per-process memory and idle CPU, API
latency per endpoint and under 4 parallel clients, all against a seeded
5,000-property throwaway database. Measured hotspots, which re-rank the
phases below:

1. **Properties list ships every row** (4.9 MB JSON, ~310 ms API time per
   load at 5,000 properties) → server pagination moves up (Phase 2.6).
   Done for properties and rentals: ~11 KB and ~7 ms per page, the list
   paints ~45% sooner (`docs/PERFORMANCE.md`, "Server pagination").
2. **Search under 4 concurrent clients ~1 s, CPU-bound** → search rewrite
   (Phase 2.7).
3. **~0.55 s from API READY to login form** and **~0.55 s to render the
   dashboard after its data arrives** → Phase 3.1–3.2 and dashboard render
   profiling.
4. The session/permission cache (Phase 2.1) is _not_ supported by the data
   so far: `GET /auth/me` takes ~5 ms. Keep it below the items above.

### Phase 1 — safety and correctness — done except as noted

1. ~~API lifecycle~~ — **not needed**. Measured on the packaged app: when
   Electron's main process is force-killed, the API exits ~1.3 s later and
   frees its port, before and after the first batch. Node's child processes
   on Windows (libuv) die with their parent; cloudflared, a child of the API,
   should go the same way but was not tested with a live tunnel. An
   IPC-based shutdown was implemented, measured against this and dropped.
   Enforcing `REMOTE_ACCESS_ENABLED` stays an owner decision (section 2).
2. Done: backups no longer include `config.json`; backup, export, scheduled
   run and restore share one lock (409 when busy); restore first writes
   `Dalaly_Before_Restore_<time>.zip`. **Not done:** retention of the last N
   backups — it deletes user files, so it needs an owner decision.
3. Done: dashboard sections and matching follow their domains' read
   permissions.
4. Done: auth runs on `onRequest`; 1 MB global body limit, 50 MB on the
   eight upload/import/restore routes.
5. Done: record codes are allocated inside a transaction holding a
   per-table advisory lock, so simultaneous creates take turns. Also fixed:
   Drizzle wraps PostgreSQL errors, so the 23505/23503 → 409 mapping from
   the first batch never matched; it now reads the SQLSTATE through `cause`.
   **Found on the way:** `db.transaction` was never a real transaction. The
   pool is a `Proxy` that Drizzle did not recognize as a pool, so `BEGIN`,
   each statement and `COMMIT` could run on different connections under
   concurrency (restore, the backup snapshot, property creation). The proxy
   now reports `pg.Pool`'s prototype.
6. Done: atomic `config.json` writes with a `.bak` used when the file is
   torn.
7. Open: runtime smoke suites still hardcode credentials and fixed database
   names.

New DB-backed suites: `test:permissions`, `test:backup:safety`,
`test:limits`, `test:codes`, `test:transactions` (each fails without its
fix).

### Phase 2 — backend efficiency

1. Session/permission cache (30–60 s TTL, invalidated on logout and on user,
   role or permission changes).
2. Dashboard: two aggregate queries with `count(*) FILTER (…)` plus
   `Promise.all` for the rest.
3. Index migration for measured query patterns (`created_at`/`updated_at`
   orderings, `owner_person_id`, `audit_logs(entity_type, created_at)`); drop
   the duplicate `sessions.token_hash` index. Verify with
   `EXPLAIN (ANALYZE, BUFFERS)` on the Phase 0 dataset. Measured for
   `owner_person_id`: a sequential scan of 0.8 ms at 5,000 properties and
   8 ms at 50,000, so no index yet (`docs/PERFORMANCE.md`, "Paging the
   remaining lists").
4. Pool tuning and a statement timeout (exempting backup/restore).
5. Fix N+1s: users/roles listing, location names, import (transaction + cap).
6. Done: server pagination end to end. `GET /properties/paged` and
   `/rentals/paged` (page, size, whitelisted sort including area in m²,
   total), then `/people/paged`, `/rental-requests/paged`,
   `/purchase-requests/paged` and `/documents/paged` (the documents status
   filter, "expired" included, moved into SQL), all on
   `v-data-table-server`. Person details asks `/properties/paged` for its
   owner's offers (`owner_person_id`, `include_archived`) instead of
   downloading every property. Results in `docs/PERFORMANCE.md`.
7. Search: replace the per-token `ILIKE` over ~28 columns (plus casts and a
   `regexp_replace` on phone) with one generated, normalized `search_text`
   column and a `pg_trgm` index (new migration); escape `%`/`_` in input.
   Compare with `pnpm perf` before and after.

### Phase 3 — renderer startup and responsiveness

1. Done: `vite-plugin-vuetify` auto-import (main-window startup JS
   719 → 328 KB, module evaluation ~20 ms faster). Also done: the startup
   health wait (removes the ~350 ms slow-launch step) and charts drawn after
   the dashboard's first paint (figures ~150 ms sooner). See
   `docs/PERFORMANCE.md`, "Renderer startup and dashboard".
2. Icons: measured, not worth it for the splash (dropping the icon CSS did
   not change its load time). Revisit only with evidence for the main window.
3. Lazy-load xlsx; remove dead exports.
4. Table thumbnails: return the primary image id in list responses, render a
   lazy `<img>`; generate thumbnails server-side (or downscale on upload).
5. Request hygiene: AbortController in list loads (done for the
   properties and rentals lists, `createPagedList`), remove duplicate fires
   (the top-bar search still loads twice: Enter and the filter debounce),
   `Promise.all` waterfalls, cached people/locations.
6. Persistent shell (`AppLayout` in a parent route), `useRefresh` cleanup,
   `shallowRef` for list payloads, cached `Intl.NumberFormat`.

### Phase 4 — files and backup at scale

1. Stream backups to a temp file (yazl/archiver or a worker thread), rename
   on success.
2. Multipart/streamed uploads with size and type checks.
3. App fonts TTF → WOFF2.

### Phase 5 — maintainability gates

1. ESLint (typescript-eslint + eslint-plugin-vue), errors only at first, in
   CI.
2. One `DomainError(status, message)`; remove route catch-alls; one error
   response shape; fix `z.coerce.boolean()`.
3. Shared renderer pieces where duplication is real: `FilterBar` +
   `useDebouncedApply`, one `ImageGallery` with a service adapter,
   `useListingSort`.
4. API contract tests: for each list/detail endpoint, assert the response keys
   and types against the renderer types (run against the isolated test DB).
5. A DB-backed CI job (Linux runner with a PostgreSQL service) for the
   runtime and restore suites.
