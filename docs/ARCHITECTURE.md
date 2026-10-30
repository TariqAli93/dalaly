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
  Cloudflare tunnel (they arrive from 127.0.0.1). Routes that name a path
  on this machine (the backup folder, an export target, a backup file to
  restore) use `requireLocalRequest` / `isLocalRequest` the same way, so a
  remote user can restore only by uploading the archive. System
  permissions (`SYSTEM_PERMISSIONS`) cannot be renamed or deleted, and
  system roles keep their names. Starting or stopping that
  tunnel needs `remote_access.manage`, which only Super Admin has by
  default; its status needs `settings.read`. Wrong PINs are throttled
  per account in `modules/auth/login-throttle.ts`, and one account's login
  (or PIN change) attempts run one at a time (`oneAtATime`), so a parallel
  burst cannot pass the check before the first failure is counted.
- **Tokens in URLs**: the session token is read from the `Authorization`
  header only, never from a query string. An `<img>` cannot send that
  header, so image, thumbnail and logo URLs carry `?media=<media token>`
  instead (`mediaUrl` in `services/api.service.ts`). The media token is an
  HMAC of the session's id keyed by its stored hash (`mediaTokenFor`),
  returned by login and `/auth/me`. It is accepted only on GET/HEAD of
  those file routes (`MEDIA_PATHS` in `auth.hooks.ts`), and it dies with
  its session. Documents open in `DocumentViewer`, which fetches the file
  with the header; nothing opens an API URL in the system browser
  (`safeExternalUrl` refuses loopback hosts).
- **Logging**: the API's pino output is piped into electron-log in
  production. Request URLs are logged without their query string (image
  URLs carry a media token), and only failed (5xx) or slow
  (≥ 1 s) requests are logged, at warn level. Errors are logged through
  `serializeError` (`shared/utils/log-errors.ts`), which keeps a query
  error's SQL and its database cause but replaces its bound values.
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

### Closing and quitting

- A form with unsaved changes (`useDirtyForm`) cancels `beforeunload`, and
  `main.js` answers `will-prevent-unload` with a native "تعديلات غير محفوظة"
  box whose default is to stay. The renderer cancels only when
  `platform.guardsUnsavedClose` is true. The browser always asks; on the
  desktop the preload's `confirmsUnsavedClose` flag says the main process
  will ask, so an older build is never left with a window that will not close.
- That box can cancel a quit that has already started, such as File → Exit
  from the default menu. So the API child and the backup scheduler stop on
  `will-quit`, which Electron emits only after every window has closed, and
  `before-quit` only closes the splash.

## Electron main (`apps/desktop/src`)

| File                                | Responsibility                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `main.js`                           | lifecycle, main window, API child process, startup sequence, setup/startup/maps/config IPC |
| `splash.js`                         | splash window, progress stages, `splash:*` IPC                                             |
| `document-export.js`                | `export:save-pdf` (offscreen print), `export:print-html` (system print dialog), `export:save-file`, `export:save-folder` |
| `backup.js`                         | backup file/folder dialogs, schedule IPC, scheduler emailing the encrypted database copy   |
| `backup-schedule.js`                | pure due-time check (unit tested)                                                          |
| `app-config.js`                     | read/write `userData/config.json`                                                          |
| `json-file.js`                      | atomic JSON write with `.bak` copy; read falls back to it (unit tested)                    |
| `ipc-guard.js`                      | `isMainWindowSender`: privileged channels accept only the main window's top frame          |
| `external-links.js`, `startup.js`   | pure helpers (unit tested from `server/scripts`)                                           |
| `preload.cjs`, `splash-preload.cjs` | the only APIs exposed to the renderers                                                     |

Windows run with `contextIsolation`, `sandbox` and no `nodeIntegration`. The
built `index.html` and `splash.html` carry a Content-Security-Policy `<meta>`
(`contentSecurityPolicy` in `apps/renderer/vite.config.ts`, build only):
scripts from the bundle alone, no `eval`, styles inline allowed (Vuetify),
network and images only to loopback ports, OpenStreetMap tiles, `data:` and
`blob:`, and `blob:` frames for the document viewer. On quit, `stopLocalApi`
ends the API with `taskkill /T` on Windows, so a remote-access tunnel it
started ends with it. The API also stops the tunnel on exit and signals, and
at startup stops a cloudflared left by a previous run (`remote-access.pid` in
the app data folder, checked against the process name). The scheduled-backup
settings are validated (`validateSchedule`): a changed SMTP host or user
drops the saved SMTP password unless a new one comes with it. A saved
database URL must be a `postgres(ql)://` URL (`isDatabaseUrl`). A new
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
  and return snake_case objects (`toApiObject`). Given `"properties"` or
  `"rentals"`, `toApiObject` names an unnamed listing after its code in
  Arabic (`عقار P-0001`, `إيجار R-0001`), and the renderer's fallbacks
  (tables, exports) use the same words; people have `full_name` and get no
  `name`.
