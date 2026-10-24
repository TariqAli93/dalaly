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

## 2. Owner decisions

These are not code-quality calls; they change history, data or behavior.
The owner decided all six on 2026-10-24. The numbered questions below the
table are what they answer.

| Decision | What the owner decided                                                                                                                                                                      | Status |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D1       | Keep only the newest backups (retention, question 5 and Phase 1.2).                                                                                                                         | Done   |
| D2       | Starting and stopping the remote-access tunnel needs a dedicated `remote_access.manage` permission, Super Admin only by default; the unused `REMOTE_ACCESS_ENABLED` flag goes (question 4). | Done   |
| D3       | Scheduled email backups are encrypted and hold the database only (question 5).                                                                                                              | Done   |
| D4       | Formally retire the contract-removal path: old contract tables on existing installs stay untouched, no migration drops them, and the dead runner code and obsolete tests go (question 1).   | Done   |
| D5       | Stop tracking data files, and download `cloudflared.exe` at package time instead of committing it (question 2).                                                                             | Done   |
| D6       | Unnamed listings get Arabic names (question 3).                                                                                                                                             | Done   |

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

   _Decided (D4): formally retired._ `run-migrations.ts` no longer checks
   the deleted tags and lost the `approvedRetirement` option (its hash
   check stays); `removal-core`, `removal-legacy` and `removal-rehearsal`
   and their scripts are gone, `removal-backup` still runs as
   `test:removal:backup`. With them went `removal-legacy`'s "a historical
   contract alone marks the installation initialized" protection, which
   lived only in the `0003` branch and had not run since the squash; setup
   still treats a setup marker, a user, or any people, property or rental
   row as an initialized install. `CLAUDE.md`, `ARCHITECTURE.md` and the
   removal map say that old contract data stays untouched until a cleanup
   the owner approves separately, after a full `pg_dump` and a real
   restore test.

2. **Files tracked in git that should not be** (~55 MB of the 84 MB `.git`):
   `tools/cloudflared/cloudflared.exe` (54 MB), PostgreSQL dumps under
   `server/data/backups/` (may contain legacy contract data — CLAUDE.md
   requires approval), `server/data/documents/**` (tracked despite
   `.gitignore`), demo images. Untracking is safe for the working tree;
   purging history is a separate, force-push decision.
   - _Implemented (owner decision 5, 2026-10-24):_ the owner confirmed the
     dumps and documents hold no real customer data. They, the 60 seed
     images (68-byte PNGs that `pnpm db:seed` writes; the web demo copies
     its own from `source-assets/`) and `cloudflared.exe` are untracked,
     and `.gitignore` covers `server/data/` and `tools/cloudflared/` (except
     its `.gitkeep`). The packaging scripts run `pnpm fetch:cloudflared`,
     which downloads cloudflared 2026.5.0 from Cloudflare's GitHub release
     and checks a pinned SHA-256 (`scripts/fetch-cloudflared.mjs`; the hash
     is that of the binary previously tracked). `pnpm build`, `pnpm dev`
     and the tests do not need the file or the network. History was not
     rewritten, so a full clone still downloads the old blobs: its `.git`
     stays about 31–33 MB (single-branch clone of `main` before, of this
     branch after). The checkout falls from 70.8 MB in 504 files to
     20.5 MB in 429 files, and a `--depth 1` clone's `.git` from 23.5 MB to
     6.4 MB. Shrinking full clones still needs the history purge above.
3. **Synthetic English listing names.** `toApiObject` fills a missing `name`
   with `"properties P-0001"` / `"rentals R-…"`, so English shows in the Arabic
   UI and the renderer's Arabic fallbacks never run. Fixing it changes the
   API response (`name` becomes `null`); check exports/PDF first.
   _Decided (D6), done:_ `name` stays filled, in Arabic: "عقار P-0001",
   "إيجار R-0001", so exports, the PDF and matching keep a title. People
   no longer get one (they have `full_name`; nothing read it). The
   renderer's fallbacks (rental table and favorites, details, summaries,
   Excel, text and folder exports) use the same words. Not changed: the
   edit forms prefill `name` from the API, so saving an unnamed listing
   stores its fallback as its name, as it stored the English one before.
