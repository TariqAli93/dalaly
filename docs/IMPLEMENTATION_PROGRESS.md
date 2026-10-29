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
| 1c — hardening | `fix/phase-01c-hardening` | [#29](https://github.com/TariqAli93/dalaly/pull/29), merged `8ac6385` | `test:hardening` 5/5, lifecycle 6/6; all suites; CI pass | Completed |
| 2a — activities and tasks | `feat/phase-02a-activities` | — | `test:tasks` 13/13, `test:contract` 87; all suites | In review |
| 2b — customer CRM | `feat/phase-02b-customer-crm` | — | — | Pending |
| 2c — tasks UI | `feat/phase-02c-tasks-ui` | — | renderer typecheck, lint, build; checked in the web demo | In review |
| 2d — customer UI | `feat/phase-02d-customer-ui` | — | — | Pending |
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

### 2a — activities and tasks

- Follow-ups are tasks (status, assignee, priority, outcome, customer), and
  `activities` holds a customer's tasks that are not on a listing.
- `/tasks/paged`, `/tasks/assignees` and `PATCH /tasks/:source/:id` cover
  all three sources by permission. `/people/:id/timeline` gives a
  customer's rows with their last contact and next due date.
- Creating a follow-up now returns the listed snake_case shape. This was the
  last entry in `test:contract`'s `KNOWN_DRIFT`.
- Dashboard: cancelled appointments are left out. A viewing with an outcome
  recorded on it is no longer "without outcome" (`OPERATIONS_DASHBOARD.md`).
- Backup:
  - `activities` is in the `full` and `crm` scopes.
  - Follow-ups from older archives get their status on restore.
  - A `crm` restore now keeps listing-owner and follow-up customer links.
    Before, it nulled every listing's `owner_person_id`. That was an existing
    data-loss bug, found here.
- New suite `test:tasks` 13/13. It includes a real upgrade from `0004` with
  existing follow-ups, permission filtering, the dashboard rules, both
  restore cases, and `test:contract` (87, with the new endpoints).
- No UI yet: the tasks page and customer timeline are Phase 2c.

### 2c — tasks UI

- New "المهام والمتابعات" page (`/tasks`, in the navigation under customers
  and requests). It is shown to anyone with either follow-up permission:
  a nav item and a route may now name several keys, any of which is
  enough.
- The page has filters for status, assignee ("مهامي"), due window, type and
  text. Each row can be completed with an outcome, reopened, postponed a
  day, cancelled or edited, and links to its listing or customer. "مهمة
  لزبون" adds a customer task.
- One `TaskDialog` (type, customer, notes, date, assignee, priority,
  status, outcome) now serves the listing follow-up history, the
  dashboard's "تسجيل متابعة" and the tasks page.
- The listing history shows each follow-up's status (overdue in red),
  priority, assignee, customer and outcome, with a "complete" button.
- Checked in the web demo:
  - The tasks page lists the demo's four open follow-ups.
  - Completing one with an outcome saved `done`, the outcome and
    `completed_at`, and the list dropped to three.
  - The listing's history shows the new state, and a past follow-up
    migrated by `0005` shows as done.
  - No console errors.
- No server change.

## Database migrations

| Migration | Phase | What it adds |
| --- | --- | --- |
| `0000`–`0004` | before this plan | baseline schema, document types, property indexes, search text, agreements |
| `0005_crm_tasks` | 2a | task columns on both follow-up tables (customer, assignee, status, priority, completion, outcome, `updated_at`), `activities`, their indexes and checks; existing follow-ups without a date or already past become `done` |

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
