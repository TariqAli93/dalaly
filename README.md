# Dalaly

Dalaly is a local desktop app for managing real-estate offers for an Iraqi brokerage office. It runs with Electron, Vue 3, Vuetify, a local Fastify API, and PostgreSQL.

## Requirements

- Node.js 20+
- pnpm 10+
- PostgreSQL running locally
- Optional: `tools/cloudflared/cloudflared.exe` for remote access

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

## Checks and Tests

```bash
pnpm typecheck   # server tsc, renderer vue-tsc, Electron syntax check
pnpm test        # fast unit tests, no database needed
```

Database-backed suites create and drop their own `dalaly_*` test databases on the
local PostgreSQL. They read `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD`
(set `DB_NAME` to an existing database such as `postgres` for the `tsx` suites):

```bash
pnpm --filter @dalaly/server build            # runtime suites start server/dist
pnpm --filter @dalaly/server test:runtime     # also :phase1 … :phase5, :spaces
pnpm --filter @dalaly/server test:removal     # backup restore + retired-module checks (see below)
pnpm --filter @dalaly/server test:removal:backup # backup restore only
pnpm --filter @dalaly/server test:restore:large  # restore beyond one INSERT's bind limit
pnpm --filter @dalaly/server test:backup:safety  # no config.json, one operation at a time, pre-restore copy
pnpm --filter @dalaly/server test:permissions    # dashboard/matching follow read permissions
pnpm --filter @dalaly/server test:limits         # auth before body parsing, 1 MB limit off upload routes
pnpm --filter @dalaly/server test:codes          # concurrent saves get distinct codes; duplicates are 409
pnpm --filter @dalaly/server test:transactions   # db.transaction stays on one connection under load
pnpm --filter @dalaly/server test:paging         # server-paged property and rental lists
pnpm --filter @dalaly/server test:maps:runtime
pnpm --filter @dalaly/server test:startup:electron  # real Electron startup (needs a display)
```

CI (`.github/workflows/ci.yml`) runs typecheck, `pnpm test` and the build on
Windows, and the database suites in a separate `database` job on Linux against
a PostgreSQL 18 service container. That job runs every suite above except:

- `test:startup:electron`: launches the real Electron app, so it needs a
  display and the Windows Electron binary.
- `test:removal` (and `test:removal:legacy`): `removal-core.test.ts` and
  `removal-legacy.test.ts` replay the contract-system retirement migration
  `0003`, which the migration squash (`eb63ea4`) deleted, so they fail until
  that path is restored or formally retired (an owner decision,
  `docs/AUDIT_AND_ROADMAP.md` section 2.1). The third file runs as
  `test:removal:backup`.
- `test:removal:electron` and `test:removal:browser` (not listed above): they
  drive a packaged Windows build and the renderer in Playwright's Chromium.

Performance of a packaged build (startup, memory, API latency) against a
seeded throwaway database — see `docs/PERFORMANCE.md`:

```bash
pnpm perf -- --app apps/desktop/release/win-unpacked --label my-change
```

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

Remote access is optional. Place `cloudflared.exe` at:

```text
tools/cloudflared/cloudflared.exe
```

The core app works normally when this file is missing. The remote-access page will show a clear unavailable message.


## نطاق التطبيق والبيانات التاريخية

تقتصر الوظائف التشغيلية على إدارة الأشخاص والعقارات والإيجارات والطلبات
والمطابقة والمستندات العامة والإعدادات والنسخ الاحتياطي. يستخدم تصدير العقارات
إلى PDF محرك Electron المدمج؛ لا يحتاج التطبيق إلى متصفح مستقل أو حزمة Office.

تحتاج إزالة بيانات الأنظمة السابقة من قاعدة قائمة أو إتلاف وثائقها التاريخية
إلى موافقة مستقلة بعد النسخ الاحتياطي واختبار الاستعادة. راجع
[خريطة إزالة النظام السابق](docs/CONTRACT_SYSTEM_REMOVAL_MAP.md).