4. **Remote access defaults.** `REMOTE_ACCESS_ENABLED` is reported but never
   enforced, and the cloudflared child is not killed when the API exits, so a
   public tunnel can outlive the app. Decide whether the flag should gate
   `/api/remote-access/enable`.
   _Decided (D2), done:_ the flag is removed (with the `enabled` field it
   fed in `/remote-access/status`). `enable` and `disable` need
   `remote_access.manage`, which `seedSystemRbac` grants to Super Admin on
   every startup, so existing installs have it after their next launch; a
   custom role with `settings.update` no longer starts the tunnel until
   it is given the new permission. Status stays on `settings.read`. Test:
   `test:remote-access`. The tunnel outliving the app is unchanged
   (Phase 1.1).
5. **Backup contents and retention.** _Decided 2026-10-24 and implemented._
   Backups no longer include `config.json` (the database password). The
   scheduled email carries only a password-encrypted, database-only archive
   (`.dalaly-enc`: no images or ID scans, far below mail size limits); the
   password is set in the scheduled-backup card, a lost password makes the
   emailed copies unrecoverable, and full backups stay in the local folder.
   The app keeps the newest 10 scheduled backups and the newest 10
   pre-restore copies, never deletes manual backups or exports, and logs
   each deletion. See `docs/ARCHITECTURE.md` (backup conventions);
   `test:backup:retention` and `test:backup:encrypted`.

## 3. Findings by area (open)

### Server and database

- ~~**Pool defaults**~~ (max 10, 10 s idle, 1.5 s connect/queue timeout, no
  statement timeout; `reconfigurePool` rebuilt a bare config): done in
  Phase 2.4.
- ~~**Dashboard runs ~13 sequential queries**~~ (properties scanned ~8
  times): done in Phase 2.2. The RBAC leak (rentals, audit activity and
  follow-ups under `properties.read`; matching across domains) is fixed in
  Phase 1.
- **Every authenticated request costs 3 queries** (session + roles +
  permissions); a 20-thumbnail gallery ≈ 80 queries. A short-TTL, explicitly
  invalidated session cache is the single biggest backend win.
- **Record codes** (`P-…`, `R-…`, people, requests, documents) are read-max +1;
  Phase 1 retries on a collision, so simultaneous saves no longer fail.
- **No pagination** for the audit log. (Properties, rentals, people,
  requests and documents are paged on the server, and person details asks
  for its owner's offers; Phase 2.6. The person pickers search the server
  too.)
