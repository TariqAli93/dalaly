# Dalaly startup and setup recovery

Electron now opens the existing Setup wizard automatically when the database is missing. The backend owns the startup classification, and the renderer consumes that state before running authentication or permission guards.

## Root cause

`apps/desktop/src/main.js` previously rejected every configured installation whose health reported `db_connected: false` or `migrations_ok: false`. That happened before `createWindow()`, so Vue and its `/first-run` guard never loaded when a configured database had been deleted. The catch handler kept the Splash window open.

The health endpoint also collapsed every connection failure into `database_exists: false`, making a stopped server indistinguishable from a deleted database. Its HTTP fetch had no per-request deadline, and the renderer only waited for the first paint rather than completed router navigation. In development, `tsx watch` stayed alive after a failed backend bind, preventing the Retry button from starting a new backend process.

## Behavior

| Condition                                                   | State and destination                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Database checks/migrations are running                      | `CHECKING`; Splash shows database progress                                            |
| No configuration                                            | `SETUP_REQUIRED`; existing wizard at `/setup`                                         |
| PostgreSQL reports missing database (`3D000`)               | `SETUP_REQUIRED`; `/setup`, even with saved configuration                             |
| Server unreachable or credentials rejected                  | `ERROR`; connection message and Retry, no creation attempt                            |
| Missing migration assets or incomplete schema               | `SETUP_REQUIRED`; existing wizard offers safe recovery                                |
| Fresh database with no administrator                        | `SETUP_REQUIRED`; administrator step with corrected step numbers                      |
| Previously initialized installation loses its administrator | Recovery message; anonymous administrator creation is rejected                        |
| Users table was dropped after its migrations were applied   | Recovery interface; migration failure is reported without resetting the schema/ledger |
| Valid database and active Super Admin                       | `READY`; Login or authenticated Dashboard                                             |
| Backend fails or does not respond                           | Deadline expires; Splash offers Retry, logs and Quit                                  |

`/first-run` remains an alias of `/setup`. Browser startup errors use `/startup-error`; the desktop keeps its existing Splash error UI. Electron waits for both first paint and a sender-validated renderer IPC acknowledgement sent after `router.isReady()`, mounting and `nextTick()`.

The backend listens before database preparation. A fresh PostgreSQL client determines database existence, avoiding stale pooled connections and preserving error codes. Existence is `null` when the server cannot establish it. When the server becomes reachable after an initial connection failure, a health retry resumes safe database preparation.

Setup mutations are restricted to loopback clients and trusted development origins. Desktop setup requests use a narrow preload/main IPC bridge and a per-launch internal token; arbitrary null-origin setup requests are rejected. File renderer CORS is enabled only for Electron-managed backends. Both startup windows keep context isolation, disable Node integration, and enable the renderer sandbox.

## Data and compatibility

- No existing database is dropped, reset or overwritten by application startup or recovery.
- Safe Drizzle migrations and RBAC seeding run against the current database; recovery does not create or promote accounts.
- A small additive `public.dalaly_setup_state` table records completed initialization independently of user accounts. Existing installations are marked before migration attempts; business records also protect older installations whose users table is missing.
- Initial administrator creation and the marker are committed together under a PostgreSQL advisory transaction lock. Concurrent setup operations are rejected. Existing users are never elevated by public setup.
- Normal startup no longer creates a default administrator. The explicit `db:migrate` CLI retains its previous bootstrap behavior.
- Health responses add `startup_state`, `startup_reason`, `connection_error` and `admin_setup_allowed`. `database_exists` can now be `null`, and `admin_exists` means an active Super Admin, rather than any user row. External consumers must account for these semantics.
- The original working tree had all `server/drizzle` SQL/journal files deleted. At the user's request, `npx drizzle-kit generate` created the new initial migration `0000_fresh_felicia_hardy.sql`, its schema snapshot, and migration journal. The configured `dalaly` database was verified empty before the migration was applied; all 42 application tables were created. This initial migration is for fresh databases; an existing installation with the old schema/history must retain its matching migration history rather than replay this new baseline.
- `npx drizzle-kit migrate` now succeeds. Drizzle CLI credentials honor `DATABASE_URL`, otherwise using the application's `DB_*` settings with SSL disabled, matching its existing local PostgreSQL connection behavior. Database preparation reports `migrations_ok: true`, `startup_reason: ADMIN_REQUIRED`, and `admin_setup_allowed: true`; no administrator was automatically created.
- The Electron regression suite copies the current migration assets into a temporary fixture, falling back to tracked assets from `HEAD` only when local migration files are missing.

