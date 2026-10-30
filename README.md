# Dalaly

Dalaly is a local desktop app for managing real-estate offers for an Iraqi brokerage office. It runs with Electron, Vue 3, Vuetify, a local Fastify API, and PostgreSQL.

## Requirements

- Node.js 20+
- pnpm 10+
- PostgreSQL running locally
- Packaging only: network access the first time, to fetch the pinned
  `cloudflared.exe` (see [Remote Access](#remote-access))

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a local PostgreSQL database:

   ```sql
   CREATE DATABASE dalaly;
   ```

3. Copy `.env.example` to `.env` and set the database credentials.
4. Run the migration manually to validate a fresh database before opening the app.
   Existing installations may require an explicitly approved database maintenance step.

   ```bash
   pnpm db:migrate
   ```

5. Start the app in development:

   ```bash
   pnpm dev
   ```

The Electron app starts the Fastify API on `127.0.0.1:34567` and loads the Vue/Vuetify renderer from Vite. On first startup the app validates PostgreSQL connectivity and shows a setup/login screen.

In development the API keeps its photos, documents and backups in `server/data`,
which git ignores; `pnpm db:seed` writes the seed photos there.

The setup screen creates the first administrator from the username and PIN entered
by the operator. No default administrator account is created automatically.

## Production Build

```bash
pnpm build
pnpm start
```

## Distribution Builds

```bash
pnpm package          # portable + installer targets
pnpm package:portable # Windows portable exe
pnpm package:installer # Windows NSIS installer
pnpm release          # full release build into apps/desktop/release
```

Each of these first runs `pnpm fetch:cloudflared`
(`scripts/fetch-cloudflared.mjs`), which puts cloudflared 2026.5.0 from
Cloudflare's GitHub release at `tools/cloudflared/cloudflared.exe` and checks
its pinned SHA-256. It downloads only when that file is missing or does not
match, so packaging again works offline, and a failed or mismatched download
stops the build. Running `electron-builder` directly (for example `--dir`) does
not fetch it: run `pnpm fetch:cloudflared` first, or that package has no
remote access.

## Checks and Tests

```bash
pnpm lint        # ESLint (eslint.config.mjs), then pnpm typecheck
pnpm typecheck   # server tsc, renderer vue-tsc, Electron syntax check
pnpm test        # fast unit tests, no database needed
```

Database-backed suites create and drop their own `dalaly_*` test databases on the
local PostgreSQL. They read `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD`
(set `DB_NAME` to an existing database such as `postgres` for the `tsx` suites):

```bash
pnpm --filter @dalaly/server build            # runtime suites start server/dist
pnpm --filter @dalaly/server test:runtime     # also :phase1 … :phase5, :spaces
pnpm --filter @dalaly/server test:removal:backup # full backup round trip; retired contract metadata is refused
pnpm --filter @dalaly/server test:restore:large  # restore beyond one INSERT's bind limit
pnpm --filter @dalaly/server test:backup:safety  # no config.json, one operation at a time, pre-restore copy
pnpm --filter @dalaly/server test:backup:compat  # an archive from the adm-zip build restores; new archives keep its layout
pnpm --filter @dalaly/server test:backup:retention # newest 10 scheduled/pre-restore copies kept; nothing else deleted
pnpm --filter @dalaly/server test:backup:encrypted # emailed archive: database only, encrypted; wrong password changes nothing
pnpm --filter @dalaly/server test:permissions    # dashboard/matching follow read permissions
pnpm --filter @dalaly/server test:remote-access  # only remote_access.manage starts the tunnel (never spawns cloudflared)
pnpm --filter @dalaly/server test:limits         # auth before body parsing, 1 MB limit off upload routes
pnpm --filter @dalaly/server test:media-tokens   # session tokens only in headers; media tokens open image files only
pnpm --filter @dalaly/server test:hardening     # server paths local only through the tunnel; system permissions and role names fixed
pnpm --filter @dalaly/server test:codes          # concurrent saves get distinct codes; duplicates are 409
pnpm --filter @dalaly/server test:transactions   # db.transaction stays on one connection under load
pnpm --filter @dalaly/server test:paging         # server-paged property and rental lists
pnpm --filter @dalaly/server test:thumbnails     # list rows' primary images, thumbnails, backups without them
pnpm --filter @dalaly/server test:files          # image, follow-up and document operations stay on their record; no orphan files
pnpm --filter @dalaly/server test:tasks          # follow-ups as tasks, customer activities, tasks list by permission, 0005 upgrade
pnpm --filter @dalaly/server test:customers      # duplicate warnings, customer audit, roles, source and assigned employee
pnpm --filter @dalaly/server test:deals          # deal stages, offers, close permission, pipeline totals, stalled deals, restores
pnpm --filter @dalaly/server test:accounting     # chart of accounts: default accounts, chart rules, permissions, restores
pnpm --filter @dalaly/server test:ledger         # journal: drafts and posting, immutability triggers, reversals, statements, closed months, restores
pnpm --filter @dalaly/server test:vouchers       # receipts and payments: purposes, cash and client-funds limits (also racing), voiding, triggers, restores
pnpm --filter @dalaly/server test:commissions    # commissions: accrual with employees' shares, allocated receipts and payouts (also racing), cancelling, triggers, restores
pnpm --filter @dalaly/server test:import         # Excel import: all rows or none, row cap, same skips as before
pnpm --filter @dalaly/server test:queries        # users/roles lists and location names in a fixed number of queries
pnpm --filter @dalaly/server test:dashboard      # dashboard summary unchanged by its merged queries
pnpm --filter @dalaly/server test:dashboard:operations # matching rules in SQL = evaluateMatch; sections follow permissions
pnpm --filter @dalaly/server test:timeouts       # slow statements cut off in Arabic; backup, restore, migrations exempt
pnpm --filter @dalaly/server test:search         # property/rental search finds the same rows as the per-column ILIKE
pnpm --filter @dalaly/server test:contract       # API responses vs the renderer's hand-written types
pnpm --filter @dalaly/server test:agreements     # contracts: drafts, issuing, immutable revisions, the four templates, backups
pnpm --filter @dalaly/server test:maps:runtime
pnpm --filter @dalaly/server test:startup:electron  # real Electron startup (needs a display)
```

CI (`.github/workflows/ci.yml`) runs typecheck, ESLint, `pnpm test` and the build on
Windows, and the database suites in a separate `database` job on Linux against
a PostgreSQL 18 service container. That job runs every suite above except:

- `test:startup:electron`: launches the real Electron app, so it needs a
  display and the Windows Electron binary.
- `test:removal:electron` and `test:removal:browser` (not listed above): they
  drive a packaged Windows build and the renderer in Playwright's Chromium.

Performance of a packaged build (startup, memory, API latency) against a
seeded throwaway database — see `docs/PERFORMANCE.md`:

```bash
pnpm perf -- --app apps/desktop/release/win-unpacked --label my-change
```

## Backups

Settings → النسخ الاحتياطي. A backup is a zip of the database, the property
images and the documents, written to the backup folder (manual backups and
exports are never deleted by the app). A restore first saves the current data
as `Dalaly_Before_Restore_<time>.zip`.

The scheduled run (desktop app only) writes a full backup into the backup folder
and emails only `Dalaly_Database_<time>.dalaly-enc`: the database without images
or documents, encrypted with the password set in the scheduled-backup card
(AES-256-GCM, scrypt). **A lost password makes every emailed copy
unrecoverable**; the full backups stay in the local folder. Restoring a
`.dalaly-enc` file asks for that password and leaves the images and documents on
disk as they are.

The app keeps the newest 10 scheduled backups and the newest 10 pre-restore
copies in the backup folder and deletes older ones of those two kinds only,
logging each deletion (`backup_logs`; the job shows as `pruned`).

## Web Demo Mode (capture only)

A separate, isolated mode that serves the same Vue app in a plain browser. It exists
to record screenshots and videos for the Codel website. It does **not** affect the
Electron app, the production build, or the development database.

```bash
pnpm demo:reset   # rebuild the isolated dalaly_demo database + demo images
pnpm dev:web      # API on 127.0.0.1:45699 + web UI on 127.0.0.1:5199
```

Isolation: separate env file (`.env.web-demo`), separate database (`dalaly_demo`),
separate API port (45699), separate web port (5199), separate data directory
(`server/data/web-demo`). Capture account: `demo.admin` / `246810` (local only).

Electron-only capabilities (native save/open dialogs, scheduled email backup) fall
back to browser equivalents through `apps/renderer/src/platform/`.

The Playwright capture suite and its `capture:*` scripts were removed; the
`docs/CAPTURE-*.md` files describe its last run.

## Remote Access

Remote access is optional. `cloudflared.exe` is not in the repository: packaging
fetches it (see [Distribution Builds](#distribution-builds)) and the package ships
it as `resources/tools/cloudflared/cloudflared.exe`. Nothing else needs it:
`pnpm build`, `pnpm dev`, the tests and the app itself run without the file and
without network access, and the remote-access page shows a clear unavailable
message. To try remote access from `pnpm dev`, run `pnpm fetch:cloudflared`.

Without network access, copy the official `cloudflared-windows-amd64.exe`
2026.5.0 to `tools/cloudflared/cloudflared.exe`; the script accepts any copy
with the pinned hash. To upgrade, change `VERSION` and `SHA256` in
`scripts/fetch-cloudflared.mjs` to the new release's (its release notes list
the checksums).


## نطاق التطبيق والبيانات التاريخية

تقتصر الوظائف التشغيلية على إدارة الأشخاص والعقارات والإيجارات والطلبات
والمطابقة والمستندات العامة والإعدادات والنسخ الاحتياطي. يستخدم تصدير العقارات
إلى PDF محرك Electron المدمج؛ لا يحتاج التطبيق إلى متصفح مستقل أو حزمة Office.

تحتاج إزالة بيانات الأنظمة السابقة من قاعدة قائمة أو إتلاف وثائقها التاريخية
إلى موافقة مستقلة بعد النسخ الاحتياطي واختبار الاستعادة. راجع
[خريطة إزالة النظام السابق](docs/CONTRACT_SYSTEM_REMOVAL_MAP.md).
