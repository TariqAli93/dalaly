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
| 2a — activities and tasks | `feat/phase-02a-activities` | [#30](https://github.com/TariqAli93/dalaly/pull/30), merged `2d82389` | `test:tasks` 13/13, `test:contract` 87; all suites; CI pass | Completed |
| 2b — customer CRM | `feat/phase-02b-customer-crm` | [#31](https://github.com/TariqAli93/dalaly/pull/31), merged `6ec058d` | `test:customers` 8/8, `test:contract` 90; all suites; CI pass | Completed |
| 2c — tasks UI | `feat/phase-02c-tasks-ui` | [#32](https://github.com/TariqAli93/dalaly/pull/32), merged `c1a02b3` | renderer typecheck, lint, build; web demo; CI pass | Completed |
| 2d — customer UI | `feat/phase-02d-customer-ui` | [#34](https://github.com/TariqAli93/dalaly/pull/34), merged `1a361ac` | renderer typecheck, lint, build; web demo; CI pass | Completed |
| 3a — deals core | `feat/phase-03a-deals-core` | [#33](https://github.com/TariqAli93/dalaly/pull/33), merged `1b54f56` | `test:deals` 10/10, deal rules 5/5, money 4/4, `test:contract` 97; all suites; CI pass | Completed |
| 3b — deals UI | `feat/phase-03b-deals-ui` | — | renderer typecheck, lint, build; `formatAmount` tests; checked in the web demo | In review |
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

### 2b — customer CRM

- Customers have roles, a source and an assigned employee (`0006`). An
  omitted field keeps its value. Lists filter by role and by assignee.
- The record page adds the roles the customer's records imply.
- `GET /people/duplicates` matches by phone (last ten digits, any format,
  either phone) and by national ID, archived customers included. It only
  warns; nothing is merged.
- Customer changes are audited: create, edit with old and new values,
  archive and restore. `GET /people/:id/audit` returns them.
- `test:customers` 8/8.
- `test:contract` is 90: the detail now has its own `PersonDetailRecord`,
  and duplicates and audit are called.
- `test:backup:compat` now accepts a newer column's empty default (`roles`)
  as well as null.
- No UI yet: the person form, its duplicate warning and the owner picker on
  the sale form are Phase 2c.

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

### 2d — customer UI

- The customer page opens on a new "النشاط" tab for anyone who sees
  follow-ups. It shows last contact, the next due date, and open and overdue
  tasks, then the customer's follow-ups and activities, newest first, with
  status, outcome and links to listings. "تسجيل نشاط" logs an activity for
  the customer in the shared task dialog, and open tasks can be completed
  from the list.
- The page's facts add the customer's roles (stored ones and those their
  records imply: owner, buyer, tenant, contract party), their source and
  the assigned employee.
- The customer form gains a "علاقته بالمكتب" section: roles (several),
  source and assigned employee. It warns, without blocking, when the phone
  or national ID belongs to another customer: name, code, which field
  matched, and whether that customer is archived.
- The people list filters by role and by employee ("زبائني", unassigned)
  and shows a roles column.
- The sale listing form can now link the owner to a registered customer,
  as the rental form already could. The picked customer fills the name and
  phone when those are empty.
- Checked in the web demo:
  - The hub opens on Activity, and the implied "مالك" role shows.
  - Logging a call adds it to the timeline and sets the last contact.
  - Typing `+964 780 111 2233` in the form warned about the customer
    stored as `07801112233`.
  - The list shows the new filters and column, and the sale form shows the
    owner picker.
  - No console errors.
- No server change.

### 3a — deals core

- Deals (`0007`) are a sale or rent between a client and an owner, on a
  listing of the matching kind. A deal can link the request it came from, its
  contract and an assignee, and carries a currency and exact amounts. The
  shared money library (`shared/money.ts`) does the arithmetic in `bigint`.
- Twelve stages with checked moves (`deals.rules.ts`). Every move is
  recorded. Closing and reopening need the new `deals.close` permission;
  the others are `deals.read/create/update`.
- Offers and counteroffers: accepting one sets the agreed price and moves
  the deal to `agreed`.
- There is a pipeline with exact totals per stage and currency, and a
  stalled filter. Activities can belong to a deal.
- Backup:
  - The three tables are in the `full` and `crm` scopes, in foreign-key
    order.
  - Scoped restores now keep a deal's or a contract's listing. Before, a
    `properties` or `rentals` restore nulled a contract's listing link.
  - A restored row pointing at a listing or user deleted since the backup no
    longer fails the restore; that link is cleared instead.
- Tests:
  - `test:deals` 10/10 covers creation and defaults, link checks, the
    offer-to-agreed flow, stage rules, close permission, filters, exact
    per-currency totals, stalled deals and both restore cases.
  - `pnpm test` adds `deal-rules` 5 and `money` 4.
  - `test:contract` 97; `test:removal:backup` now covers 34 tables.
- No UI yet: the pipeline, deal list and deal page are Phase 3b.

### 3b — deals UI

- "الصفقات" (`/deals`) heads a renamed navigation group, "الصفقات والعقود".
  - It has a board of the open stages: a column per stage, with its count
    and exact asking-price total in each currency.
  - Each card shows the deal, its code and type, its price, its days in the
    stage and its owner employee, plus a one-step "next stage" button.
  - There is also a server-paged table of all deals.
  - Filters for type, state (in the table), assignee ("صفقاتي") and stalled
    for 14 days, plus text search, apply to both views. The chosen view is
    remembered.
- The deal page (`/deals/:id`) has these parts:
  - Facts: price (agreed, else asking), parties, listing, expected
    commission, assignee, expected close.
  - The stage path, with the current stage marked.
  - Offers: record one for either party, then accept, counter or reject it.
  - Activities (viewings and calls, logged on the client with the deal),
    the stage history, and links to the request, contract and notes.
  - Header commands: edit, move stage (reopen when closed), close as won,
    and lost. Closing is shown only with `deals.close`.
- `DealDialog` creates and edits a deal: kind, parties, listing (the
  contract `ListingPicker`), assignee, expected close, currency and amounts.
  A picked listing brings its owner. `DealStageDialog` asks for a reason
  when losing, cancelling or reopening, and shows the server's refusal as
  is.
- `formatAmount` shows exact amounts from the server's decimal strings.
  Grouping is done on the string, never through a number, and fractions
  show when they are not zero (always for USD). Tested in
  `renderer-utils.test.ts`.
- Checked in the web demo:
  - The board shows all nine stages, and a new deal appears in its column
    with its total.
  - The deal page loads with the right stages marked done.
  - Recording a 305,000,000 offer and accepting it set the agreed price,
    moved the deal to "تم الاتفاق" and recorded that move.
  - "إغلاق كمكسوبة" without a seller showed the server's "حدد البائع أو
    المؤجر قبل كسب الصفقة."
- No server change.

## Database migrations

| Migration | Phase | What it adds |
| --- | --- | --- |
| `0000`–`0004` | before this plan | baseline schema, document types, property indexes, search text, agreements |
| `0005_crm_tasks` | 2a | task columns on both follow-up tables (customer, assignee, status, priority, completion, outcome, `updated_at`), `activities`, their indexes and checks; existing follow-ups without a date or already past become `done` |
| `0006_customer_crm` | 2b | `people.roles` (checked `text[]`, GIN index), `source` (checked), `assigned_user_id` (FK users, set null, indexed) |
| `0007_deals` | 3a | `deals` (checked type, stage, priority, currency, listing kind, distinct parties, ISO close date), `deal_stage_history`, `deal_offers`, `activities.deal_id` |

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
