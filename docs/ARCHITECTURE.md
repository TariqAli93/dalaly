# Dalaly architecture

How the desktop app is put together, which layer owns what, and the conventions
to follow when changing it. Keep this file current when a boundary moves.

## Processes

```text
Electron main (apps/desktop/src)
 ├─ spawns ──► Fastify API (server/)  ── pg Pool ──► PostgreSQL
 │             127.0.0.1:34567, ELECTRON_RUN_AS_NODE child process
 ├─ splash window   (renderer/dist/splash.html + splash-preload.cjs)
 └─ main window     (renderer/dist/index.html  + preload.cjs)
                     Vue 3 + Vuetify, talks to the API over HTTP
```

- **Electron main** owns the app lifecycle, windows, native dialogs, files the
  user picks, the local `config.json` (database URL, scheduled backup), and the
  API child process. It never queries PostgreSQL itself.
- **Fastify API** owns validation, business rules, persistence and file storage
  under the app data folder (images, documents, backups). Every route except
  health, setup and login (`publicPaths` in `modules/auth/auth.hooks.ts`)
  requires a bearer session token; `requirePermission` checks RBAC keys per
  route. Anonymous setup mutations are further limited to local callers by
  `requireLocalSetup`, which also refuses requests forwarded by the optional
  Cloudflare tunnel (they arrive from 127.0.0.1). Wrong PINs are throttled
  per account in `modules/auth/login-throttle.ts`.
- **Logging**: the API's pino output is piped into electron-log in
  production. Request URLs are logged without their query string (image and
  download URLs carry the session token), and only failed (5xx) or slow
  (≥ 1 s) requests are logged, at warn level.
- **Renderer** owns UI state and presentation. Business data goes over HTTP
  through `apps/renderer/src/services/*.service.ts`; only native operations go
  over IPC, through `apps/renderer/src/platform/` (a browser fallback exists
  for the web demo).

### Startup

1. `main.js` shows the splash, starts the API (`tsx src/index.ts` in
   development, `resources/server/dist/index.js` when packaged) and polls
   `/api/health` every 100 ms until it answers. After the first `CHECKING` it
   asks `/api/health?wait=1`, which the API holds until database preparation
   settles (at most 4 s), so the window opens as soon as the database is
   ready rather than on the next poll.
2. The API listens immediately and prepares the database in the background
   (`infrastructure/database/startup.ts`): connection check, migrations, RBAC
   seed. `/api/health` reports `CHECKING`, `SETUP_REQUIRED`, `READY` or
   `ERROR` (see `docs/STARTUP_FLOW.md`).
3. The main window opens on `/setup` or `/`; the renderer reports back through
   `startup:renderer-ready` once the router has rendered, then the splash
   closes.

The per-launch `INTERNAL_TOKEN` (environment of the API child) authenticates
main-process calls such as setup proxying and the scheduled backup run.

## Electron main (`apps/desktop/src`)

| File                                | Responsibility                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `main.js`                           | lifecycle, main window, API child process, startup sequence, setup/startup/maps/config IPC |
| `splash.js`                         | splash window, progress stages, `splash:*` IPC                                             |
| `document-export.js`                | `export:save-pdf` (offscreen print), `export:save-file`, `export:save-folder`              |
| `backup.js`                         | backup file/folder dialogs, schedule IPC, email backup scheduler                           |
| `backup-schedule.js`                | pure due-time check (unit tested)                                                          |
| `app-config.js`                     | read/write `userData/config.json`                                                          |
| `json-file.js`                      | atomic JSON write with `.bak` copy; read falls back to it (unit tested)                    |
| `ipc-guard.js`                      | `isMainWindowSender`: privileged channels accept only the main window's top frame          |
| `external-links.js`, `startup.js`   | pure helpers (unit tested from `server/scripts`)                                           |
| `preload.cjs`, `splash-preload.cjs` | the only APIs exposed to the renderers                                                     |

Windows run with `contextIsolation`, `sandbox` and no `nodeIntegration`. A new
native capability needs: a handler that validates its sender and input, one
preload method, a typed entry in `apps/renderer/src/env.d.ts`, and an
implementation in both `platform/electron.ts` and `platform/web.ts`.

## API (`server/src`)

```text
index.ts            listen + background database preparation
server.ts           CORS, auth hook, error handler, route registration
infrastructure/     config, pg pool (hot-swappable after setup), drizzle
                    schema, migrations runner, startup state, seeds
modules/<domain>/   <domain>.routes.ts      endpoints + permissions
                    <domain>.schema.ts      zod request schemas
                    <domain>.repository.ts  queries, mapping, audit
                    <domain>.service.ts     only where logic spans tables,
                                            files or processes (backup,
                                            matching, setup, images, auth)
shared/             errors, domain constants, parseId, zod field helpers,
                    map-link parsing, case mapping
```

Conventions:

