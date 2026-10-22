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
| `pnpm typecheck`                     | passes, 43 s  | passes                           |
| `pnpm test`                          | 19 tests pass | 27 tests pass                    |
| Real Electron startup suite          | not run       | 11/11 pass                       |
| Backup round trip (`removal-backup`) | not run       | 20/20 pass                       |

Before-numbers come from a fresh `electron-builder --dir` of `main` at
`a1b5e08`; the checked-in `apps/desktop/release/win-unpacked` is stale (it
still contains a 441 MB `tools/chromium` from a retired configuration) and
should not be used for comparisons.

Not yet measured (needs a harness, see Phase 0): cold/warm startup time,
time to interactive, idle and loaded RAM/CPU, API p95 latency, NSIS installer
size. The remaining unpacked size is dominated by the Electron runtime
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
   - the plot-identity unique index (`uq_properties_plot_identity`) and the
     `pg_trgm` search indexes from older migrations are absent from `0000`, so
     fresh installs lack them while older ones have them. Re-adding the unique
     index needs a migration that first checks for duplicates, or startup
     fails on databases that already contain them.

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
5. **Backup contents.** Every backup zip includes `config.json` with the
   plaintext database URL and is emailed unencrypted (with ID scans) by the
   scheduled backup.

## 3. Findings by area (open)

### Server and database

- **Pool defaults** (max 10, 10 s idle, 1.5 s connect/queue timeout, no
  statement timeout); `reconfigurePool` rebuilds a bare config.
- **Dashboard runs ~13 sequential queries** (properties scanned ~8 times);
  route needs only `properties.read` but returns rentals, audit activity with
  usernames and follow-ups (**RBAC leak**). Matching returns customer data
  under `rentals.read`.
- **Every authenticated request costs 3 queries** (session + roles +
  permissions); a 20-thumbnail gallery ≈ 80 queries. A short-TTL, explicitly
  invalidated session cache is the single biggest backend win.
- **Record codes** (`P-…`, `R-…`, people, requests, documents) are read-max +1,
  not race-safe; a double-clicked Save gives a 23505 (now a 409, previously 500).
- **No pagination** for people, requests, documents, audit; renderer never
  sends `limit/offset` for properties/rentals; person details downloads all
  properties to filter by owner client-side.
- **Search**: properties ORs `ILIKE` over ~28 columns plus casts per token;
  `%`/`_` not escaped; duplicate-plot check is a sequential scan per save.
- **N+1**: `listUsers` (2 per user), `listRoles`, location names (3 lookups per
  save), Excel import (~7 queries per row, no transaction or row cap).
- **Non-atomic writes**: entity write and audit row are separate, audit errors
  are swallowed; files are written before their row, orphaned on failure.
- **Backup/restore block the event loop**: adm-zip reads every image and
  compresses synchronously; no backup/restore mutex; no retention; no
  pre-restore safety backup; images extracted after the DB commit.
- **Uploads** are base64 inside JSON with a global 50 MB `bodyLimit`, no
  per-file limit, no content sniffing, no thumbnails; auth runs as
  `preHandler`, so unauthenticated bodies are parsed before rejection.
- **Error shapes** vary (`{code,messageKey,message}` / `{message}` /
  `{ok:false,message}`); several routes return raw driver text as 400;
  `DocumentError` is dead; `z.coerce.boolean()` turns `"false"` into `true`.
- Already good: no `any`, consistent-snapshot export, single-transaction
  restore with validation first, path-traversal guards, advisory-locked
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

- **API child is not supervised**: it never exits when Electron dies
  (orphan holds port 34567 with an old token), an exit after startup is only
  logged, and the scheduled-backup `fetch` previously had no timeout.
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

### Phase 0 — measurement harness (prerequisite for performance claims)

- Startup timing via the existing Playwright `_electron` setup: launch →
  splash shown → `/api/health` READY → `startup:renderer-ready`, cold
  (fresh profile) and warm, 10 runs, median and p95.
- Idle and loaded RSS/CPU of main, renderer and API processes.
- API latency script (autocannon or a small `fetch` loop) over dashboard,
  property list/search, image list, with a seeded dataset of ~5k properties.
- NSIS installer build in CI or locally for size tracking.

### Phase 1 — safety and correctness (low risk, small)

1. API lifecycle: spawn with an IPC channel and exit on `disconnect`; kill
   cloudflared on API exit; enforce `REMOTE_ACCESS_ENABLED`.
2. Backup/restore mutex; drop `config.json` from archives; pre-restore safety
   backup; retention of the last N backups.
3. Dashboard and matching: filter sections by permission.
4. Auth to `onRequest`; global `bodyLimit` 1 MB with explicit per-route
   limits for uploads, import and restore.
5. Race-safe record codes (advisory lock or one retry on 23505).
6. Atomic `config.json` writes with a `.bak`.
7. Runtime suites read `DB_*` and use unique database names.

### Phase 2 — backend efficiency

1. Session/permission cache (30–60 s TTL, invalidated on logout and on user,
   role or permission changes).
2. Dashboard: two aggregate queries with `count(*) FILTER (…)` plus
   `Promise.all` for the rest.
3. Index migration for measured query patterns (`created_at`/`updated_at`
   orderings, `owner_person_id`, `audit_logs(entity_type, created_at)`); drop
   the duplicate `sessions.token_hash` index. Verify with
   `EXPLAIN (ANALYZE, BUFFERS)` on the Phase 0 dataset.
4. Pool tuning and a statement timeout (exempting backup/restore).
5. Fix N+1s: users/roles listing, location names, import (transaction + cap).
6. Owner filter and server pagination for person details, people, requests,
   documents.

### Phase 3 — renderer startup and responsiveness

1. `vite-plugin-vuetify` auto-import (tree-shaking); verify no dynamically
   named components.
2. Icons: `mdi-svg` with `@mdi/js` (only used icons), at least for the splash.
3. Lazy-load xlsx; remove dead exports.
4. Table thumbnails: return the primary image id in list responses, render a
   lazy `<img>`; generate thumbnails server-side (or downscale on upload).
5. Request hygiene: AbortController in list loads, remove duplicate fires,
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
