# Implementation progress

The phases of [`BUSINESS_SYSTEM_PLAN.md`](BUSINESS_SYSTEM_PLAN.md), one
branch and one PR each, merged into `main` in order. A phase counts as
**Completed** only when its PR is merged and its checks passed. Before
resuming work, check this file against `git log main`, `gh pr list` and CI.
Do not rely on this file alone.

## Phases

| Phase                               | Branch                                  | Pull request                                                          | Tests                                                                                                                 | Status    |
| ----------------------------------- | --------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 0 — audit and plan                  | `docs/phase-00-audit`                   | [#26](https://github.com/TariqAli93/dalaly/pull/26), merged `115d525` | docs only; CI pass                                                                                                    | Completed |
| 1a — file integrity                 | `fix/phase-01a-file-integrity`          | [#27](https://github.com/TariqAli93/dalaly/pull/27), merged `f0761b0` | `test:files` 14/14; all database suites; CI pass                                                                      | Completed |
| 1b — media tokens                   | `fix/phase-01b-media-tokens`            | [#28](https://github.com/TariqAli93/dalaly/pull/28), merged `fb3512d` | `test:media-tokens` 8/8; affected suites; CI pass                                                                     | Completed |
| 1c — hardening                      | `fix/phase-01c-hardening`               | [#29](https://github.com/TariqAli93/dalaly/pull/29), merged `8ac6385` | `test:hardening` 5/5, lifecycle 6/6; all suites; CI pass                                                              | Completed |
| 2a — activities and tasks           | `feat/phase-02a-activities`             | [#30](https://github.com/TariqAli93/dalaly/pull/30), merged `2d82389` | `test:tasks` 13/13, `test:contract` 87; all suites; CI pass                                                           | Completed |
| 2b — customer CRM                   | `feat/phase-02b-customer-crm`           | [#31](https://github.com/TariqAli93/dalaly/pull/31), merged `6ec058d` | `test:customers` 8/8, `test:contract` 90; all suites; CI pass                                                         | Completed |
| 2c — tasks UI                       | `feat/phase-02c-tasks-ui`               | [#32](https://github.com/TariqAli93/dalaly/pull/32), merged `c1a02b3` | renderer typecheck, lint, build; web demo; CI pass                                                                    | Completed |
| 2d — customer UI                    | `feat/phase-02d-customer-ui`            | [#34](https://github.com/TariqAli93/dalaly/pull/34), merged `1a361ac` | renderer typecheck, lint, build; web demo; CI pass                                                                    | Completed |
| 3a — deals core                     | `feat/phase-03a-deals-core`             | [#33](https://github.com/TariqAli93/dalaly/pull/33), merged `1b54f56` | `test:deals` 10/10, deal rules 5/5, money 4/4, `test:contract` 97; all suites; CI pass                                | Completed |
| 3b — deals UI                       | `feat/phase-03b-deals-ui`               | [#35](https://github.com/TariqAli93/dalaly/pull/35), merged `eed0dcc` | renderer typecheck, lint, build; `formatAmount` tests; web demo; CI pass                                              | Completed |
| 3c — deal integration               | `feat/phase-03c-deal-integration`       | [#36](https://github.com/TariqAli93/dalaly/pull/36), merged `8364e11` | `test:deals` 15/15; all suites; web demo; CI pass                                                                     | Completed |
| 4a — chart of accounts              | `feat/phase-04a-chart-of-accounts`      | [#37](https://github.com/TariqAli93/dalaly/pull/37), merged `d71806f` | `test:accounting` 9/9, account rules 7/7, `test:contract` 100, backup round trip 35 tables; web demo; CI pass         | Completed |
| 4b — general ledger (server)        | `feat/phase-04b-general-ledger`         | [#38](https://github.com/TariqAli93/dalaly/pull/38), merged `edb4caf` | `test:ledger` 13/13, journal rules 6/6, backup round trip 38 tables; CI pass                                          | Completed |
| 4b — journal UI                     | `feat/phase-04b-journal-ui`             | [#39](https://github.com/TariqAli93/dalaly/pull/39), merged `fef0787` | `test:contract` 111, editor sums 1 test; renderer checks; web demo; CI pass                                           | Completed |
| 4c — receipts and payments (server) | `feat/phase-04c-receipts-payments`      | [#40](https://github.com/TariqAli93/dalaly/pull/40), merged `90adba2` | `test:vouchers` 10/10, voucher rules 5/5, backup round trip 39 tables; CI pass                                        | Completed |
| 4c — vouchers UI                    | `feat/phase-04c-vouchers-ui`            | [#41](https://github.com/TariqAli93/dalaly/pull/41), merged `27dce5a` | `test:contract` 117; renderer checks; web demo; CI pass                                                               | Completed |
| 4d — commissions (server)           | `feat/phase-04d-commissions`            | [#42](https://github.com/TariqAli93/dalaly/pull/42), merged `2782a16` | `test:commissions` 10/10, commission rules 4/4, backup round trip 41 tables; all suites; CI pass                      | Completed |
| 4d — commissions UI                 | `feat/phase-04d-commissions-ui`         | [#43](https://github.com/TariqAli93/dalaly/pull/43), merged `ca695f6` | `test:contract` 123, percent preview vs server; renderer checks; web demo; CI pass                                    | Completed |
| 4e — expenses and cash (server)     | `feat/phase-04e-expenses-cash`          | [#44](https://github.com/TariqAli93/dalaly/pull/44), merged `18781c7` | `test:cash` 9/9, cash rules 4/4, money 5/5, backup round trip 44 tables; CI pass                                      | Completed |
| 4e — expenses and cash UI           | `feat/phase-04e-cash-ui`                | [#45](https://github.com/TariqAli93/dalaly/pull/45), merged `11c3b0e` | `test:contract` 133; renderer checks; web demo; CI pass                                                               | Completed |
| 4f — financial integration (server) | `feat/phase-04f-financial-integration`  | [#46](https://github.com/TariqAli93/dalaly/pull/46), merged `a4fd3ac` | `test:finance` 9/9, voucher and deal rules 12/12, `test:contract` 135; affected suites; CI pass                       | Completed |
| 4f — financial integration UI       | `feat/phase-04f-financial-ui`           | [#47](https://github.com/TariqAli93/dalaly/pull/47), merged `391845a` | renderer checks; `test:contract` 135; web demo; CI pass                                                               | Completed |
| 5a — leases (server)                | `feat/phase-05a-leases`                 | [#48](https://github.com/TariqAli93/dalaly/pull/48), merged `06d5b9f` | `test:leases` 9/9, lease rules 7/7, `test:contract` 142, backup round trip 46 tables; affected suites; CI pass        | Completed |
| 5a — leases UI                      | `feat/phase-05a-leases-ui`              | [#49](https://github.com/TariqAli93/dalaly/pull/49), merged `5381863` | renderer checks; `test:contract` 142; web demo; CI pass                                                               | Completed |
| 5b — lease payments (server)        | `feat/phase-05b-lease-payments`         | [#50](https://github.com/TariqAli93/dalaly/pull/50), merged `10c00f1` | `test:lease-payments` 11/11, lease rules 9/9, `test:contract` 145; affected suites; CI pass                           | Completed |
| 5b — lease payments UI              | `feat/phase-05b-lease-payments-ui`      | [#51](https://github.com/TariqAli93/dalaly/pull/51), merged `139075a` | renderer checks; `test:contract` 145; web demo; CI pass                                                               | Completed |
| 6a — financial reports (server)     | `feat/phase-06a-financial-reports`      | [#52](https://github.com/TariqAli93/dalaly/pull/52), merged `c0f6fc4` | `test:reports` 1/1 (a known year, every report), report rules 4/4, `test:contract` 153; timings under 500 ms; CI pass | Completed |
| 6a — financial reports UI           | `feat/phase-06a-financial-reports-ui`   | [#53](https://github.com/TariqAli93/dalaly/pull/53), merged `55d841c` | renderer checks; renderer utils 8/8; web demo; CI pass                                                                | Completed |
| 6b — operational reports (server)   | `feat/phase-06b-operational-reports`    | [#54](https://github.com/TariqAli93/dalaly/pull/54), merged `9bebe63` | `test:reports` 2/2 (operational: every figure), report rules 5/5, `test:contract` 157; CI pass                        | Completed |
| 6b — operational reports UI         | `feat/phase-06b-operational-reports-ui` | [#55](https://github.com/TariqAli93/dalaly/pull/55), merged `a687d08` | renderer checks; renderer utils 9/9; web demo; CI pass                                                                | Completed |
| 7a — navigation and quick add       | `feat/phase-07a-navigation`             | [#56](https://github.com/TariqAli93/dalaly/pull/56), merged `2d5cfd9` | renderer checks; web demo (every quick-add item); CI pass                                                             | Completed |
| 7b — dashboard (server)             | `feat/phase-07b-dashboard`              | [#57](https://github.com/TariqAli93/dalaly/pull/57), merged `5b5baa6` | `test:dashboard-business` 1/1, `test:reports` 2/2, `test:contract` 159; CI pass                                       | Completed |
| 7b — dashboard UI                   | `feat/phase-07b-dashboard-ui`           | [#58](https://github.com/TariqAli93/dalaly/pull/58), merged `c77bf8e` | renderer checks; web demo at 1366×768 and 1024×720; CI pass                                                           | Completed |
| 8a — business benchmarks            | `perf/phase-08a-business-benchmarks`    | [#59](https://github.com/TariqAli93/dalaly/pull/59), merged `b8bd40f` | `perf:business` before/after; deals 15, vouchers 10, tasks 13, paging 17, `test:contract` 159; unit 119; CI pass      | Completed |
| 8b — dead code                      | `refactor/phase-08b-dead-code`          | [#60](https://github.com/TariqAli93/dalaly/pull/60), merged `bf74c56` | lint, typecheck, build; unit 119; `test:contract` 149 (10 unread routes); `test:dashboard` 4; CI pass                 | Completed |
| 8c — list reload loop               | `fix/phase-08c-filter-reload-loop`      | [#61](https://github.com/TariqAli93/dalaly/pull/61), merged `162ac6d` | lint, typecheck, build; unit 119; request counts in the web demo; CI pass                                             | Completed |
| 8d — query-string helper            | `refactor/phase-08d-query-strings`      | [#62](https://github.com/TariqAli93/dalaly/pull/62), merged `609cdfb` | lint, typecheck, build; unit 120; `test:contract` 149; web demo URLs; CI pass                                         | Completed |
| 8e — shared date schema             | `refactor/phase-08e-date-schemas`       | [#63](https://github.com/TariqAli93/dalaly/pull/63), merged `9013d0b` | deals, accounting, ledger, vouchers, commissions, cash, finance, leases, payments, reports, agreements; CI pass       | Completed |
| 8f — renderer helpers               | `refactor/phase-08f-renderer-helpers`   | —                                                                     | lint, typecheck, build; unit 122; web demo (lease, dashboard)                                                         | In review |
| 8 — refactoring (further PRs)       | `refactor/phase-08-*`                   | —                                                                     | —                                                                                                                     | Pending   |
| 9 — final verification              | `test/phase-09-*`                       | —                                                                     | —                                                                                                                     | Pending   |

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

### 3c — deal integration

- **Deal to contract.** `POST /deals/:id/agreement` (needs `deals.update` and
  `agreements.manage`) drafts a contract from a template of the deal's kind.
  - The draft gets the owner and client as the two parties, the deal's
    listing, its currency, its agreed (else asking) price as the sale price
    or rent, and its expected commission.
  - It is linked to the deal, and a deal before "إعداد العقد" moves there.
  - A deal with a live contract gets a 409 until that contract is
    cancelled.
- **Contract to deal.** Issuing a linked contract moves its open deal to
  "صدر العقد" (`onAgreementIssued`), recorded with the contract's code.
  The deal can then close as won.
- **Where deals start.**
  - "صفقة" on each match of an open request: the requester is the client,
    the matched listing and the request are linked.
  - "صفقة" on a sale or rental listing page: the owner comes from the
    listing.
  - "صفقة جديدة" on a customer page: the customer is the client.
  - A new deal left without an owner takes its listing's.
- The customer page has a "الصفقات" tab: the customer's deals as client or
  owner, with stage and price. The deal page offers "إعداد العقد" (a choice
  of the kind's two templates, then the draft opens in the contract
  workspace) and "العقد" once linked.
- `test:deals` adds 5 checks (15 in all):
  - the draft's parties, listing, price, commission and currency;
  - a refused second contract and a wrong-kind template;
  - the permission;
  - issuing moving the deal, then closing it as won.
- Checked in the web demo:
  - "إعداد العقد" made `CT-0001` with the buyer, listing and 305,000,000
    price and opened its workspace; the deal moved to "إعداد العقد".
  - The customer's deals tab lists the deal.
  - "صفقة" on a request match opened the dialog with the buyer, listing and
    request filled, and saved deal `D-0002` linked to `PR-9002` with the
    listing's price.
- The first CI run of #36 failed in `test:media-tokens` (phase 1b). Its
  forged-token check "altered" the last character to `A`, so a token that
  already ended in `A` (one run in 64) was not altered at all, and the
  server rightly accepted it. The check now always changes the character.

### 4a — chart of accounts

- `accounts` (`0008`) holds headings and posting accounts. A posting account
  has one currency; a heading may span both. The rules are in
  `accounting.rules.ts`: parent type and currency, no cycles, headings keep
  their kind, and stopping goes children first. They are unit tested
  (7 tests) and enforced again by checks in the database.
- The default chart is 41 accounts: 5 type headings and 12 group headings,
  each group with one posting account per currency. The groups are cash,
  bank, receivables, client funds, payables, employee commissions payable,
  capital, retained earnings, brokerage income, other income, employee
  commissions and operating expenses.
  - `ensureDefaultChart` adds missing default accounts by `system_key` at
    startup and after a full restore.
  - Default accounts keep their code, type, currency and place; only their
    name and description change.
- `accounting.read` and `accounting.accounts.manage` are new permissions.
  The Super Admin gets them through the RBAC seed.
- The renderer has a "المالية" navigation group with "دليل الحسابات": the
  chart as a tree, filtered by currency and text, with an add/edit dialog.
- `test:accounting` (9):
  - an upgrade from `0007` with data;
  - the default chart and a second run adding nothing;
  - a deleted default account coming back under its heading;
  - every chart rule through the API, codes taken, unknown parents;
  - default accounts' fixed fields;
  - both permissions and the audit;
  - a full restore (moved accounts, later accounts gone, sequences);
  - an archive from before the chart getting the default accounts.
    `test:removal:backup` now covers 35 tables. `test:contract` checks the
    three new calls (100).
- `ensureDefaultChart` skips a database whose migrations end before `0008`,
  which the 0005 upgrade test exercises.
- Checked in the web demo:
  - the 41 default accounts as a tree, with a lock on default accounts;
  - "+" on "المصروفات التشغيلية" suggested `5203` with the heading's type
    and currency, and saved it;
  - a taken code showed the server's message in the dialog;
  - a default account's dialog allows only its name and description.

### 4b — general ledger (server)

- `journal_entries`, `journal_lines` and `accounting_periods` (`0009`).
  Entries are written as drafts and posted when they balance, in active
  posting accounts of their one currency, outside a closed month. Posted
  entries never change; a reversing entry undoes one, once.
- The database enforces the same with triggers (SQLSTATE `DL001`, a 409
  `LEDGER_LOCKED` with an Arabic message). It also refuses deleting a
  customer or deal a posted line names, and changing the type or currency
  of an account with posted lines. A restore passes the triggers for its
  own transaction only.
- `writeEntry` is the posting gateway for 4c–4f, with idempotency keys.
- API: the journal (paged list, entry, drafts, post, reverse), account
  statements with running balances, and closed months. Four new permissions
  (`accounting.journal.create`, `.post`, `.reverse`,
  `accounting.periods.manage`), all audited.
- `test:ledger` (13):
  - an upgrade from `0008` with data;
  - drafts posting only once balanced;
  - currency, heading, one-sided and two-line rules;
  - each trigger, in raw SQL;
  - customers, deals and used accounts kept;
  - reversals (once, not of a reversal or draft, dated today by default);
  - statements with opening and running balances;
  - idempotency;
  - closed months, in the API and in SQL;
  - the four permissions and the audit;
  - a customers restore keeping line links, a full restore, and the
    triggers active again after it.
    The journal rules have 6 unit tests. `test:removal:backup` covers 38
    tables, with a posted entry and a closed month.
- The journal pages (list, entry editor, reversal, statements, closing
  months) came in the next PR, "4b — journal UI".

### 4b — journal UI

- "المالية" > "القيود" lists entries, filtered by currency, status, source,
  dates and text. A reversed entry is marked "معكوس".
- The entry page shows the lines and their totals, and offers what the
  entry's status and the user's permissions allow:
  - for a draft: edit, post, delete;
  - for a posted entry: "قيد عكسي" (a date and a reason).
    A reversal and its original link to each other.
- The editor dialog:
  - lists only active posting accounts of the entry's currency, picked by
    typing a code and Enter;
  - takes each line on one side;
  - shows exact totals and the difference.
    "حفظ مسودة" keeps an unbalanced entry; "ترحيل" is enabled only once the
    entry balances.
- An account statement (from the chart, or from a line's account) shows the
  opening balance, a running balance on the account's side, and the closing
  balance.
- "الأشهر المقفلة" closes a month, saying how many drafts it leaves, and
  reopens one after a confirmation.
- `test:contract` checks every new renderer call (111). The editor's exact
  sums are tested in `renderer-utils.test.ts`.
- Dates are shown without `<bdi>`: the ar-IQ format carries right-to-left
  marks that make an isolate reorder it. This also fixes the date in the
  customer's deals tab (3c).
- Checked in the web demo:
  - a draft saved 0.50 short ("الفرق 0.50", posting disabled), edited to
    balance and posted;
  - its reversal `JE-000002` with swapped lines, linked both ways;
  - the cash statement going 0 → 1,500,000.50 → 0;
  - September closed from the dialog.

### 4c — receipts and payments (server)

- `vouchers` (`0010`): receipts (`RC-`) and payments (`PV-`) in one table,
  each posted to the ledger in its own transaction.
- The purpose sets the other side's account and the types allowed. A
  seller's or landlord's money is client funds, a liability; a commission is
  income.
- Payments are capped:
  - by the cash or bank balance;
  - for client funds, by what was collected for that person.
    Two racing payments that together would overdraw: one is refused.
- Voiding posts the reversing entry. The `vouchers_guard` trigger allows
  only that change; a voucher's entry cannot be reversed by hand.
- Amount in words from the digits (`decimalAmountInWords`), exact past 2^53.
- **Fixed from 4b:** deleting a user who posted entries failed with "the
  entry is posted" (the user links are `SET NULL`). `0010` replaces
  `journal_entries_guard` to refuse it with "deactivate the user instead",
  so who posted stays known. Vouchers do the same.
- `test:vouchers` (10):
  - commission and client-funds receipts with their lines;
  - client-funds and cash limits, including two racing payments;
  - account, currency and party rules;
  - voiding, and no manual reversal of a voucher's entry;
  - the trigger in raw SQL, including deleting a payer;
  - the three permissions and the user-deletion message;
  - listing, filters and audit;
  - a customers restore keeping links, and a full restore.
    Voucher rules: 5 unit tests. `test:removal:backup` covers 39 tables.
- The vouchers screens (issue, list, print, void) came in the next PR,
  "4c — vouchers UI".

### 4c — vouchers UI

- "المالية" > "سندات القبض والصرف" lists vouchers, filtered by kind,
  currency, status, dates and text. Payments show as negative amounts.
- "سند قبض" and "سند صرف" open the issue dialog:
  - the purpose, with what it means;
  - date, currency and amount;
  - the cash or bank account, each with its balance;
  - the customer, or a name for someone who is not one; for a payment of
    client funds, what is held for them;
  - the description, a reference, and (for users who may read the chart)
    another account the purpose allows.
    A payment above the account's balance, or above what is held for the
    customer, is flagged before it is sent; the server refuses it anyway.
- The voucher page shows the amount in words, both accounts, the deal and
  the journal entry, and offers print, PDF and "إلغاء السند" (a date and a
  reason). A voided voucher shows who voided it, when, why, and its
  reversing entry.
- The printed copy is A5 with the office header, which the voucher detail
  now carries (`office`). A cashier with `vouchers.read` but not
  `settings.read` can then print it.
- `test:contract` checks every voucher call (117).
- Checked in the web demo:
  - receipt `RC-000001` of 50,000,000 for a seller as client funds (account
    2101, not income), with "فقط خمسون مليوناً دينار عراقي لا غير";
  - its printed copy rendered;
  - a 60,000,000 payment flagged against the 50,000,000 cash balance, then
    refused by the server with its message in the dialog;
  - the receipt voided, with reversing entry `JE-000004`.

### 4d — commissions (server)

- `commissions` and `commission_splits` (`0011`).
  - A commission is fixed or a percentage of the deal's agreed price, owed
    by the client or the owner, with one live commission per payer.
  - Employees' shares come out of it; the office keeps the rest.
- Recording posts one entry:
  - the payer's receivable against brokerage income;
  - the shares as commission expense against commissions payable.
- Allocated vouchers settle commissions:
  - receipts with `commission_id` credit the receivable;
  - payments with `commission_split_id` debit the payable.
    Never beyond what is left; two receipts racing for the rest, one is
    refused. Income is counted once: the receipt does not credit income again.
- Cancelling reverses the entry, and only while nothing is settled.
- Triggers keep commissions and shares unchanged, and voucher allocations
  fixed (`vouchers_guard` replaced).
- `test:commissions` (10):
  - an upgrade from `0010`;
  - the accrual entry line by line;
  - one live commission per payer, and the deal, price, payer, share and
    employee rules;
  - collection to zero, with the receivable cleared, income once, and a
    race;
  - share payouts and their limits, and a voided payout no longer counting;
  - cancelling;
  - the triggers in SQL;
  - permissions and audit;
  - a customers restore keeping links, and a full restore.
    Commission rules: 4 unit tests (half-up rounding, rates, shares).
    `test:removal:backup` covers 41 tables.
- The commissions screens (on the deal page, the list, shares and payouts)
  came in the next PR, "4d — commissions UI".

### 4d — commissions UI

- The deal page has an "العمولات" section: each commission with its payer,
  amount, collected and left, plus "تسجيل عمولة" and "تحصيل".
- The record dialog:
  - payer (the client, or the owner when the deal has one);
  - a percentage of the agreed price, or an amount in either currency;
  - employees' shares, each a percentage or an amount;
  - a live preview of the commission, each share and the office's part,
    computed as the server will.
- "المالية" > "العمولات" lists commissions (open, collected, cancelled), and
  "حصص الموظفين المستحقة" lists unpaid shares with "دفع".
- The commission page shows the figures, how it was computed, the deal and
  entry, the shares with what was paid, and the vouchers. It offers
  collecting, paying a share, and cancelling (only while nothing is
  settled).
- Collecting and paying reuse the voucher dialog with the allocation fixed.
- Server: `GET /api/commissions/staff` lists active employees for whoever
  records commissions.
- `test:contract` checks every commission call (123).
  `renderer-utils.test.ts` checks the preview's rounding against the
  server's `percentOf`, past 2^53 too.
- Checked in the web demo, on deal `D-0001` (agreed 305,000,000):
  - `CM-000001` of 2% = 6,100,000 recorded with a 25% share for one
    employee (1,525,000); the office's part is 4,575,000;
  - 2,000,000 collected by `RC-000002`, leaving 4,100,000;
  - the share paid by `PV-000001`, after which the payable view is empty.

### 4e — expenses and cash (server)

- Expense categories map the expense account of each currency.
  - A payment voucher with a category posts there. A conflicting account,
    a missing currency, an inactive category, or a category on another kind
    of voucher is refused.
  - Nine defaults are added to an office with none, on install and after
    restoring an older archive.
- Transfers between cash and bank, in one currency:
  - never beyond the source's balance; of two racing transfers, one is
    refused;
  - voided only while the money is still in the account it went to.
- Reconciliations record a count or statement against the books on its
  date. With `adjust`, a shortage posts to operating expenses and an overage
  to other income. A month that is closed refuses the adjustment, and the
  whole reconciliation with it.
- Triggers keep transfers and reconciliations. `vouchers_guard` compares
  whole rows now.
- **Fixed:** `toMinor` refused negative amounts. A payment from an account
  overdrawn by a manual entry failed with a 500; balances and differences
  are now signed (money tests 5/5).
- `test:cash` (9):
  - an upgrade from `0011` with the default categories;
  - categories and the account they pick;
  - transfers: lines, balances as of a date, limits, a race;
  - voiding and its limit;
  - reconciliations: shortage adjusted, overage recorded then adjusted, an
    earlier date, a non-money account, a closed month;
  - the triggers;
  - permissions;
  - full and old-archive restores.
    Cash rules: 4 unit tests. `test:removal:backup` covers 44 tables.
- The screens (balances, transfers, reconciliations, categories, the category
  on an expense payment) came in the next PR, "4e — expenses and cash UI".

### 4e — expenses and cash UI

- "المالية" > "الصناديق والمصارف":
  - the balance of each cash and bank account, today or as of a date;
  - "تحويل منه" and "مطابقة" on each account;
  - the transfers, each voidable;
  - the reconciliations, with the adjustment entry.
- The transfer dialog opens on cash → bank in the account's currency.
- The reconciliation dialog shows the books' balance on the date and the
  difference (shortage or overage). It can post the adjustment.
- The vouchers page has "تصنيفات المصروفات": the categories with their
  accounts, and adding, editing and stopping them.
- An expense payment picks its category. The voucher page and the printed
  copy name it.
- `test:contract` checks every cash and category call (133).
- Checked in the web demo, cash `1101` starting at 475,000 IQD:
  - `TR-000001` moved 100,000 to the bank: cash 375,000, bank 100,000;
  - `RN-000001` counted 370,000. The −5,000 shortage was posted as
    `JE-000009`, leaving cash at 370,000;
  - voiding `TR-000001` returned the 100,000, leaving cash at 470,000 and the
    bank at 0;
  - balances as of 1/1/2026 read 0, with no actions;
  - the category "رسوم حكومية" was added. `PV-000002` for 25,000 with it
    posted to `5201` ("مصروف · رسوم حكومية");
  - no console errors, and no horizontal scroll at 375 px.

### 4f — financial integration (server)

- **Found in the audit:** a client-funds receipt booked the money to
  whoever paid it. A tenant's rent or a buyer's deposit could then not be
  handed to the landlord or seller: the payout check found nothing held for
  them. Nor could a deposit go back to the buyer out of the seller's funds.
- Client-funds vouchers now name whose money it is (`held_for_person_id`,
  migration `0013`):
  - a receipt: the one named, else the deal's owner, else the payer;
  - a payment: the one named, else the payee;
  - on a deal, one of its two sides, and a payment takes no more than was
    collected for that person on that deal;
  - voiding a receipt whose money was partly handed over is refused.
- `GET /api/finance/deals/:id` and `/api/finance/people/:id` (`vouchers.read`)
  read the money from the posted journal, beside the commission and
  client-funds documents. For a deal that is income, costs, net, receivable,
  payable and funds held, plus the linked contract's money terms; for a
  customer, what they owe and what is held for them. The test checks the
  figures against a direct sum of the journal lines.
- A deal is not lost or cancelled while a commission stands on it or client
  funds are held on it.
- `test:finance` (9):
  - an upgrade from `0012`;
  - a buyer's deposit and a tenant's rent held for the owner;
  - payouts and refunds within what is held, per person and per deal;
  - voiding after a handover;
  - a deal's and a customer's money against the journal (2,000,000
    commission with a 25% share, 1,500,000 collected, a 100,000 fee, a
    5,000,000 deposit: income 2,000,000, costs 600,000, held 1,000,000, the
    100,000,000 price nowhere);
  - the closing rule, then cancelling once settled;
  - an older voucher without `held_for`;
  - the trigger and deleting a person;
  - permissions;
  - restores.
    Rules: `heldFor` and the closing rule (unit tests). `test:contract` 135.
- The screens (who the funds are for on the voucher form, the money on the
  deal and customer pages) came in the next PR, "4f — financial integration
  UI".

### 4f — financial integration UI

- The voucher form has "الأمانة لحساب" on client-funds vouchers. Its hint
  says who it defaults to. A payment shows what is held for that owner and
  warns before an amount above it.
- The voucher page and the printed copy name the owner when someone else
  paid in or took out the money.
- The deal page has an "المال" section:
  - the commission recorded (and expected), what the customer still owes,
    the employees' shares, the client funds held (received, handed over),
    and the office's net (income less costs);
  - the linked contract's commission, deposit and down payment, flagged
    when its commission differs from the recorded one;
  - the last vouchers on the deal;
  - "قبض أمانة" (from the client, for the owner), "تسليم أمانة" and
    "مصروف", each opening the voucher form with the deal filled in.
- The customer page has an "المال" tab: what they owe the office, the funds
  held for them, their commissions and their vouchers. A receipt into their
  funds from someone else reads "لحسابه، من …"; a payment out of them to
  someone else reads "من أمانته، إلى …".
- Checked in the web demo, on deal `D-0002` (buyer سارة محمد, seller أحمد
  عبد الرزاق set for the check):
  - the deal's "قبض أمانة" issued `RC-000003` for 10,000,000 from the buyer,
    held for the seller. Held funds read 10,000,000 and the net 0: a
    deposit is not income;
  - "تسليم أمانة" warned at 10,000,001, then `PV-000003` handed 6,000,000 to
    the seller;
  - a 1,000,000 refund to the buyer out of the seller's funds (`PV-000004`)
    shows "الأمانة لحساب أحمد عبد الرزاق" on its page;
  - marking the deal lost was refused in the stage dialog: 3,000,000 still
    held;
  - the seller's "المال" tab: 3,000,000 held, with the four vouchers;
  - no console errors besides the two expected refusals. The money section
    fits at 375 px. The deal page still scrolls sideways there because of
    its existing form fields, which this PR does not change.

### 5a — leases (server)

- `leases` and `lease_installments` (migration `0014_leases`).
- A lease is activated from an issued residential or commercial rent
  contract (`POST /api/leases/activate`):
  - it takes the terms of the contract's current issued revision (rent,
    period, dates, deposit, currency), its landlord and tenant, and its
    listing, and keeps the revision number;
  - one live lease per contract, also when two activations race (the
    contract row is locked; a partial unique index backs it);
  - `GET /api/leases/agreement/:id` shows what activating would put in
    force, or why it cannot: not issued, not a rent contract, missing rent
    or dates, a lease already live.
- A lease in force without a contract in the system is entered by hand
  (`POST /api/leases`), quarterly too. `POST /api/leases/schedule` shows its
  schedule first.
- The schedule (`leases.rules.ts`):
  - one installment per period, counted from the start date and due on the
    period's first day (rent is paid in advance);
  - a period the end date cuts short pays its days' share, half up;
  - an end date on an anniversary of the start closes the last period
    ("from 1/1 to 1/1" is one year, not a year and a day);
  - at most 360 installments.
- The listing is marked rented on activation, and back to available when
  its only live lease is cancelled; both are audited.
- A lease's terms and schedule never change (triggers `leases_guard`,
  `lease_installments_guard`); a mistake is cancelled. A customer, listing
  or contract with a lease is not deleted. Where a lease stands (upcoming,
  current, ended, cancelled) is read from its dates.
- Permissions `leases.read` and `leases.manage`.
- `test:leases` (9):
  - an upgrade from `0013`;
  - a residential contract issued and put in force (12 installments,
    9,000,000), once;
  - refusals: unissued, sale, missing;
  - by hand, quarterly, with a cut period;
  - list filters;
  - cancelling and activating again;
  - triggers;
  - permissions;
  - customers, rentals and full restores keeping the links.
    Lease rules: 7 unit tests. `test:contract` 142. `test:removal:backup`
    covers 46 tables.
- Collecting the rent against the schedule, overdue installments, landlord
  payouts, renewal and termination are Phase 5b. The screens came in the
  next PR, "5a — leases UI".

### 5a — leases UI

- "الإيجارات" > "الإيجارات السارية" (`leases.read`): each lease's tenant,
  landlord, listing, rent per period, dates and next due installment, with
  filters by where it stands (current, upcoming, ended, cancelled) and by
  text.
- The lease page:
  - its parties, listing and contract (with the revision);
  - rent, frequency, dates, deposit, and who collects the rent;
  - the schedule as written, each installment "قادم" or "حلّ موعده";
  - "إلغاء الإيجار" with a reason.
- An issued rent contract's page has "تفعيل الإيجار". The dialog shows the
  terms it takes, the parties and the schedule. A contract already in force
  links to its lease instead.
- "إيجار بلا عقد في النظام" enters one by hand:
  - choosing the listing fills its landlord, rent and frequency;
  - the schedule is previewed as the terms are typed, with a cut period
    marked and a date error shown.
- The rental page lists its leases. The customer page has a "الإيجارات" tab
  ("مؤجر لـ …" or "مستأجر من …").
- Checked in the web demo:
  - `CT-0002` (residential, 850,000 a month, 1/11/2026 to 31/10/2027) was
    issued and activated as `LS-000001`. It has 12 installments
    (10,200,000) and the office collects the rent; the listing `R-9001` is
    now rented;
  - the contract's dialog then links to `LS-000001`;
  - `LS-000002` was entered by hand on `R-9003` (2,400,000 every six
    months for 2026, two installments). A 31/10 end previewed a cut second
    period of 1,604,347.83, and an end before the start showed the error;
  - cancelling `LS-000002` put `R-9003` back to available;
  - the lease page fits at 375 px.

### 5b — lease payments (server)

- Rent is collected against the schedule: a receipt with
  `lease_installment_id` (migration `0015`).
  - It is client funds held for the landlord, paid by the tenant by default.
  - It can be partial, and never more than is left on the installment (the
    installment row is locked, so two receipts cannot both take the rest).
  - It needs a lease where the office collects the rent, on an installment
    a termination has not released.
- A voucher with `lease_id` alone moves the lease's other client funds:
  - the deposit, held for the tenant;
  - a payout to the landlord, or the deposit back to the tenant.
    A payout takes no more than the lease holds for that person (its receipts
    less its payouts), besides the customer-wide limit.
- Voiding a rent receipt whose money was handed over is refused until the
  payout is voided.
- Each installment carries what was paid, what is left and its state: paid,
  upcoming, due, overdue, or released. Payments are tracked only where the
  office collects.
- The lease carries:
  - the rent due so far, collected and outstanding, and the overdue count;
  - what it holds for the landlord, and the deposit held for the tenant;
  - its renewal chain (its history).
    `GET /api/leases/installments/overdue` lists overdue installments across
    leases, oldest first.
- `POST /api/leases/:id/terminate` ends a lease early.
  - Installments due after the date are released; arrears stay owed and
    collectible.
  - It is refused while an installment due after that day is paid, and for
    a date outside the term.
  - The listing is freed.
- `POST /api/leases/:id/renew` starts a new lease the day after the old one
  ends:
  - same parties, listing and currency, with the new rent, frequency and end
    (the deposit and who collects carry over unless given);
  - the old lease is marked renewed and its installments stay owed;
  - cancelling the renewal puts the old lease back in force.
- Cancelling is refused once a voucher names the lease. `leases_guard`
  allows only these moves: active to cancelled, terminated or renewed, and
  renewed back to active.
- **Fixed during this phase:**
  - The lease page's per-installment paid amount was not tied to its own
    installment, since Drizzle leaves the column unqualified in a one-table
    select. It is now a raw query with an alias.
  - The backup listed vouchers before leases, so a full restore deleted
    installments that vouchers still named. Leases now come first.
- `test:lease-payments` (11):
  - an upgrade from `0014`;
  - collecting partly and its limits;
  - overdue lists;
  - deposit and payouts per lease;
  - voiding after a payout;
  - termination with arrears and released installments;
  - renewal, and cancelling the renewal;
  - triggers;
  - permissions;
  - a full restore.
    Lease rules: 9 unit tests. `test:contract` 145.

### 5b — lease payments UI

- The lease page has a money section (`LeaseMoney.vue`):
  - the rent due so far, collected and in arrears, with the overdue count;
  - what it holds for the landlord and the deposit held for the tenant;
  - the lease's latest vouchers;
  - buttons to collect the oldest installment owed, take the deposit, hand
    the rent to the landlord and return the deposit.
- The schedule shows each installment's paid amount, what is left and its
  state. Each installment still owed has a «تحصيل» button: a receipt for
  what is left, from the tenant, held for the landlord.
- The voucher dialog carries `lease_id` and `lease_installment_id`:
  - it locks the purpose (client funds) and the currency;
  - it locks the fund owner on rent;
  - a payout's limit is the lower of what the lease holds for that person
    and what the office holds for them.
    The voucher page and its print name the lease and the installment.
- «إنهاء مبكر» (`LeaseTerminateDialog.vue`):
  - it shows which installments the date releases, the arrears that stay,
    and the deposit to return;
  - it refuses a date after which an installment was paid.
- «تجديد» (`LeaseRenewDialog.vue`):
  - it starts the day after the old lease ends, defaulting to the same
    terms for a year;
  - it previews the new schedule, then opens the new lease;
  - it says the old lease's deposit stays held on it.
    Each lease of a renewal chain lists the chain with each link's state.
- The leases list has two tabs:
  - its leases, with an arrears column;
  - «الأقساط المتأخرة» (`?view=overdue`, `OverdueInstallments.vue`), with a
    count on the tab.
    Each overdue row can be collected, or followed up. A follow-up is a call
    task on the tenant, dated tomorrow 10:00, with the installment and amount
    in its notes; it is listed with the tasks. A customer's and a listing's
    lease lists show arrears too.
- Fixed: the lease page's next due date was wrapped in `<bdi>`, which
  scrambled the right-to-left marks the Arabic date format adds.
- Web demo (`pnpm demo:reset`):
  - `LS-000001`: monthly 850,000 from 1/7/2026 with the office collecting.
    Partly collecting installment 1 (500,000) left 350,000 on it. Arrears
    went from 3,400,000 to 2,900,000, and the lease held 500,000 for the
    landlord.
  - The payout dialog offered those 500,000 with the lease limit, and
    handing them over left 0 held.
  - The termination preview for 31/10 released 8 installments (6,800,000)
    and kept 2,900,000 in arrears; it was not confirmed.
  - Renewing at 900,000 opened `LS-000003` from 1/7/2027, with the chain
    showing `LS-000001` renewed and `LS-000003` not started.
  - `LS-000002`, USD quarterly for 2026, was ended on 31/10: nothing
    released, 4,800 in arrears still collectible.
  - The overdue tab listed 8 installments oldest first, including the
    renewed lease's. A follow-up from it saved an open, high-priority call
    task on the tenant.
  - At 1024 px (the window's minimum) nothing scrolls sideways. At 375 px
    the web demo's command bar is wider than the screen on any page with a
    parent link, as on the deal page; that is the shell, not this page.

### 6a — financial reports (server)

- New module `modules/reports`, at `/api/reports/financial/*`, behind the
  new permission `reports.financial` (Super Admin by default). Its reports:
  - trial balance;
  - income and expenses, optionally by month, with expenses by voucher
    category;
  - balance sheet, with the earnings not yet closed;
  - cash flow, by the heading of the other side, with each cash and bank
    account's movement;
  - commissions: collected, outstanding, employees' shares, by deal type
    and by employee, optionally for one employee;
  - receivables, aged oldest charge first;
  - payables: client funds by customer, other payables, employees' shares
    owed beside the ledger's;
  - one account's ledger.
- They read the posted journal (plus commissions, splits and vouchers for
  the shares), so they agree with the trial balance. One section per
  currency; exact money throughout.
- Each formula is in `docs/REPORTS.md`. No migration and no new table.
- `test:reports` posts a known year and checks every report's figures. It
  also checks them against each other and against the journal:
  - the trial balance's debits are every posted line;
  - the balance sheet's earnings are the income statement's net;
  - receivables add up to the receivable account;
  - cash flow closes at cash plus bank;
  - recorded commissions are the brokerage income.
    It covers period edges, the currency filter, validation and the
    permission.
- Report rules: 4 unit tests (period defaults and Baghdad's date, months,
  aging edges, overpayment). `test:contract` 153 (8 report endpoints).
- Timing on a generated year of 40,000 posted entries (80,000 lines),
  medians:
  - trial balance 67 ms;
  - income statement 92 ms;
  - balance sheet 169 ms;
  - cash flow 233 ms;
  - receivables 140 ms;
  - payables 37 ms.
    All are under the plan's 500 ms.

### 6a — financial reports UI

- «التقارير المالية» (`/reports/financial`, under المالية in the
  navigation, `reports.financial`) has a tab per report:
  - income and expenses (optionally month by month);
  - balance sheet;
  - cash flow;
  - commissions (optionally one employee);
  - receivables;
  - payables;
  - trial balance;
  - an account's ledger.
- The filters live in the address, so a link reopens the same report:
  - a period, or one day;
  - the currency;
  - month by month;
  - the employee;
  - the account.
- Each report response is mapped once to one table model
  (`utils/financialReports.ts`, `utils/reportDocument.ts`). The screen
  (`components/reports/ReportView.vue`), Excel, PDF and printing all show
  that same model.
  - On screen: figures first, then tables. Every column sorts, amounts
    exactly as hundredths. A search filters the rows. Totals sit in each
    table's footer.
  - Links into records show only where the viewer may open them (customer,
    deal, commission, journal entry). An account opens its ledger inside
    the reports.
  - Excel has one right-to-left sheet per currency, with amounts as
    numbers. PDF and print use A4 landscape with the office's logo.
- Web demo (`dalaly_demo` with a deal, two commissions, one with an
  employee's share, a collection, two expenses, capital, and the lease
  money from 5b):
  - income and expenses: 7,500,000 revenue, 1,930,000 expenses
    (1,000,000 of it the share) and 5,570,000 net. Month by month gave
    June, August and September. The lease rent was not income.
  - balance sheet: assets 26,570,000 = liabilities 1,000,000 + equity
    20,000,000 + unclosed earnings 5,570,000.
  - cash flow closed at 22,070,000, with the rent in and out netting to 0.
    Receivables were 4,500,000 (2,500,000 over 90 days, 2,000,000 at
    31–60). The trial balance balanced at 33,430,000.
  - opening the cash account from the trial balance opened its ledger,
    closing at 22,070,000.
  - sorting, search, Excel (rows and right-to-left checked in the file),
    PDF and print (A4 landscape rendered) worked. Nothing scrolls sideways
    at 1024 px; the month columns scroll inside their table.
- Fixed while checking: the balance sheet's "unclosed earnings" row
  printed "undefined" in its empty cells.
- `scripts/renderer-utils.test.ts`: signed amounts; mapping with and
  without permissions (links, cancelled rows, warnings); Iraqi month names.

### 6b — operational reports (server)

- Four reports at `/api/reports/operations/`, each behind the new
  `reports.operations` and its area's read permission:
  - **deals**: created, won, lost, cancelled and open now; win rate and the
    period's conversion; cycle days; the pipeline by stage and expected
    commission; lost reasons; each employee's results and commissions;
    commissions by deal type; the closed deals;
  - **customers**: active, new, contacted; uncontacted with something open;
    repeat; new customers converted; contacts by type and employee; request
    conversion;
  - **listings** (sale or rental): statuses; sold or rented in the period;
    age; listings without activity; supply against demand by type, price
    band and location; requests nothing matches;
  - **leases**: in force with their monthly rent; expiring; due and
    collected; overdue; ended and renewed; rental brokerage.
- Request figures are null without `requests.read`. Where the dashboard
  already defines a figure, the report uses that definition:
  - listings without activity;
  - listings sold or rented, from the change log;
  - matching.
- No migration. Formulas are in `docs/REPORTS.md`.
- `operational-reports.test.ts` (in `test:reports`) writes the data for
  each figure and checks it:
  - seven deals across stages, employees and reasons;
  - customers with contacts, requests, open and won deals;
  - listings of three ages, a sale in the change log, an unmatched request;
  - leases collected in part, expiring, renewed, in two currencies.
    It also checks the filters (employee, deal type, days), validation and
    each report's permissions, with request figures left out without
    `requests.read`. Lease dates are relative to the office's today, so the
    suite does not age.
- Report rules: 5 unit tests (rates, medians, age buckets, price bands).
  `test:contract` 157 (5 operational endpoints).

### 6b — operational reports UI

- «تقارير العمل» (`/reports/operations`) sits under الصفقات والعقود in the
  navigation, behind `reports.operations`. It has a tab per report:
  - deals;
  - customers;
  - sale listings;
  - rental listings;
  - leases in force.
    A tab shows only to users with its area's read permission. The filters
    are in the address:
  - the period;
  - the employee (deals, customers);
  - the deal type;
  - the days (uncontacted customers, or leases ending).
- `utils/operationsReports.ts` maps each response to the report model from
  6a. The screen, Excel, PDF and print come with it.
- The model gains a `percent` column kind, a currency per row (tables that
  list dinars and dollars), a currency per column (an employee's dinar and
  dollar commissions), and a section title other than a currency's.
- Links to deals, customers, requests, listings and leases show only to
  those who may open them. Columns of request figures are left out without
  `requests.read`.
- Web demo, after adding deals: one lost with a reason, one negotiating,
  one won.
  - **Deals:** 4 created, 1 won, 1 lost, a 50% win rate, 25% of the
    period's deals won. The reason grouped at 100%. Each employee had a
    row, and the unassigned deal carried its 7,500,000 commission.
  - **Customers:** 3 with something open and no contact in 30 days, and
    the requests' conversion.
  - **Sale and rental listings:**
    - status, age and type;
    - price bands («1,000,000 – 1,500,000 شهرياً»);
    - demand by area;
    - the requests nothing matches.
  - **Leases:** 500,000 collected of the 3,400,000 dinars due (14.7%),
    2,900,000 overdue for 122 days, and the dollar lease apart.
  - **Excel:** a sheet named for the report, with counts and rates as
    numbers. The PDF showed the rates and the dollar column.
- `scripts/renderer-utils.test.ts`:
  - links follow permissions;
  - an unassigned employee row;
  - dollar columns and rows;
  - rental types in Arabic;
  - price band labels;
  - request columns are left out without the requests.

### 7a — navigation and quick add

- The sidebar is grouped by business area (`NAV_SECTIONS`):
  - daily work first: لوحة التحكم and المهام والمتابعات;
  - العقارات: sale and rental listings and their favourites;
  - الزبائن والطلبات: customers, both kinds of request, documents;
  - الصفقات والعقود: deals, contracts, leases in force, templates;
  - الحسابات;
  - التقارير: financial and operational;
  - الإعدادات والإدارة.
    The brief's areas are all there. Tasks sit at the top because they are
    daily work. Leases in force sit with deals and contracts because they
    come from them. Documents sit with customers because they are customers'
    papers.
- «إضافة» in the command bar (`components/app/QuickAdd.vue`, list in
  `QUICK_ADD`) opens a new record from any page:
  - a sale or rental listing;
  - a customer;
  - a purchase or rental request;
  - a task for a customer;
  - a document;
  - a deal;
  - a lease entered by hand;
  - a receipt or payment voucher.
    Each item shows only to users with every permission it needs, and items
    are grouped with dividers. The dashboard's own add menu is gone, since
    the command bar's replaces it.
- `composables/useNewFromQuery.ts` opens a page's add dialog when `?new=`
  reaches it, also when the page is already open, then drops `new` (and
  `person`) from the address. It is used by the customers, deals, leases,
  vouchers (`?new=receipt` / `?new=payment`), tasks, requests and
  documents pages. The last two used to handle `?new=1` only on mount.
- Ctrl+N stays each page's own add shortcut. Quick add has no shortcut of
  its own.
- Web demo:
  - the sidebar showed the new order;
  - from the deals page, «صفقة» opened «صفقة جديدة» and the address went
    back to `/deals`;
  - from other pages, each item opened its page and its dialog: receipt,
    payment, customer, task, purchase request, document, lease.
    The dev server reloaded the page a few times while optimising
    dependencies; that is Vite in development only.

### 7b — dashboard (server)

- `GET /dashboard/business` gives what needs attention:
  - tasks due today, this week and overdue;
  - deals negotiating, stalled 14 days and won in 30 days;
  - customers needing contact;
  - leases expiring in 30 days and installments overdue;
  - the month's money: commissions collected and outstanding, revenue,
    expenses, net.
    `GET /dashboard/alerts` gives the notification center's counts of the
    same. Each section follows its read permission. Definitions are in
    `docs/OPERATIONS_DASHBOARD.md`.
- Each figure reuses an existing definition:
  - the tasks list's `due` filters;
  - the operational reports' uncontacted customers
    (`uncontactedCustomers`, now shared);
  - the overdue installments list;
  - the income statement.
- Changed: a customer's **contact** is now an activity or follow-up that
  took place (done), dated by when it was done. A task still open is a
  plan. This applies to the operational reports too, whose suite now has
  a planned call that does not count. `docs/REPORTS.md` is updated.
- The summary runs two sections at a time, one query each at a time
  (`inParallel`, now exported), like the dashboard summary before it.
- `test:dashboard-business` (in CI) checks each figure and the alerts
  against data written relative to today. That data is:
  - tasks late, today and in three days;
  - deals negotiating, stalled, won lately and long ago;
  - a commission partly collected and an expense;
  - leases ending and overdue.
    The month's money is checked against the income statement for the same
    days. It also checks each section's permission and the empty summary of
    a user without any.

### 7b — dashboard UI

- The dashboard has a band of panels, under the summary strip and the
  priorities, for what needs attention (`components/dashboard/BusinessPanels.vue`):
  - **tasks**: overdue, today, the next 7 days, and the first ones;
  - **deals**: negotiating, stale 14 days, and won in 30 days;
  - **customers needing contact**;
  - **leases in force**: installments overdue, with the arrears per
    currency, and those ending within 30 days;
  - **this month's money**: commissions collected and outstanding,
    expenses, and net.
    Every figure and row is a link to its records:
  - `/tasks?due=overdue|today|week`;
  - `/deals?stalled=1`, `/deals/:id`;
  - `/clients/:id`;
  - `/leases?view=overdue`, `/leases/:id`;
  - the month's income statement;
  - `/accounting/commissions?state=open` (only with `commissions.read`);
  - the operational reports, where the user has them.
    A panel shows only with its permission.
- The tasks, deals and commissions pages now read those filters from the
  address. The matching workspace, decisions and risks stay below.
- **Notification bell** (`components/app/NotificationBell.vue`) in the
  command bar:
  - it lists each alert with its count and opens its records;
  - its badge counts the urgent and warning ones; information alone shows
    a dot;
  - it refreshes every two minutes, on moving between pages (at most every
    15 seconds), and on opening;
  - titles and links are in `constants/alerts.ts`.
- «Stale» deals use the deals page's word, «راكدة».
- Web demo:
  - at 1366×768, five panels; the bell showed 13 (5 overdue tasks, 8
    overdue installments), with today's task and 4 customers as
    information;
  - «مهام فات موعدها» opened the tasks list filtered to overdue: 5, as in
    the bell;
  - `/deals?stalled=1` switched the deals page's «راكدة 14 يوماً» filter
    on, and `/accounting/commissions?state=open` listed the 2 open ones;
  - the month's money showed October's 3,000,000 collected and 4,500,000
    outstanding;
  - at 1024×720, three panels a row and no sideways scroll.

### 8a — business benchmarks

- `pnpm perf:business` (`scripts/perf/business.mjs`) seeds a year of
  business records on the 5,000-property dataset and times each business
  list, report and a receipt posting against the plan's targets
  (section 7). Method and results: `PERFORMANCE.md`, "Business lists and
  dashboard, October 2026".
- On `main` (`c77bf8e`), seven list requests missed the 15 ms median:
  vouchers 52.5 ms, deals 30.8 (stalled 40.3), tasks 22.1 (overdue 20.0),
  leases 22.0 and alerts 57.2. For vouchers, `EXPLAIN` showed the time
  went to planning a dozen joins per page, not to reading.
- The vouchers and deals lists read linked names with scalar subqueries
  (`lookupValue` in `infrastructure/database/lookup.ts`). Their counts no
  longer join. Tasks cut the page before joining names. Alerts skip the
  month's money, which no alert shows.
- After: vouchers 7.5 ms, deals 14.8 (stalled 18.0), tasks 10.3, the
  business summary 59 → 36.5, alerts 47.3, a receipt 19.3 → 13.1. Every
  report's median is under 50 ms. Still over the 15 ms median: leases (22.7,
  unchanged, left for a later change) and stalled deals (18.0), both under
  the 50 ms p95, and alerts (p95 64.4), which no page waits on.
- Response shapes are unchanged: `test:contract` and the suites of each
  changed list pass.

### 8b — dead code

Each item was checked with a search of the renderer, the server, its
scripts, the Electron app and the docs before it was removed:

- `components/properties/PropertyActions.vue` and `utils/schedule.ts`
  (`afterNextPaint`): no file imports them.
- Renderer service functions with no caller:
  - `listActivities`, `getActivity`, `deleteActivity`;
  - `getTransfer`, `addPersonDocument`;
  - `listPeople`, `getPersonAudit`, `listProperties`, `listRentals`;
  - `listRentalRequests`, `listPurchaseRequests`.

  The list pages use the paged lists and a customer's page reads their
  timeline. The API routes themselves are unchanged.

- `listingKindText` (`utils/listingText.ts`) and the `OfficeProfileRecord`
  alias: no use.
- The `stats` module and `GET /api/stats/summary`: no caller anywhere
  (renderer, Electron, tests, perf).
- The contract test still calls the routes of those service functions
  and checks their status. With no renderer type declared for them, it no longer compares
  their bodies with one: no renderer code reads them. That is 10 checks
  fewer (159 → 149): the 9 GETs and `POST /documents/people/:id`.

Left for later PRs, as they need a decision or a closer look:

- the capture-mode leftovers (`isCaptureMode`, `isWebDemo`, the capture
  docs and scripts);
- `server/scripts/fixtures/legacy-contract-*.sql` (legacy contract data,
  `CONTRACT_SYSTEM_REMOVAL_MAP.md`);
- tracked files that `.gitignore` lists.

### 8c — list reload loop

- The vouchers, commissions, journal and leases pages reloaded their list
  about 7 times a second while open. `FilterBar` scheduled `apply` after
  every re-render, because it deep-watched an array the page re-creates on
  each render. It now compares the filters' values.
- Those pages, the cash page and the overdue installments view also sent
  their first page twice. They now start the first load during setup, as
  the customers and tasks pages do.
- Evidence (web demo): one list request per view opened and none after,
  against 15 to 30 in the first seconds and a steady stream before; a
  filter change sends one. `PERFORMANCE.md`, "List pages reloading in a
  loop".

### 8d — query-string helper

- Fourteen renderer services had their own copy of the lines that turn
  filters into `?key=value`, in three variants. They now share
  `queryString` (`utils/query.ts`), which leaves out `""`, `null` and
  `undefined`.
- No caller passed `""` to the documents list (the only variant that kept
  it) or `null` to the variants that sent it as the text `null`, so every
  request keeps its URL. In the web demo the properties, vouchers and
  income-statement requests had the same query strings, and filters were
  added the same way (`kind=receipt`, `status=available`).
- `renderer-utils.test.ts` covers the helper: empty values left out,
  Arabic text encoded, `0` and `false` kept.

### 8e — shared date schema

- Eight request schemas declared their own `YYYY-MM-DD` date: five
  identical copies (cash, commissions, journal, vouchers, leases) and three
  variants. `isoDate` is now in `shared/validation/fields.ts` with the
  Arabic message.
- The variants build on it:
  - reports add a calendar check (`reportDate`);
  - deals keep an optional close date that `""` clears (`closeDate`);
  - contract terms keep their `null` default (`termDate`).
- One message changes: an invalid contract term date now reads «التاريخ
  بصيغة YYYY-MM-DD.» like the others, instead of the generic one.
- Every suite that sends these dates passes: `test:deals` 15,
  `test:accounting` 9, `test:ledger` 13, `test:vouchers` 10,
  `test:commissions` 10, `test:cash` 9, `test:finance` 9, `test:leases` 9,
  `test:lease-payments` 11, `test:reports` 2, `test:agreements` 11,
  `test:contract` 149.

### 8f — renderer helpers

- Eight files tested an API amount for zero with their own copy of
  `/^-?0(\.0+)?$/`. They now call `isZeroAmount` (`utils/money.ts`).
- The report, voucher and listing exports each escaped HTML themselves,
  and the listing export left quotes as they were. They now share
  `escapeHtml` (`utils/html.ts`), which escapes `& < > " '`.
- `renderer-utils.test.ts` covers both. In the web demo the lease page
  showed its money as before: zero balances hide their payout buttons.
- The leases list was measured again. It met the 15 ms target on that
  run (14.5 ms, p95 15.7), with the whole run 20–30% faster than the 8a
  one. Its time is split between planning and execution, so it is left
  as it is (`PERFORMANCE.md`, "The leases list, measured again").

## Database migrations

| Migration                    | Phase            | What it adds                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0000`–`0004`                | before this plan | baseline schema, document types, property indexes, search text, agreements                                                                                                                                                                                                                                                                                    |
| `0005_crm_tasks`             | 2a               | task columns on both follow-up tables (customer, assignee, status, priority, completion, outcome, `updated_at`), `activities`, their indexes and checks; existing follow-ups without a date or already past become `done`                                                                                                                                     |
| `0006_customer_crm`          | 2b               | `people.roles` (checked `text[]`, GIN index), `source` (checked), `assigned_user_id` (FK users, set null, indexed)                                                                                                                                                                                                                                            |
| `0007_deals`                 | 3a               | `deals` (checked type, stage, priority, currency, listing kind, distinct parties, ISO close date), `deal_stage_history`, `deal_offers`, `activities.deal_id`                                                                                                                                                                                                  |
| `0008_chart_of_accounts`     | 4a               | `accounts` (checked type, currency, code digits, posting accounts with a currency, no self-parent; unique code and `system_key`; parent FK restrict). The default accounts are added at startup, not by the migration.                                                                                                                                        |
| `0009_general_ledger`        | 4b               | `journal_entries` (checked status, currency, source, reversal link, posted time; unique code, idempotency key and reversal), `journal_lines` (one positive side; FK accounts restrict, people and deals set null for restores), `accounting_periods`; triggers `journal_entries_guard`, `journal_lines_guard`, `accounts_ledger_guard`                        |
| `0010_vouchers`              | 4c               | `vouchers` (checked kind, currency, positive amount, status and void fields together, distinct accounts; FK accounts and entries restrict, people and deals set null for restores); trigger `vouchers_guard`; `journal_entries_guard` replaced to refuse deleting a user with posted entries                                                                  |
| `0011_commissions`           | 4d               | `commissions` (checked payer role, currency, basis with rate and base, positive amount, cancel fields together; one active per deal and payer), `commission_splits` (one per user, positive), `vouchers.commission_id` and `commission_split_id` with a kind check; triggers `commissions_guard`, `commission_splits_guard`; `vouchers_guard` replaced        |
| `0012_expenses_cash`         | 4e               | `expense_categories` (an account at least), `cash_transfers` (positive, distinct accounts, void fields together), `cash_reconciliations` (difference = statement − book), `vouchers.expense_category_id` with a check; journal source `reconciliation`; triggers `cash_transfers_guard`, `cash_reconciliations_guard`; `vouchers_guard` replaced (whole rows) |
| `0013_client_funds_held_for` | 4f               | `vouchers.held_for_person_id` (FK people, set null, indexed; only on client funds, checked); `vouchers_guard` replaced to refuse clearing it                                                                                                                                                                                                                  |
| `0014_leases`                | 5a               | `leases` (contract and revision, listing, landlord and tenant set null for restores; positive rent, frequency, end after start, cancel fields together; one live lease per contract) and `lease_installments` (period, due date, positive amount; unique per lease and number); triggers `leases_guard`, `lease_installments_guard`                           |
| `0015_lease_payments`        | 5b               | `vouchers.lease_id`, `vouchers.lease_installment_id` (only on client funds; an installment only on a receipt; indexed); `leases` termination fields and `renewed_from_id` (one live renewal per lease), status check widened to terminated and renewed; `leases_guard` replaced                                                                               |

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

- `/api/dashboard/summary` has no renderer caller. It is kept:
  `test:dashboard`, the contract test and `pnpm perf` read it, and
  `inParallel` lives in its file. (`/api/stats/summary` was removed in 8b.)
- The renderer has no unit tests of its own. Its pure helpers are tested
  from `server/scripts/renderer-utils.test.ts`.

## Performance measurements

Baseline: `PERFORMANCE.md`, "Baseline, October 2026" and later sections.
Targets for new modules: `BUSINESS_SYSTEM_PLAN.md`, section 7.