- Routes parse input with the module's zod schema (`schema.parse` errors become
  localized 400s in the central error handler), call a repository or service,
  and return snake_case objects (`toApiObject`).
- Use `parseId` from `shared/utils/parse-id.ts` for route ids and
  `shared/validation/fields.ts` for optional text/id/number fields.
- Large lists have a paged form next to the plain array: `GET
/<domain>/paged` takes the same filters plus `page`, `page_size` (max
  100), a whitelisted `sort_by` and `sort_order` (and `favorites_only` on
  the lists with favorites), and returns `{ items, total, page, page_size }`
  with the total from the same query (properties, rentals, people, rental
  and purchase requests, documents; helpers in `shared/utils/paging.ts`
  and `shared/validation/paging.ts`). Every sort ends on a unique
  tie-breaker so rows never repeat across pages. Every filter is a SQL
  condition, including the time-dependent ones (an "expired" document), so
  the total matches the rows. The array endpoints stay for callers that
  need every row (pickers, matching, the dashboard).
- Properties and rentals also filter by `owner_person_id`, and
  `include_archived=true` lists archived rows with the rest; person details
  uses both on `/properties/paged`.
- Backup archives are streamed (`modules/backup/backup.archive.ts`, yazl and
  yauzl): a backup writes files into `<name>.zip.partial` one at a time and
  renames it on success; a restore reads entries from the zip on disk (or
  the uploaded buffer) and writes each file once its CRC-32 matched. Never
  load a whole archive or media folder into memory. Keep the layout older
  builds read with adm-zip 0.5.17 (`manifest.json`, `data.json`,
  `images/properties/…`, `documents/…`, directory entries);
  `test:backup:compat` restores an archive written by such a build.
- User-facing messages are Arabic. Keep request/response shapes stable: the
  renderer types in `apps/renderer/src/types` mirror them by hand.
- Add a service file only when a repository alone would mix concerns; most
  modules are CRUD and stay `routes → repository`.
- Migrations live in `server/drizzle` and are never edited or deleted once
  shipped. `run-migrations.ts` deliberately skips the retired contract-system
  migrations by tag (`0001_contract_studio`/`0002_studio_ux`) and gates
  `0003_remove_contract_system` behind explicit approval; the current
  `0001_default_document_types` is unrelated and runs normally.
- The runner hashes each migration's raw bytes, so line endings are part of a
  shipped migration. `.gitattributes` pins `server/drizzle/*.sql` to LF (what
  drizzle-kit writes and what packaged builds and existing databases recorded),
  with `0001_default_document_types.sql` as the one CRLF exception. A new
  migration stays LF; never change a shipped migration's pin.
- Reference rows the app needs on a fresh install (default document types) are
  inserted by a data migration once per database; system permissions and the
  Super Admin role are re-seeded on every startup by `seedSystemRbac`.
- Indexes that existing data may block (the plot-identity unique index, the
  `pg_trgm` search indexes) are created best-effort by hand-written migrations
  (`DO $$ … EXCEPTION … RAISE NOTICE`) and are not declared in `schema.ts`;
  the runner logs migration notices.

## Renderer (`apps/renderer/src`)

```text
pages/         one per route (lazy-loaded in router/index.ts)
components/    app/ shell, shared/ reusable, <domain>/ feature components
composables/   cross-page state (auth, permissions, snackbar, confirm…)
services/      one HTTP client module per API area; api.service.ts holds
               the token, 401 handling and ApiError
platform/      native capabilities: electron.ts (preload bridge) / web.ts
constants/     domain option lists and Arabic labels (single source)
utils/         formatting (format.ts), files, exports, Excel import
types/         API record and form types
```

Conventions: Arabic UI and RTL throughout; numbers and dates use Latin digits
(`formatMoney`, `formatNumber`, `formatDateTime`); option lists and their label
maps come from `constants/` (for example `RENT_PERIODS` /
`RENT_PERIOD_LABELS`) rather than per-component copies.

Server-paged tables (`PropertiesTable`, `RentalTable` when given a `total`,
the people, requests and documents pages, a person's properties) use
`v-data-table-server` with their page, size and sort state in
`createPagedList` (`composables/usePagedList.ts`). It aborts a superseded
request and only the newest one writes its result; header keys of sortable
columns are the API's sort keys. A page that renders its table at once
starts the first load in `setup`, before the table emits its initial
options, so that load is not sent twice; `onError` replaces the snackbar
for a page that shows the error in place of the table.

Choosing a person goes through `components/people/PersonPicker.vue`, which
searches `/people/paged` (first 20 by name, then matches after a 300 ms
pause) and fetches the selected person by id; no page downloads every
person.

The layout is by type with domain subfolders. It is consistent and small
enough that a move to feature folders would cost more review and history churn
than it saves; revisit only if a domain grows its own composables and
services.

## Checks

See "Checks and Tests" in the README: `pnpm typecheck`, `pnpm test`, the
database-backed runtime suites and the real Electron startup suite.