- Errors: a failure the user should read is a
  `DomainError(status, message, code?)` from `shared/errors.ts`, thrown
  wherever it is detected; routes do not catch errors to reword them. The
  central handler in `server.ts` answers every error with one body,
  `{ code, message }` (plus `issues` for validation), the message in
  Arabic: zod → 400 `VALIDATION_ERROR`, `DomainError` → its status and code,
  unique/foreign-key violations → 409 `DUPLICATE_VALUE`/`RECORD_IN_USE`, a
  statement timeout or no free connection → 503
  `QUERY_TIMEOUT`/`DATABASE_BUSY` (below), Fastify's own client errors → their
  status with an Arabic message, anything else → 500 `INTERNAL_ERROR` with a
  generic message (the error goes to the log). A route that answers
  `reply.code(404).send({ message })` gets the status's `code` from a
  `preSerialization` hook. The one place that shows a driver's text is setup
  (`setupFailure` in `setup.service.ts`): the person installing needs
  PostgreSQL's own reason.
- Boolean body fields use `booleanField` from `shared/validation/fields.ts`;
  `z.coerce.boolean()` reads the string `"false"` as `true`.
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
- Property and rental search (`q`, or `search` on properties) splits the
  query on whitespace; every token must match. A token matches with one
  `LIKE` against the row's `search_text`, a stored generated column
  (migration `0003_search_text`) holding every searched column lower-cased
  and space-separated, so the `pg_trgm` index on it can serve the search
  (`searchTextContains` in `shared/utils/search.ts`; a token's `%`, `_` and
  `\` are escaped). Properties also match a token's digits against the owner
  phone's digits, which lead `search_text` (an anchored regex on the same
  column), and Arabic status labels on `status`. There is no Arabic letter
  normalization: hamza forms and ة/ه match as typed. `search_text` is not
  declared in `schema.ts`, so selects, backups and restores leave it out.
  Searching a new column means a new migration that redefines the column's
  expression, and adding the column to the reference search in
  `server/scripts/search-text.test.ts`.
- User-typed text reaches a `LIKE`/`ILIKE` pattern only through
  `containsPattern` (`shared/utils/search.ts`), which escapes `%`, `_` and
  `\`, so a search or text filter matches what was typed (people, requests,
  the property district and plot filters, and `searchTextContains`).
- Each row of the paged property and rental lists, and of the two favorites
  lists, carries `primary_image: { id, thumbnail } | null`: the image its
  table shows (the primary one, else the first in order) and whether that
  image has a thumbnail yet. Tables render it as a plain lazy `<img>`; no row
  asks for its image list.
- Images: originals are stored as uploaded and never rewritten. A thumbnail
  (JPEG, longest side 320 px) is a derived file at
  `images/thumbnails/<original file_path>.jpg`, a sibling of the images
  folder (`thumbnailsRoot()` in `modules/images/images.service.ts` derives
  it from `imagesDir`), so backups, which archive the images folder, leave
  thumbnails out, and a restored row finds its thumbnail again by its
  unchanged path. The API never decodes images: the renderer makes the
  thumbnail (`utils/thumbnails.ts`, `createImageBitmap` + canvas) and sends
  it with an upload, or with `PUT …/images/:imageId/thumbnail` for an image
  uploaded before thumbnails existed, the first time a table shows that
  image to a user with the images permission
  (`composables/useThumbnailBackfill.ts`). Until then the row shows the
  original. Deleting an image deletes its thumbnail.
- Every image route acts only on an image of the listing in its URL. A
  foreign or unknown id is a 404 that changes nothing, set-primary
  included. Each route runs under a `FOR NO KEY UPDATE` lock on the
  listing row. An upload (`storeImages`) checks that the listing exists and
  checks each file's leading bytes (JPEG, PNG, WebP, GIF, BMP; the stored
  extension comes from them). It then writes the batch's files and inserts
  all its rows in one transaction. If the rows fail, the files are removed.
  Deleting a listing deletes its image files, thumbnails and folder after
  the delete commits. A document's file is removed when its row cannot be
  inserted, and a replaced logo's previous file is removed. Follow-up
  updates and deletes likewise match the listing in the URL.
- A list that returns related rows loads them for every row at once (an
  `IN` query or a join), not with a query per row: users with their roles
  and permissions, roles with their permission ids. Saving a record reads
  the names of its picked locations in one query (`getLocationNames`).
- The Excel import commits in one transaction holding the properties code
  lock, so either every accepted row is saved or none is. It reads what the
  rows need (saved phones, location names, matching plots, linked people,
  last codes) once for the whole file and inserts 100 rows per statement.
  Files over `MAX_IMPORT_ROWS` (5,000) are refused by validate and commit,
  which bounds how long other new listings wait for that lock.
- Backup archives are streamed (`modules/backup/backup.archive.ts`, yazl and
  yauzl): a backup writes files into `<name>.zip.partial` one at a time and
  renames it on success; a restore reads entries from the zip on disk (or
  the uploaded buffer) and writes each file once its CRC-32 matched. Never
  load a whole archive or media folder into memory. Keep the layout older
  builds read with adm-zip 0.5.17 (`manifest.json`, `data.json`,
  `images/properties/…`, `documents/…`, directory entries);
  `test:backup:compat` restores an archive written by such a build.
- The scheduled run (`apps/desktop/src/backup.js`) writes a full backup to
  the backup folder (`/api/backup/internal-run`, type `email`) and emails
  only the database: `/api/backup/internal-email-archive` returns
  `manifest.json` (with `contents: "database"`) and `data.json`, zipped and
  encrypted in memory by `modules/backup/backup.crypto.ts` (AES-256-GCM,
  scrypt key, header `DALALYENC` + version + parameters + salt + IV +
  password check, authenticated), as `Dalaly_Database_<time>.dalaly-enc`.
  The password is kept like the SMTP one (`safeStorage`, never sent to the
  renderer); without it nothing is emailed. Restore recognizes the header,
  not the extension, and decrypts before reading anything, so a missing or
  wrong password or a damaged file is an Arabic 400 that changes nothing. A
  database-only archive restores rows and writes no files: the images and
  documents on disk stay, and the `images` scope is refused for it.
- Tables added after backup version 3 was defined (the six contract
  tables, `activities`, the three deal tables) are marked `optional` in
  `TABLE_SPECS`: an archive from an older build lacks them and restores them
  empty. They are in the `full` scope, the templates also in `settings`, and
  contracts, deals and activities in `crm` (they reference customers).
  `TABLE_SPECS` and each scope list tables in foreign-key order, since rows
  go in in that order and come out in reverse.
- A scoped restore replaces whole tables, and deleting a table's rows sets
  links to them from tables outside the scope to null (ON DELETE SET NULL).
  `KEPT_LINKS` are saved first and put back where their target is in the
  restored data: listing owners and follow-up customers in a `crm` restore,
  a deal's or a contract's listing in a `properties` or `rentals` one. The
  other way round, a restored row may point at a listing or user deleted
  since the backup (`OUTSIDE_LINKS`); that link is cleared instead of
  failing the restore. Issued contract revisions keep the listing's data
  either way.
- Retention (owner decision, 2026-10-24): after a scheduled backup or a
  pre-restore copy succeeds, under the operation lock, copies of that kind
  beyond the newest 10 on disk are deleted. A file goes only if a successful
  job of that type recorded it, no other job did, it is named the way that
  kind is named, and it sits directly in the configured backup folder;
  manual backups, exports and other files are never deleted. Each deletion
  is logged and written to `backup_logs`, and its job rows become `pruned`
  (kept). Two backups in the same second get `_2`, `_3`… names instead of
  sharing one.
- Database connections: `buildPoolConfig(target)` in
  `infrastructure/config.ts` configures every pool on the app's database
  (the request pool, the one `reconfigurePool` switches to after setup, the
  startup pool): at most 10 connections, 2 kept open however long the app
  is idle, the rest closed after 5 minutes unused, 5 s to get a connection.
  Health checks and startup connect with the shorter 1.5 s timeout.
  PostgreSQL cancels any statement after 15 s (`DB_STATEMENT_TIMEOUT_MS`);
  the central error handler answers that (SQLSTATE 57014) with a 503
  `QUERY_TIMEOUT`, and a request that got no connection in time with a 503
  `DATABASE_BUSY`, both in Arabic. Work that may legitimately run longer
  starts its transaction with `SET LOCAL statement_timeout = 0`: the backup
  snapshot, the restore and the migration transaction (which also runs
  without the startup pool's client-side read timeout, `withMigrationPool`).
  Measurements behind the values: `docs/PERFORMANCE.md`, "Pool, statement
  timeout and dashboard".
- The dashboard summary runs its queries at most two at a time
  (`inParallel` in `dashboard.repository.ts`); each running query holds a
  connection, and after an idle pause every extra one is a new backend.
  `test:dashboard` compares its response with the pre-merge queries kept in
  `server/scripts/dashboard-reference.ts`. The renderer's dashboard no
  longer calls it; it reads `/dashboard/overview` and `/dashboard/matching`
  (`dashboard.operations.repository.ts`), which need only a signed-in user
  and return `null` for each section whose read permission is missing.
  Every figure is defined in `docs/OPERATIONS_DASHBOARD.md`.
- Matching rules live in `modules/matching/matching.rules.ts`, once as
  `evaluateMatch` (one pair, with reasons) and once as SQL builders (every
  pair, for the dashboard). Required criteria (type, and when stated
  location, budget, rent period) decide a match; preferences only rank.
  A change to one form needs the same change to the other:
  `test:dashboard:operations` evaluates every request against every listing
  both ways. Raw queries that return timestamps run on `pool` (compiled
  with `PgDialect`), since `db.execute` keeps them as PostgreSQL text.
- User-facing messages are Arabic. Keep request/response shapes stable: the
  renderer types in `apps/renderer/src/types` mirror them by hand, and
  `test:contract` checks every response the renderer reads against the type
  its service declares (`request<T>(path)`).
- Add a service file only when a repository alone would mix concerns; most
  modules are CRUD and stay `routes → repository`.
- Migrations live in `server/drizzle` and are never edited or deleted once
  shipped. `run-migrations.ts` applies, in journal order, each one newer
  than the last applied, and refuses to start when an applied one's hash
  changed. The retired contract system has no removal path: its tables, rows
  and files on an existing install stay as they are, the app never reads
  them, and no migration drops them. A cleanup needs the owner's separate
  approval after a backup and a real restore test
  (`docs/CONTRACT_SYSTEM_REMOVAL_MAP.md`).
- The runner hashes each migration's raw bytes, so line endings are part of a
  shipped migration. `.gitattributes` pins `server/drizzle/*.sql` to LF (what
  drizzle-kit writes and what packaged builds and existing databases recorded),
  with `0001_default_document_types.sql` as the one CRLF exception. A new
  migration stays LF; never change a shipped migration's pin.
- Reference rows the app needs on a fresh install (default document types) are
  inserted by a data migration once per database; system permissions and the
  Super Admin role are re-seeded on every startup by `seedSystemRbac`.
- Indexes that existing data may block (the plot-identity unique index, the
  `pg_trgm` indexes on `search_text` and on `plot_number`) are created
  best-effort by hand-written migrations
  (`DO $$ … EXCEPTION … RAISE NOTICE`) and are not declared in `schema.ts`;
  the runner logs migration notices. Without `pg_trgm` the search still
  works, by scanning.

## Customers (`modules/people`)

A customer has `roles` (buyer, seller, tenant, landlord, owner, investor,
other; several at once, a checked `text[]` with a GIN index), a `source`
(how they came) and an `assigned_user_id` (the employee who looks after
them), from migration `0006_customer_crm`. A payload that leaves these out
keeps them. Lists filter by `role` and `assigned` (`me`, `unassigned` or a
user id) and carry `assigned_user_name`; `GET /people/:id` adds
`implied_roles`, the roles the records themselves give (owner of a listing,
buyer or tenant with a request, a party to a contract), which are never
stored. `GET /people/duplicates` finds other customers with one of the
given phones (compared by their last ten digits, `phoneKey`: 0770…, +964 770…
and 00964 770… are one number) or the same national ID, archived ones
included; the form warns, nothing is merged. Creating, editing (with the
old and new values), archiving and restoring a customer are audited
(`entity_type` `person`, `GET /people/:id/audit` with `audit.read`).

## Tasks and activities (`modules/tasks`, `modules/activities`)

Follow-ups are tasks. `property_followups` and `rental_followups` carry the
task columns (migration `0005_crm_tasks`): `person_id`, `assigned_user_id`,
`status` (open, done, cancelled), `priority` (low, normal, high, urgent),
`completed_at`, `outcome` and `updated_at`; `scheduled_at` is the due date
and `user_id` who recorded it. `activities` has the same columns for what
belongs to a customer rather than a listing (a call, a meeting, a task
about one of their requests), and always names its customer. The shared
fields, statuses and their rules are `tasks.schema.ts`: a new row with a
date is open, one without is done (it records something that happened);
`completed_at` is set the first time a row becomes done and cleared when it
is reopened. An update that leaves a task field out keeps it, so older
clients that send only type, notes and date change nothing else.

- In the renderer, `pages/TasksPage.vue` is the tasks list and
  `components/tasks/TaskDialog.vue` the one task form, used by the listing
  follow-up history (`ListingFollowups`), the dashboard's
  `RecordFollowupDialog` and the tasks page. The caller passes what saving
  does (`save`); `useAssignees` loads who can be assigned once. Grid rows
  get an id from source and id (`id * 3 + source index`), since the three
  sources share id numbers.
- The tasks read model (`tasks.repository.ts`) is a `UNION ALL` of the
  three tables with a `source` column (`sale_followup`, `rental_followup`,
  `activity`), each included only when the caller has its read permissions
  (`followups.read` + `properties.read`, `rentals.followups.read` +
  `rentals.read`, `followups.read` + `people.read`). `GET /tasks/paged`
  filters by status (or `overdue`: open and past due), assignee, due window
  (the office's day, `OFFICE_TODAY`), customer, source, type and text;
  `PATCH /tasks/:source/:id` completes, reopens, cancels, reschedules or
  reassigns, checked against that source's update permission.
  `GET /people/:id/timeline` is the customer's rows with their last
  interaction and next due date. Writes other than that patch go to each
  table's own routes (`/properties/:id/followups`, `/rentals/:id/followups`,
  `/activities`).
- Moving follow-ups into one table was rejected (`BUSINESS_SYSTEM_PLAN.md`,
  6.1): the `properties` and `rentals` backup scopes restore follow-ups with
  their listings.
- A restore of an archive from before tasks gives its follow-ups the status
  `0005` gave existing rows (done unless the date is ahead; `upgradeRow`).
  A `crm` (customers) restore replaces `people`, which would set every link
  to a person from tables outside that scope to null; it saves those links
  (listing owners, follow-up customers) and puts back each whose person is
  in the restored data.

## Deals (`modules/deals`)

A deal is an opportunity from first interest to contract and outcome
(migration `0007_deals`): a sale or rent, a client (buyer or tenant) and an
owner (seller or landlord), a listing of the matching kind, the request it
came from, the contract it led to, an assignee, a currency (IQD or USD) and
exact amounts (asking and agreed price, expected commission;
`shared/money.ts`: decimal strings in the API, `bigint` minor units in code,
never a JavaScript number). A deal on a listing takes the listing's owner and
price when the payload leaves them empty.

- **Stages.** `new` … `contract_issued` are open and move freely among
  themselves, so a deal can go back a step; `won`, `lost` and `cancelled`
  close it. The rules are `deals.rules.ts` (`stageMoveError`, unit tested):
  `won` only from `agreed`, `contract_preparation` or `contract_issued`, with
  an agreed price and both parties; `lost` needs a reason, `cancelled` too;
  `contract_issued` needs an issued linked contract; a closed deal is reopened
  (with a reason) before it can close another way. `POST /deals/:id/stage`
  applies a move under a row lock and writes `deal_stage_history`; closing
  and reopening need `deals.close`, other moves `deals.update`.
- **Offers** (`deal_offers`) are made by the client or the owner. Accepting
  one makes its amount the agreed price and moves a deal still before
  `agreed` there, recorded like any other move. A closed deal takes no
  offers.
- Viewings, calls and negotiation steps are activities with `deal_id` (an
  activity names one of the deal's parties). A deal is stalled when it is
  open with no stage move, activity or offer for `stalled_days`.
- `GET /deals/pipeline` sums per stage and currency in SQL (numeric), never
  adding IQD to USD. Changes are audited (`entity_type` `deal`).
- **Contract.** `POST /deals/:id/agreement` (`deals.service.ts`) drafts a
  contract from a template of the deal's kind with the deal's parties,
  listing, currency, price and commission, links it, and moves a deal before
  `contract_preparation` there; a deal whose contract is not cancelled gets a
  409. When a linked contract is issued, the agreements route calls
  `onAgreementIssued`, which moves its open deal to `contract_issued`.
- Deals start from a request's match, a listing's page or a customer's page
  (`DealDialog` with a `preset`); a new deal sent without an owner takes the
  listing's.
- In the renderer, `pages/DealsPage.vue` is the board (open stages, one
  column each, totals from `/deals/pipeline`) and the table, and
  `pages/DealPage.vue` the deal's page; `components/deals/DealDialog.vue`
  and `DealStageDialog.vue` create, edit and move deals. Amounts are shown
  with `formatAmount` (`utils/format.ts`), which groups the decimal string
  itself rather than going through a number.

## Accounting (`modules/accounting`)

Money is exact (`shared/money.ts`), and IQD and USD are never converted or
added together.

- **Chart of accounts** (`accounts`, migration `0008_chart_of_accounts`).
  - An account is a heading (`is_postable` false), which groups accounts and
    may span both currencies (`currency` null), or a posting account, which
    has exactly one currency.
  - The rules are `accounting.rules.ts` (`accountChangeError`, unit tested):
    - a child has its parent's type, and its currency if the parent has one;
    - a parent is an active heading, and no account goes under itself or its
      own children;
    - a heading with children stays a heading and keeps its type;
    - a heading stops only after its children.
  - Chart edits lock the table against other chart edits (`SHARE ROW
    EXCLUSIVE`; reads continue), so two saves cannot make a cycle or reuse a
    code.
- **Default accounts** (`default-chart.ts`). Each has a `system_key`: a
  heading key (`cash`) or the posting account of one currency
  (`cash.IQD`). The ledger finds accounts by these keys, so they keep their
  code, type, currency and place; only the name and description change.
  - `ensureDefaultChart` adds any that are missing, after migrations at
    startup and after a full restore. An archive from before the chart
    restores an empty table and gets them back.
  - Money held for a landlord or seller is `client_funds` (a liability), never
    income. Only commissions and fees are revenue.
- **API.** `GET /accounting/accounts` needs `accounting.read`; `POST` and
  `PUT /accounting/accounts/:id` need `accounting.accounts.manage`.
  Changes are audited (`entity_type` `account`).
- **Backup.** `accounts` is in a full restore only. Rows go in parents
  first, since the table refers to itself.
- **General ledger** (`journal_entries`, `journal_lines`,
  `accounting_periods`; migration `0009_general_ledger`).
  - An entry is in one currency. It is written as a draft, its lines added,
    then posted. Each line debits or credits one active posting account of
    the entry's currency with a positive amount, and the debits equal the
    credits (`journal.rules.ts`, unit tested; sums in `bigint` minor units).
  - A posted entry never changes and is never deleted. A mistake is undone
    by a reversing entry, which posts the same lines with the sides swapped,
    once per entry.
  - A closed month ("YYYY-MM") takes no postings until it is reopened.
    Closing takes a `SHARE` lock on `journal_entries`, so postings in flight
    finish first.
  - `ledger.service.ts` (`writeEntry`) is the only way into the ledger.
    Receipts, payments and commissions write their entries through it inside
    their own transaction, with an idempotency key so a retry never posts
    twice.
  - The triggers of `0009` refuse the same again in the database, with
    SQLSTATE `DL001` and an Arabic message (answered as a 409
    `LEDGER_LOCKED`):
    - changes to posted entries or lines;
    - posting an unbalanced or wrong-currency entry, or into a closed month;
    - deleting a customer or deal a posted line names;
    - changing the type, currency or kind of an account with posted lines.
  - A restore replaces the tables whole and passes the triggers by setting
    `dalaly.ledger_restore` for its own transaction only. A customers
    restore keeps the lines' customer and deal links (`KEPT_LINKS`).
  - API under `/accounting`:
    - `journal/paged` and `journal/:id`, and `accounts/:id/statement`
      (opening balance and a running balance on the account's normal side),
      need `accounting.read`.
    - `journal` create, update and delete of drafts need
      `accounting.journal.create`.
    - `:id/post`, or `post: true` on a save, needs `accounting.journal.post`.
    - `:id/reverse` needs `accounting.journal.reverse`.
    - `periods` close and reopen need `accounting.periods.manage`.
  - Everything is audited (`journal_entry`, `accounting_period`).
- **Receipts and payments** (`vouchers`, migration `0010_vouchers`;
  `vouchers.rules.ts`, `vouchers.service.ts`). A receipt (`RC-000001`) or
  payment (`PV-000001`) moves money into or out of a cash or bank account.
  It is posted to the ledger through `writeEntry` in the same transaction,
  with the idempotency key `voucher:<id>`.
  - The purpose picks the other side and the types it may have:
    - a commission is income;
    - money collected for a landlord or seller is client funds (a
      liability), never income;
    - also receivables, other income, capital; for payments, expenses,
      employee commissions, payables and drawings.
  - A payment never takes more than the cash or bank account holds, or
    more client funds than were collected for that person. Payments from
    one account take turns (`FOR NO KEY UPDATE` on its row), so two cannot
    both spend one balance.
  - A voucher never changes. Voiding posts the reversing entry and marks it
    voided, with a reason. The `vouchers_guard` trigger (SQLSTATE `DL001`)
    allows only that change, refuses deletes and keeps the customer and deal
    it names.
  - A voucher's entry is reversed only by voiding the voucher: the journal
    refuses a manual reversal of an entry a document posted
    (`ENTRY_FROM_DOCUMENT`).
  - `decimalAmountInWords` (shared document module) writes the amount in
    words from its digits, for the printed receipt.
  - API `/api/vouchers`:
    - `vouchers.read`: `paged`, `:id`, `money-accounts` (with balances),
      `client-funds?person_id=`.
    - `vouchers.receipt` or `vouchers.payment` to issue, by kind.
    - `vouchers.void` to void.
  - Deleting a user who issued vouchers or posted entries is refused with
    "deactivate instead": `0010` replaces `journal_entries_guard` to say so.
- In the renderer, `pages/AccountsPage.vue` is the chart, a tree with
  filters by currency and text. `components/accounting/AccountDialog.vue`
  adds and edits accounts: a child takes its parent's type and currency, and
  a code is suggested.
- The journal pages are under "المالية":
  - `JournalPage.vue` lists entries (filters by currency, status, source,
    dates, text).
  - `JournalEntryPage.vue` shows an entry and offers what its status and the
    user's permissions allow: edit, post or delete a draft; reverse a posted
    entry.
  - `AccountStatementPage.vue` is an account's statement.
  - `components/accounting/JournalEntryDialog.vue` edits a draft's lines.
    Its balance uses `utils/money.ts` (bigint hundredths, as on the server),
    so "متوازن" there means the server will accept the post.
  - `PeriodsDialog.vue` closes and reopens months.
- The vouchers pages are under "المالية" too:
  - `VouchersPage.vue` lists receipts and payments.
  - `VoucherPage.vue` shows one, prints it or saves it as PDF, and voids it.
  - `components/accounting/VoucherDialog.vue` issues one. It shows each
    cash or bank account's balance, the client funds held for the chosen
    person, and the purpose's hint, and warns before an amount the server
    would refuse.
  - The printed copy is `utils/voucherPrint.ts`: A5, the office header (sent
    with the voucher, so a cashier without the settings permission can print
    it), the amount in figures and words, signature lines, and "ملغى" across
    a voided one. It goes through the platform's `printHtml` and
    `exportPdf`, with the bundled font embedded (`fontFacesFor`).

## Contracts (`modules/agreements`)

Contract Studio: sale, installment sale, residential and commercial lease
contracts, from exactly four built-in templates. The module and its tables,
permissions and API are named `agreements`: the retired system's names
(`contracts`, `contract_templates`, `studio_*`) stay reserved for its
untouched legacy rows (`docs/CONTRACT_SYSTEM_REMOVAL_MAP.md`).

- **One document model, both sides.** `server/src/shared/contract-document/`
  holds the block document model, the field registry (every `{{key}}` with
  its Arabic label and group), `resolveValues` (linked records and terms to
  display text, Latin digits, amounts in Arabic words), `findIssues` (what
  blocks issuing) and the HTML/CSS renderer. The API imports it directly;
  the renderer through the `@contract-document` alias (`vite.config.ts` and
  tsconfig `paths`). It has no Node or DOM imports. The editor preview,
  printing, the PDF, the API's issue check and the Word file all resolve
  fields through it.
- **Templates.** Factory definitions are code (`agreements.templates.ts`),
  deep-frozen and versioned with the app. `agreement_templates` has one row
  per key (a CHECK allows only the four; rows are created on first use) whose
  `definition` is the office's customised copy, or null for the factory one.
  Every save, reset (design only: the factory layout and styling with the
  current clauses; or all) and version restore writes
  `agreement_template_versions` and is checked against the version the editor
  opened (409 `TEMPLATE_CONFLICT`). No route creates or deletes a template.
- **Contracts.** A new contract copies the template's current definition into
  `agreements.document`; later template changes never reach it. Parties link
  customers (`agreement_parties`, one per role), and the listing is a sale
  listing for a sale and a rental listing for a lease. A draft saves the parts
  that changed against `draft_rev`; a stale save is a 409 `DRAFT_CONFLICT`
  and writes nothing. The renderer saves 1.2 s after the last change and keeps
  the unsaved state in localStorage (`utils/localDraft.ts`) until the save
  succeeds, so an interrupted save is offered back on the next visit.
- **Status.** draft to review, draft or review to issued, review to draft,
  issued to draft (the next revision, with a reason), and any to cancelled;
  enforced by the repository under a row lock. Issuing re-reads the linked
  records in the same transaction, refuses (422 `AGREEMENT_INCOMPLETE`, with
  the issues) while anything is missing, and inserts `agreement_revisions`
  with the document, the terms, the records' contract-safe fields
  (`pickParty` and `pickListing` leave notes out), the resolved values and
  the office logo. Revisions are never updated; an issued or cancelled
  contract shows its latest revision, a draft or a contract under review its
  live data.
- **Exports.** PDF and printing render the shared HTML with the bundled fonts
  embedded as data: URLs (`utils/contractExport.ts`; the `?inline` font chunks
  load on the first export) in Electron's own engine. The page CSS uses @page
  margin boxes for the repeated header and footer with page numbers. Word
  files are WordprocessingML written by `agreements.docx.ts` and zipped with
  yazl; Word paginates them itself, so its page breaks may differ slightly.
  Successful exports are recorded in `agreement_exports`. Drafts export with
  a «مسودة» watermark, cancelled contracts with «ملغى».
- **Editor.** `components/contracts/ContractStudio.vue`: structure panel,
  A4 canvas, inspector. Text areas are `InlineEditor` (contenteditable read
  back into text runs and field tokens; paste is plain text). Edits are
  immutable updates, so undo keeps whole documents (`useDocumentHistory`).
  `usePagination` moves a `[data-unit]` that would cross a page bottom to the
  next page, as `break-inside: avoid` does when printing; a unit taller than
  a page is outlined as a warning.
- Signed copies and other files attach through the documents module
  (`identity_documents.agreement_id`) and are stored with the customer's
  files.

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

The signed-in pages are children of one route whose component is
`layouts/AppLayout.vue` (sidebar, top bar, `<router-view>`), so the shell
stays mounted while the user moves between pages and keeps its state (an
expanded sidebar, which is also remembered between launches in
`localStorage`). The sidebar's groups, order and permissions are
`NAV_SECTIONS` in `constants/domain.ts`; create pages are not navigation
items. `Ctrl+K` opens `GlobalSearch`, which queries sale and rental
listings, customers and both request types through their paged endpoints.

Records have their own routes: `/properties/:id`, `/rentals/:id`,
`/clients/:id` (the customer hub: requests, owned listings, documents),
`/purchase-requests/:id` and `/rental-requests/:id` (the request with its
matches). The global router guard turns the older `?open=<id>` links on
`/rentals` and the request lists into those routes, including when only the
query changes. `/rentals?status=<status>` starts the list with that status;
the request lists take `?new=1&person=<id>` and `/documents` takes
`?person=<id>&new=1` to open their add dialog with the customer chosen.

Each page wraps its content in `components/app/AppPage.vue`, which writes
the title, parent link and count into the 48px command bar
(`usePageTitle`) and teleports the `header-actions` and `status` slots
there; there is no in-content page header. A page that can reload its data
registers it with `useRefresh` in `onMounted`; the registration ends when
the page unmounts, and the top bar's refresh button is disabled on pages
without one.

Shared building blocks live in `components/shared/` and every list, record
and form uses them rather than its own copy:

- `FilterBar` (search, inline filters, chips, an extra-filters drawer, 300 ms
  apply, `Ctrl+F` by `event.code`) inside a `.dal-panel.dal-listpanel`;
- `DataGrid` (+ `grid.ts`, `RowActions`): roving-tabindex rows, Enter opens,
  Space selects, `Shift+F10` menu, focus restored after `Alt+←`, and separate
  loading, empty, no-match and error-with-retry states; `compact` lists all
  rows without a footer inside a record;
- record pages: `RecordFacts` under the command bar, `DetailList`,
  `ListingImages` and `ListingFollowups` (one component per concern for sale
  and rental, chosen by `kind`);
- forms: `FormSection`, `FormActionsBar`, `useDirtyForm`, `useApiFormErrors`,
  `useSaveShortcut`; form dialogs handle `Ctrl+S` themselves (the page
  shortcut ignores open dialogs), stay open once edited, and return focus to
  their opener.

Server-paged tables (`PropertiesTable` and `RentalTable` when given a
`total`, the people, requests and documents pages, the customer hub's
lists) use `DataGrid` in server mode with their page, size and sort state in
`createPagedList` (`composables/usePagedList.ts`). The sale, rental,
customer and request lists keep that state at module level
(`useProperties`, `useRentals`, `usePeople`, `useRequests`), so filters, page
and sort survive a visit to a record. It aborts a superseded
request and only the newest one writes its result; header keys of sortable
columns are the API's sort keys. A page that renders its table at once
starts the first load in `setup`, before the table emits its initial
options, so that load is not sent twice; `onError` replaces the snackbar
for a page that shows the error in place of the table. The properties and
rentals filter bars apply after a 300 ms pause; that apply is skipped when
the filters equal those of the list's latest request (clearing the filters
or the top-bar search already loaded them). Code that sets the properties
filters elsewhere (dashboard, top-bar search, the offer form) calls
`startFromFirstPage` and opens the page, which loads once. Concurrent
`loadLocations` calls share one request.

Large libraries needed by one action load with `import()` when that action
runs (`xlsx` when the import dialog parses a file; Leaflet and Chart.js
likewise), not with the page.

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