## Verification

Run `pnpm --filter @dalaly/server test:startup` for state, HTTP timeout and setup security regressions. After building the renderer, run `pnpm --filter @dalaly/server test:startup:electron` for the real Windows Electron startup suite.

The Electron suite uses compiled `file://` renderer assets, the real main/preload processes, real local HTTP endpoints, and a randomly named PostgreSQL database. It verifies first launch, database creation, Setup → Login → Dashboard, restart, database deletion/relaunch, initial administrator creation, connection error/retry/recovery, missing migration assets, account/table loss protection, and a backend that never responds. A temporary TCP endpoint models database server interruption without stopping the developer's shared PostgreSQL service. The test cleans up only its generated database and profiles.

Verified: all six automated state/security/timeout tests and all eleven real Electron scenarios passed. Server and renderer TypeScript checks, production server/renderer builds, production asset checks, desktop JavaScript syntax checks and `git diff --check` passed. NSIS/portable packaging was not exercised by this development Electron suite. Database time limits apply to dedicated startup/setup connections, preserving the behavior of ordinary business queries.

## Exact files changed for this task

Desktop:

- `apps/desktop/src/main.js`
- `apps/desktop/src/preload.cjs`
- `apps/desktop/src/splash-preload.cjs`
- `apps/desktop/src/startup.js` (new)

Renderer:

- `apps/renderer/src/components/splash/SplashScreen.vue`
- `apps/renderer/src/composables/useSetup.ts`
- `apps/renderer/src/env.d.ts`
- `apps/renderer/src/main.ts`
- `apps/renderer/src/pages/FirstRunWizardPage.vue`
- `apps/renderer/src/pages/StartupErrorPage.vue` (new)
- `apps/renderer/src/router/index.ts`
- `apps/renderer/src/services/setup.service.ts`
- `apps/renderer/src/types/setup.types.ts`

Backend:

- `server/src/index.ts`
- `server/src/server.ts`
- `server/src/infrastructure/database/health.ts`
- `server/src/infrastructure/database/migrate.ts`
- `server/src/infrastructure/database/pool.ts`
- `server/src/infrastructure/database/run-migrations.ts`
- `server/src/infrastructure/database/setup-marker.ts` (new)
- `server/src/infrastructure/database/startup-state.ts` (new)
- `server/src/infrastructure/database/startup.ts` (new)
- `server/src/modules/auth/auth.hooks.ts`
- `server/src/modules/auth/auth.routes.ts`
- `server/src/modules/setup/setup.routes.ts`
- `server/src/modules/setup/setup.security.ts` (new)
- `server/src/modules/setup/setup.service.ts`
- `server/src/modules/rbac/rbac.service.ts`
- `server/drizzle.config.ts`
- `server/drizzle/0000_fresh_felicia_hardy.sql` (new baseline)
- `server/drizzle/meta/0000_snapshot.json` (generated)
- `server/drizzle/meta/_journal.json` (generated)

Tests and documentation:

- `server/package.json`
- `server/scripts/setup-security.test.ts` (new)
- `server/scripts/startup.test.ts` (new)
- `server/scripts/startup-electron.mjs` (new)
- `docs/STARTUP_FLOW.md` (new)

## References

- [PostgreSQL error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html): `3D000` identifies an invalid catalog name (missing target database); connection failure alone does not establish absence.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): `ready-to-show` identifies the first rendered frame, so application/router readiness is acknowledged separately.
- [Drizzle generate](https://orm.drizzle.team/docs/drizzle-kit-generate) and [Drizzle migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate): generation creates migration assets from the schema; migration applies them to the configured database.
