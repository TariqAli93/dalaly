# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Dalaly (`دلالي`) is a **local, offline-first Windows desktop app** for an Iraqi real-estate brokerage office: Electron shell + Vue 3/Vuetify renderer + local Fastify API + local PostgreSQL. The UI is Arabic/RTL and user-facing strings (including API error messages) are written in Arabic.

`docs/ARCHITECTURE.md` is the authoritative description of layer boundaries and conventions — read it before any non-trivial change, and update it when a boundary moves.

## Commands

pnpm 10+ workspace (`apps/desktop`, `apps/renderer`, `server`). Node 20+.

```bash
pnpm dev              # Vite renderer + Electron (waits for 127.0.0.1:5173)
pnpm build            # server + renderer builds, then asserts dist assets exist
pnpm start            # run Electron against the production build
pnpm typecheck        # server tsc, renderer vue-tsc, Electron syntax check
pnpm lint             # same as typecheck for server + renderer (no ESLint in repo)
pnpm format           # prettier across all three workspaces
pnpm test             # fast unit tests only; no database required
pnpm perf -- --app <win-unpacked>  # startup/memory/API timings of a packaged build (docs/PERFORMANCE.md)
pnpm db:migrate       # apply Drizzle migrations
pnpm db:seed          # (also db:seed:reset)
pnpm package          # Windows portable + NSIS installer into apps/desktop/release
```

### Tests

`pnpm test` runs four `node:test` files via `tsx` and needs no database (CI runs it with typecheck and build on `windows-latest`, `.github/workflows/ci.yml`). Everything heavier is a separate `@dalaly/server` script and **does** touch PostgreSQL — those suites create and drop their own `dalaly_*` databases using `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` (set `DB_NAME` to an existing database such as `postgres` for the `tsx` suites).

```bash
# one file
pnpm --filter @dalaly/server exec tsx --test scripts/location.test.ts
# one test by name
pnpm --filter @dalaly/server exec tsx --test --test-name-pattern "<name>" scripts/startup.test.ts

pnpm --filter @dalaly/server build                 # runtime suites run server/dist
pnpm --filter @dalaly/server test:runtime          # also :phase1 … :phase5, :spaces
pnpm --filter @dalaly/server test:removal          # backup restore + retired-module checks
pnpm --filter @dalaly/server test:maps:runtime
pnpm --filter @dalaly/server test:startup:electron # real Electron launch, needs a display
```

### Web demo mode (capture only)

`pnpm demo:reset` then `pnpm dev:web` serves the same Vue app in a plain browser for screenshots. Fully isolated: `.env.web-demo`, `dalaly_demo` database, API on 45699, web on 5199, data in `server/data/web-demo`. It must never be wired into the Electron app, the production build, or the dev database.

## Architecture essentials

Three processes: **Electron main** spawns the **Fastify API** as an `ELECTRON_RUN_AS_NODE` child on `127.0.0.1:34567`, which owns the only PostgreSQL connection. The **renderer** talks HTTP to the API for all business data and uses IPC only for native capabilities.

- **Startup is asynchronous**: the API listens immediately and prepares the database in the background (`infrastructure/database/startup.ts`), while `main.js` polls `/api/health` for `CHECKING` / `SETUP_REQUIRED` / `READY` / `ERROR`. See `docs/STARTUP_FLOW.md`. No default admin exists — the first administrator is created from the setup screen.
- **Auth**: every route except health/setup/login (`publicPaths` in `modules/auth/auth.hooks.ts`) needs a bearer token; routes declare RBAC with `requirePermission("<domain>.<action>")`. Anonymous setup mutations are additionally restricted by `requireLocalSetup`. A per-launch `INTERNAL_TOKEN` authenticates main-process calls (setup proxy, scheduled backup).
- **Server module shape** (`server/src/modules/<domain>/`): `routes` parse input with the module's zod `schema`, then call `repository` (queries, mapping, audit). Add a `service` only when logic spans tables, files, or processes (auth, backup, matching, setup, images). Use `shared/utils/parse-id.ts` for route ids and `shared/validation/fields.ts` for optional field schemas. Responses are snake_case via `toApiObject`; zod failures become localized Arabic 400s in the central handler in `server.ts`.
- **Renderer** is organized by type (`pages/`, `components/`, `composables/`, `services/`, `platform/`, `constants/`, `utils/`, `types/`). One service module per API area; `services/api.service.ts` holds the token, 401 handling, and `ApiError` — and deliberately uses a single API base URL (port fallback breaks CORS). Renderer types in `types/` mirror API shapes **by hand**, so changing a response shape means editing both sides.
- **Option lists and Arabic labels live in `constants/`** (e.g. `RENT_PERIODS` / `RENT_PERIOD_LABELS`); don't re-declare them per component. Numbers and dates render with Latin digits through `utils/format.ts`.
- **Native capabilities** need five pieces: a validated IPC handler in `apps/desktop/src` (check the sender with `ipc-guard.js`), a `preload.cjs` method, a typed entry in `apps/renderer/src/env.d.ts`, and implementations in both `platform/electron.ts` and `platform/web.ts`. Windows run with `contextIsolation` + `sandbox` and no `nodeIntegration`.

## Hard constraints

- **Migrations in `server/drizzle` are append-only** — never edit or delete a shipped one (`run-migrations.ts` fails if an applied migration's hash changed — the hash covers raw bytes, so `.gitattributes` pins their line endings; keep new migrations LF as drizzle-kit writes them). Generate with `pnpm --filter @dalaly/server db:generate`.
- The retired contract/studio system has special migration handling: the tags `0001_contract_studio`/`0002_studio_ux` are permanently skipped (the current `0001_default_document_types` is unrelated and runs normally), and the destructive `0003_remove_contract_system` only runs with explicit approval (`approvedRetirement`). **Deleting legacy contract data from an existing database, or destroying its historical documents, requires separate user approval after a backup and a real restore test** — see `docs/CONTRACT_SYSTEM_REMOVAL_MAP.md`. Note `legal_type` and the "عقد زراعي 117/35" property attribute are ownership data that stay.
- Operational scope is people, properties, rentals, requests, matching, general documents, settings, and backup. Property PDF export uses Electron's bundled engine — no standalone browser or Office dependency.
- Remote access via `tools/cloudflared/cloudflared.exe` is optional; the app must keep working with that file absent.
- Commits follow Conventional Commits (`feat(scope):`, `fix:`, `refactor:`, `docs:`, `chore(tests):`).