- **Search**: property and rental search use one indexed `search_text`
  column, and every search and text filter escapes `%`, `_` and `\`
  (Phase 2.7). People and requests search still OR `ILIKE` over a few
  columns with no index; their cost has not been measured. (The
  duplicate-plot check before a save is an index scan since Phase 2.5.)
- **N+1**: fixed in Phase 2.5 for the users and roles lists, location names
  and the Excel import, which also commits in one transaction and caps the
  file at 5,000 rows.
- **Non-atomic writes**: entity write and audit row are separate, audit errors
  are swallowed; files are written before their row, orphaned on failure.
- **Backup/restore block the event loop**: resolved in Phase 4.1. adm-zip
  read every image into memory and compressed synchronously: a 2 GB backup
  froze the API for its whole length and peaked at 6.7 GB, a restore at
  8.7 GB; with 2.4 GB of files the backup failed ("Array buffer allocation
  failed") and archives over 2 GiB could not be restored. Still: images
  extracted after the DB commit. (Lock and pre-restore copy added in
  Phase 1, retention after the owner's decision, section 2.5.)
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
  (Done since: list rows carry their primary image and show a 320 px
  thumbnail; see Phase 3 item 4.)
- **Stale responses** can overwrite newer searches (no AbortController or
  request id); clearing filters and topbar navigation fire duplicate loads.
- **Waterfalls**: the rentals page loads reference data sequentially;
  `useLocations` has no in-flight dedupe. (The rental and property forms, the
  documents and request pages no longer wait for every person: the person
  pickers search the server.)
- **The sale offer form cannot link its owner to a person** (the rental form
  can, "ربط المالك بعميل"), so person details lists only offers linked by
  data or import. Its `people` prop was never shown and has been removed.
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
  database names; `test:removal` is broken by the migration squash
  (removed, D4).
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
   (Phase 2.7). Done: 4 clients searching as the properties page does get
   16–18 ms (62–65 ms before); the old array request still returns every
   matching row and stays slow for words in most rows.
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
   `REMOTE_ACCESS_ENABLED` was removed rather than enforced; the tunnel
   needs `remote_access.manage` (D2).
2. Done: backups no longer include `config.json`; backup, export, scheduled
   run and restore share one lock (409 when busy); restore first writes
   `Dalaly_Before_Restore_<time>.zip`. Retention, decided by the owner
   (section 2.5): the newest 10 scheduled backups and 10 pre-restore copies
   are kept; nothing else is deleted.
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
7. Done: the runtime smoke suites read `DB_HOST`/`DB_PORT`/`DB_USER`/
   `DB_PASSWORD`, name their databases `dalaly_<suite>_test_<pid>_<ms>` and
   drop only names of that shape (`scripts/runtime-smoke-db.mjs`).
   `test:runtime:spaces` now expects backups _without_ `config.json`.

New DB-backed suites: `test:permissions`, `test:backup:safety`,
`test:limits`, `test:codes`, `test:transactions` (each fails without its
fix).

### Phase 2 — backend efficiency

1. Session/permission cache (30–60 s TTL, invalidated on logout and on user,
   role or permission changes).
2. Done: dashboard. One aggregate per table for the status counts and money
   figures (`count(*) FILTER (…)`), the monthly activity in one pass instead
   of a nested loop, the 20 newest audit rows taken before their joins, and
   the 12 statements run two at a time (an unbounded `Promise.all` was
   slowest after an idle pause: one new backend per query). Same response,
   byte for byte (`test:dashboard` against the old queries). Packaged:
   42.5–42.9 → 15.6–21.4 ms, 4 clients 57–69 → 130–142 requests/s; login →
   dashboard in the app within noise. The merged aggregate alone was within
   noise; an audit index (item 3) would cut the remaining 3.7 ms.
3. Index migration for measured query patterns (`created_at`/`updated_at`
   orderings, `owner_person_id`, `audit_logs(entity_type, created_at)`); drop
   the duplicate `sessions.token_hash` index. Verify with
   `EXPLAIN (ANALYZE, BUFFERS)` on the Phase 0 dataset. Measured for
   `owner_person_id`: a sequential scan of 0.8 ms at 5,000 properties and
   8 ms at 50,000, so no index yet (`docs/PERFORMANCE.md`, "Paging the
   remaining lists").
4. Done: pool tuning and a statement timeout. One `buildPoolConfig` for the
   request, post-setup and startup pools: max 10, 2 connections kept while
   idle, others closed after 5 minutes, 5 s to get a connection (health and
   startup keep 1.5 s). The first request after a 12 s pause: `/auth/me`
   41–42 → 3.4–4.6 ms, dashboard 90–96 → 15.7–31.4 ms. PostgreSQL cancels
   statements after 15 s, answered with an Arabic 503 (and a 503 when no
   connection comes in time); backup, restore and migrations lift it inside
   their transactions (`test:timeouts`). Costs: up to 8 open connections for
   5 minutes after a burst (~6 MB each in PostgreSQL), and a statement that
   waits more than 15 s now fails. See `docs/PERFORMANCE.md`, "Pool,
   statement timeout and dashboard".
5. Done: N+1s and the import. The users and roles lists load every listed
   row's roles and permissions together (3 and 2 queries instead of
   1 + 2 per user and 1 + 1 per role); saving a property, rental or
   request reads its picked locations' names in one query instead of
   three; the duplicate-plot check states its index's predicate, so it is
   an index scan (0.02 ms) instead of a scan of every listing (3 ms at
   5,000, 25 ms at 50,000). The Excel import commits in one transaction
   holding the properties code lock, so a failure part-way saves nothing;
   it reads what the rows need once per file and inserts 100 rows per
   statement: 5,000 rows in ~1.6 s instead of ~33 s, 66 statements
   instead of ~35,000. Validate and commit refuse files over 5,000 rows.
   Cost: a listing saved during an import waits for its commit (up to
   ~1 s at 5,000 rows). Results in `docs/PERFORMANCE.md`, "Excel import
   and N+1 queries". **Found on the way:** both import steps report zod's
   built-in messages in English (`Too small: expected string…`), only the
   custom checks are Arabic; a missing linked owner used to come back as
   the driver's `Failed query: insert …` text (now Arabic).
6. Done: server pagination end to end. `GET /properties/paged` and
   `/rentals/paged` (page, size, whitelisted sort including area in m²,
   total), then `/people/paged`, `/rental-requests/paged`,
   `/purchase-requests/paged` and `/documents/paged` (the documents status
   filter, "expired" included, moved into SQL), all on
   `v-data-table-server`. Person details asks `/properties/paged` for its
   owner's offers (`owner_person_id`, `include_archived`) instead of
   downloading every property. Results in `docs/PERFORMANCE.md`.
7. Done: property and rental search match each token with one `LIKE` on
   `search_text`, a stored generated column (migration `0003_search_text`)
   with a `pg_trgm` index created best-effort; the four per-column trigram
   indexes only the old search used are dropped; `%`, `_` and `\` are
   escaped. `test:search` checks the rows found are the old search's.
   Searches for one listing (a phone, code, owner, plot, price) take under
   1 ms in PostgreSQL instead of 35–89 ms at 5,000 properties (215–431 ms at
   50,000); 4 clients searching as the page does get 16–18 ms instead of
   62–65 ms. Costs: bulk inserts and updates ~2–2.5× slower, single-row
   saves unchanged at the median; the table about twice as large, so
   unsearched list pages read more (+2–4 ms at 5,000 in-process, within
   noise through the API in one of two rounds; up to +70 ms at 50,000); the
   first start after the update runs the migration (~0.5 s at 5,000, ~5 s
   at 50,000). See `docs/PERFORMANCE.md`, "Search on one indexed column".
   People, rental and purchase request search and the property district and
   plot filters escape `%`, `_` and `\` the same way (`containsPattern`).
   Not done: Arabic letter normalization (hamza forms, ة/ه, ى/ي), a product
   decision since it widens what matches.

### Phase 3 — renderer startup and responsiveness

1. Done: `vite-plugin-vuetify` auto-import (main-window startup JS
   719 → 328 KB, module evaluation ~20 ms faster). Also done: the startup
   health wait (removes the ~350 ms slow-launch step) and charts drawn after
   the dashboard's first paint (figures ~150 ms sooner). See
   `docs/PERFORMANCE.md`, "Renderer startup and dashboard".
2. Icons: measured, not worth it for the splash (dropping the icon CSS did
   not change its load time). Revisit only with evidence for the main window.
3. Lazy-load xlsx; remove dead exports.
4. Done: table thumbnails. Paged and favorites list rows carry
   `primary_image`; tables render a lazy `<img>` of its thumbnail (JPEG,
   320 px), which the renderer makes on upload and, for older images, the
   first time a table shows them; the API stores thumbnails beside the
   images folder (out of backups) and decodes nothing. See
   `docs/PERFORMANCE.md`, "Table thumbnails". Galleries still load
   originals, including their small thumbnail strips.
5. Request hygiene: AbortController in list loads (done for the
   properties and rentals lists, `createPagedList`), remove duplicate fires
   (the top-bar search still loads twice: Enter and the filter debounce),
   `Promise.all` waterfalls, cached people/locations.
6. Persistent shell (`AppLayout` in a parent route), `useRefresh` cleanup,
   `shallowRef` for list payloads, cached `Intl.NumberFormat`.

### Phase 4 — files and backup at scale

1. Done: backups stream to `<name>.zip.partial` (yazl), renamed on
   success; restore reads entries from the zip on disk (yauzl). Same
   layout; `test:backup:compat` restores an archive from the adm-zip build.
   Results in `docs/PERFORMANCE.md` ("Backup and restore"). **Open (owner
   decision):** photos are deflated although they do not compress, most of
   a backup's time and CPU; storing image entries took a 2 GB backup from
   ~83 s to ~14 s in an isolated test, but changes how entries are
   compressed.
2. Multipart/streamed uploads with size and type checks. (Thumbnails now
   travel with image uploads and are checked: JPEG, at most 256 KB. The
   originals are still base64 JSON, stored as sent.)
3. App fonts TTF → WOFF2.

### Phase 5 — maintainability gates

1. Done: ESLint 9 flat config at the root (`eslint.config.mjs`) over
   `server`, `apps/renderer` and `apps/desktop`; `pnpm lint` runs it and
   the typecheck, CI's `check` job runs it. Errors only, defects only:
   `eslint:recommended` (no-undef in `.js`, empty blocks except `catch`),
   unused variables and imports, `@typescript-eslint/no-floating-promises`
   in `server/src` and `apps/renderer/src` (type-aware), and
   eslint-plugin-vue's `essential` set. Prettier still formats. Left out:
   floating promises in `.js` (Electron main has no type information) and in
   the test scripts (node:test's `test()` returns a promise), and the root
   `scripts/` tooling (perf harness, web demo).
2. Done: `DomainError(status, message, code?)` in `shared/errors.ts`, handled
   by the central error handler; `DuplicatePlotError`, `SetupError`,
   `BackupBusyError` and `ImportError` extend it (the streamed archive's
   read errors are 400 `DomainError`s too), `ThumbnailError` and the dead
   `DocumentError` are gone. Every error body is `{ code, message }` (`issues` added for
   validation), Arabic message; a `preSerialization` hook gives the plain
   `reply.code(…).send({ message })` answers their status's code, and unknown
   routes answer 404 in Arabic. Removed: the catch-alls in the users, roles,
   locations, backup, setup and setup-admin routes. Their Arabic business
   messages are `DomainError`s now (same text and status); unexpected
   failures, which used to send the driver's or file system's English text
   (400 in users/roles/locations, 500 `{ ok: false }` in backup), are a 409
   for unique/foreign-key violations and otherwise a generic 500. Setup keeps
   showing PostgreSQL's reason on purpose (`setupFailure`). Status changes:
   a backup file that cannot be read, the archive checks and the export-path
   checks are 400s (were 500s), and so is an empty document or image upload
   (was a generic 500). `booleanField` replaces
   `z.coerce.boolean()` (documents, properties, rentals). Shape changes:
   `ok: false` (backup, setup errors) and `messageKey` are gone, `code` is
   added; no caller read either (the renderer and Electron read `message`
   and the HTTP status). Fast test: `scripts/error-shape.test.ts` in
   `pnpm test`.
3. Shared renderer pieces where duplication is real: `FilterBar` +
   `useDebouncedApply`, one `ImageGallery` with a service adapter,
   `useListingSort`.
4. Done: `test:contract` (`scripts/api-contract.test.ts`, in CI's `database`
   job) calls every list and detail endpoint the renderer reads, plus the
   creates it uses, on a `removalTestContext()` database, and checks each
   body's keys and value types both ways against the renderer's own types.
   The expectations are generated: `scripts/renderer-contract.ts` reads the
   `request<T>(path)` calls in `apps/renderer/src/services` with the
   TypeScript compiler API, so drift on either side fails, and so does a
   renderer GET the test does not call. Error bodies are checked against
   the renderer's `ApiErrorBody`. What it found was fixed on the type side
   (a stale `RentalRecord.image`, roles embedded in users without
   `permission_ids`, rental follow-ups with `rental_id`, timestamps and
   `archived_at`/`permissions` the types left out). Not fixed, listed in
   `KNOWN_DRIFT` (API bugs; changing them changes responses): creating a
   follow-up returns the raw camelCase row. _Resolved (owner decision D6):_
   `toApiObject(row, table)` added a synthetic English `name` ("people
   P-1", and "properties P-1" for an unnamed property, which person
   details shows); people no longer get one, and unnamed listings read
   "عقار P-1" / "إيجار R-1". Also found:
   `PersonEditor.vue` maps validation issues by `issue.path`, but the API
   sends `field`, so field errors never reach their inputs (the message
   shows in the dialog's alert instead). Not covered: mutation responses
   other than the creates the test makes, file and image downloads,
   `/stats` (no renderer caller).
5. Done: the `database` job in `ci.yml` (Linux, PostgreSQL 18 service) runs
   the runtime, restore and other database suites. Left out, with reasons in
   the workflow and the README: the Electron, packaged-build and Playwright
   suites. `removal-core`/`removal-legacy` were removed with the retired
   removal path (D4).
