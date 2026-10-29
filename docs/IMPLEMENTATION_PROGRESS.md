# Implementation progress

The phases of [`BUSINESS_SYSTEM_PLAN.md`](BUSINESS_SYSTEM_PLAN.md), one
branch and one PR each, merged into `main` in order. A phase counts as
**Completed** only when its PR is merged and its checks passed. Before
resuming work, check this file against `git log main`, `gh pr list` and CI.
Do not rely on this file alone.

## Phases

| Phase | Branch | Pull request | Tests | Status |
| --- | --- | --- | --- | --- |
| 0 — audit and plan | `docs/phase-00-audit` | [#26](https://github.com/TariqAli93/dalaly/pull/26), merged `115d525` | docs only; CI pass | Completed |
| 1a — file integrity | `fix/phase-01a-file-integrity` | [#27](https://github.com/TariqAli93/dalaly/pull/27), merged `f0761b0` | `test:files` 14/14; all database suites; CI pass | Completed |
| 1b — media tokens | `fix/phase-01b-media-tokens` | [#28](https://github.com/TariqAli93/dalaly/pull/28), merged `fb3512d` | `test:media-tokens` 8/8; affected suites; CI pass | Completed |
| 1c — hardening | `fix/phase-01c-hardening` | — | `test:hardening` 5/5, lifecycle 6/6; all suites pass | In review |
| 2a — activities and tasks | `feat/phase-02a-activities` | — | — | Pending |
| 2b — customer CRM | `feat/phase-02b-customer-crm` | — | — | Pending |
| 2c — CRM UI | `feat/phase-02c-crm-ui` | — | — | Pending |
| 3a — deals core | `feat/phase-03a-deals-core` | — | — | Pending |
| 3b — deals UI | `feat/phase-03b-deals-ui` | — | — | Pending |
| 3c — deal integration | `feat/phase-03c-deal-integration` | — | — | Pending |
| 4a — chart of accounts | `feat/phase-04a-chart-of-accounts` | — | — | Pending |
| 4b — general ledger | `feat/phase-04b-general-ledger` | — | — | Pending |
| 4c — receipts and payments | `feat/phase-04c-receipts-payments` | — | — | Pending |
| 4d — commissions | `feat/phase-04d-commissions` | — | — | Pending |
| 4e — expenses and cash | `feat/phase-04e-expenses-cash` | — | — | Pending |
| 4f — financial integration | `feat/phase-04f-financial-integration` | — | — | Pending |
| 5a — leases | `feat/phase-05a-leases` | — | — | Pending |
| 5b — lease payments | `feat/phase-05b-lease-payments` | — | — | Pending |
| 6a — financial reports | `feat/phase-06a-financial-reports` | — | — | Pending |
| 6b — operational reports | `feat/phase-06b-operational-reports` | — | — | Pending |
| 7a — navigation | `feat/phase-07a-navigation` | — | — | Pending |
| 7b — dashboard | `feat/phase-07b-dashboard` | — | — | Pending |
| 8 — refactoring and performance | `refactor/phase-08-*` | — | — | Pending |
| 9 — final verification | `test/phase-09-*` | — | — | Pending |

## Baseline evidence (Phase 0, `main` at `3e01f9f`)

- `pnpm typecheck`, `pnpm exec eslint .`, `pnpm build`: pass.
- `pnpm test`: 52 / 52 pass.
- Database suites run locally against PostgreSQL 18: `test:permissions` 3,
  `test:thumbnails` 11, `test:contract` 80, `test:agreements` 11,
  `test:backup:compat` 5, `test:backup:safety` 4, `test:transactions` 1,
  `test:paging` 17, `test:dashboard:operations` 9 — all pass.

## Phase evidence

### 1a — file integrity

Fixes findings 1–7, 9 and 15 of the plan. Local runs against PostgreSQL 18:

- `test:files` (new) 14/14.
- Suites that touch images, documents or backups: `test:thumbnails` 11,
  `test:contract` 80, `test:backup:encrypted` 7, `test:removal:backup` 20,
  `test:backup:compat` 5, `test:import` 5, `test:codes` 4.
- Runtime suites: `test:runtime` 49, `test:runtime:phase2` 50,
  `test:runtime:spaces` 17.
- Server typecheck and ESLint pass.

No migration. Image files deleted before this phase (rows removed with
their listing, files left on disk) stay on disk. Removing them is listed
under the decisions below.

Every other database suite was also run on the 1a branch and passed
(permissions, remote access, backup safety, retention, large restore,
paging, queries, dashboards, timeouts, search, agreements, transactions,
maps, runtime phases 1, 3, 4, 5).

### 1b — media tokens

Fixes findings 8, 12 and 17 of the plan. Local runs on the branch rebased
onto `f0761b0`:

- `test:media-tokens` (new) 8/8, `test:files` 14, `test:limits` 5,
  `test:thumbnails` 11, `test:contract` 80, `test:backup:encrypted` 7,
  `test:removal:backup` 20, `test:runtime:phase2` 50,
  `test:runtime:spaces` 17; `location.test.ts` (in `pnpm test`) covers the
  loopback refusal.
- `pnpm typecheck`, ESLint and `pnpm test` (52) pass.
- In the web demo (`pnpm dev:web`): every table image loads from a
  `?media=` URL and none carries `token=`; a document opens in the in-app
  viewer, fetched with the `Authorization` header (an image document shows
  inline, a text document offers "حفظ نسخة").

No migration.

### 1c — hardening

Fixes findings 10, 11, 13, 14, 16 and 18–20 of the plan.

- New: `test:hardening` 5/5 (database, CI). `remote-access-lifecycle.test.ts`
  6/6 uses a fake cloudflared. Schedule-validation and database-URL checks
  are in `startup.test.ts` (8). Log redaction is in `error-shape.test.ts`
  (7). All of these run in `pnpm test`, now 61 tests.
- Every database and runtime suite passed on the branch before the rebase.
  After the rebase onto `fb3512d` (with 1b), `test:media-tokens`,
  `test:hardening`, `test:remote-access`, `test:contract`,
  `test:backup:safety`, `test:files` and `test:runtime:phase2` were rerun
  and pass.
- `test:startup:electron` (real Electron, built renderer with the CSP):
  all 11 scenarios pass, setup through login to the dashboard.
- The same policy applied to the web demo: no `securitypolicyviolation` and
  no broken image on the sale and rental lists and records, the contract
  template editor, documents and the dashboard.
- `pnpm typecheck` and ESLint pass.

Not changed: the database URL stays in plain text in `config.json`.
Encrypting it with `safeStorage` would make the app unable to start when
the Windows profile's key changes. That trade-off is the owner's, listed
below.

## Database migrations

| Migration | Phase | What it adds |
| --- | --- | --- |
| `0000`–`0004` | before this plan | baseline schema, document types, property indexes, search text, agreements |

## Decisions that need the owner

- **Orphan image files from before Phase 1a.** A listing deleted before
  Phase 1a left its image files and thumbnails on disk, outside every row
  (they are still archived by full backups). The app now removes them on
  delete, but does not search for and remove the old ones: that deletes
  user files, so it waits for the owner's decision.

- **Database URL at rest.** `config.json` holds the PostgreSQL URL,
  password included, in plain text (the SMTP and backup passwords use
  `safeStorage`). Encrypting it protects a copied profile, but a reset
  Windows profile key would then send the app back to Setup.

The plan follows the owner decisions already recorded in
`AUDIT_AND_ROADMAP.md` (section 2) and `CONTRACT_SYSTEM_REMOVAL_MAP.md`. If
a phase reaches a choice that changes history, deletes data or changes how
money is accounted for beyond the plan, it is listed here, and the phase
stops at that point.

## Known issues

- `/api/dashboard/summary` and `/api/stats/summary` have no renderer caller
  (kept for now; `test:dashboard` reads the first). Revisit in Phase 8.
- The renderer has no unit tests of its own. Its pure helpers are tested
  from `server/scripts/renderer-utils.test.ts`.

## Performance measurements

Baseline: `PERFORMANCE.md`, "Baseline, October 2026" and later sections.
Targets for new modules: `BUSINESS_SYSTEM_PLAN.md`, section 7.
