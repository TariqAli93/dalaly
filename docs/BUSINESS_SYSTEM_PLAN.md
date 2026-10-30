# Business system plan (Phase 0 audit, 2026-10-29)

The audit and plan for growing Dalaly from a listings and contracts manager
into a complete brokerage office system. The workflow it builds towards is:

customer → request → matching → viewing → negotiation → deal → contract →
payment → commission → reports → follow-up.

It sits next to [`AUDIT_AND_ROADMAP.md`](AUDIT_AND_ROADMAP.md), which covers
the October performance and safety work that is already done.
[`IMPLEMENTATION_PROGRESS.md`](IMPLEMENTATION_PROGRESS.md) tracks each phase,
branch and PR. The **verified** findings below were re-read in the code at
`main` `3e01f9f`. Findings marked _suspected_ have not been confirmed yet.

## 1. Baseline (`main` at `3e01f9f`)

Measured on the development PC (Windows 11, Node 22.22, pnpm 10.28,
PostgreSQL 18 local).

| Check                         | Result                                    |
| ----------------------------- | ----------------------------------------- |
| `pnpm typecheck`              | pass, 23 s                                |
| `pnpm exec eslint .`          | pass, 1 min 48 s                          |
| `pnpm test` (fast unit tests) | 52 / 52 pass, 14 s                        |
| `pnpm build`                  | pass, 1 min 19 s (a chunk size warning)   |
| CI (`.github/workflows/ci.yml`) | `check` on windows-latest, `database` on ubuntu with PostgreSQL 18 |
| Branch protection on `main`   | none; PRs are merged with merge commits   |

The performance baseline is the one already recorded in
[`PERFORMANCE.md`](PERFORMANCE.md): login form about 2.1 s after launch,
login click to painted dashboard about 1.07 s, paged lists about 7 ms per
page at 5,000 properties, a search under 1 ms in PostgreSQL. The targets for
the new modules are in section 7.

## 2. What exists

| Domain | Storage | API | Renderer |
| --- | --- | --- | --- |
| Customers | `people` (code, names, phones, IDs, address, type, status, notes); no role column | `/api/people` CRUD, paged, archive/restore | `PeoplePage`, customer hub `PersonDetailsPage` (requests, owned listings, documents, notes) |
| Sale listings | `properties` (numeric(18,2) prices, owner text + optional `owner_person_id`), images, follow-ups, favorites, audit | `/api/properties` CRUD, paged, search, images, follow-ups, audit | list, record page, form, gallery |
| Rental listings | `rentals`, `rental_images`, `rental_followups`, favorites | `/api/rentals` (same shape) | list, record page, form |
| Requests | `purchase_requests`, `rental_requests` (budget, location, criteria, status open/matched/closed/archived) | CRUD + paged; no delete | list pages, request record page with matches |
| Matching | computed, nothing stored (`matching.rules.ts`, also as SQL) | 4 GET endpoints | request pages, dashboard match workspace |
| Follow-ups | `property_followups`, `rental_followups`: type (call, meeting, visit, negotiation, other), notes, `scheduled_at`, creator | per-listing CRUD | `ListingFollowups`, `RecordFollowupDialog`, dashboard appointments |
| Contracts | `agreement_*` (four templates, drafts against `draft_rev`, immutable revisions, exports); money only inside `terms` jsonb (currency IQD/USD, sale price, installments, rent, deposit, commission) | `/api/agreements` | Contract Studio pages |
| Documents | `identity_documents`, `document_types` (customer files, optional contract link) | `/api/documents` | `DocumentsPage`, dialog |
| Dashboard | `/dashboard/overview` and `/dashboard/matching` | per-section permissions | `DashboardPage` and its panels |
| System | users (PIN), roles, 56 permissions, sessions, audit log, settings, office profile, backup/restore, remote tunnel, Excel import, locations | yes | settings, users, roles, locations |

Infrastructure already in good shape, and to be reused rather than rebuilt:
record codes under an advisory lock, real transactions, `DomainError` and one
Arabic error shape, paged lists with whitelisted sorts, `toApiObject`, the
`test:contract` drift check, streamed backup with `optional` tables for
newer schemas, and the shared renderer pieces (`DataGrid`, `FilterBar`,
`FormSection`, `FormActionsBar`, `SideSheet`, `PersonPicker`, `StatusChip`,
`EmptyState`, `AppPage`, `useDirtyForm`).

## 3. What is missing

Verified by searching `server/src` and `apps/renderer/src`. There is no
table, module or page for any of these:

- **CRM:** customer roles, an assigned employee, an activity timeline across
  listings, a last-interaction or next-follow-up summary, duplicate
  detection, or a way to link a sale listing's owner to a customer from the
  form (the rental form can do this). Follow-ups have no status, assignee,
  priority, outcome or completion. People have no audit.
- **Deals:** nothing. A match cannot become a deal or a contract. Contracts
  do not link to requests.
- **Accounting:** no accounts, journal, receipts, payments, commissions,
  expenses, cash or bank. Amounts exist only as listing prices and in
  contract `terms`.
- **Leases:** no active-lease record. The start and end dates and the rent
  of a lease exist only in the contract's `terms`. There are no installments
  and no overdue tracking.
- **Reports:** none. The only aggregates are the dashboard's.
- **Notifications:** none. The only notice is the in-app snackbar.
- **Unused endpoints:** `/api/dashboard/summary` and `/api/stats/summary`
  have no caller in the renderer. `test:dashboard` still reads the first.

## 4. Critical issues (Phase 1)

Verified by reading the code at `3e01f9f`. They are fixed in Phase 1,
before any new module touches files or money.

| # | Severity | Where | What happens |
| --- | --- | --- | --- |
| 1 | High | `images.routes.ts` DELETE `/:id/images/:imageId`, `deleteImageRow` | The row is deleted by `imageId` alone. A user allowed to manage images can delete another property's image through any property's URL. `ensurePrimary` then runs on the wrong property. |
| 2 | Medium | `images.routes.ts` GET `/:id/images/:imageId/file` | The file is served by `imageId` alone, so any property's URL reads any image. The caller needs `properties.read` either way, so nothing leaks between permission levels, but the parent check is missing. |
| 3 | Medium | `setPrimaryImage`, `setPrimaryRentalImage` | All primary flags of the listing are cleared before the new one is set. The update that sets it is scoped to the listing, so an unknown id, or an id from another listing, leaves the listing with no primary image and still answers 200. |
| 4 | Medium | image uploads (sale and rental), `createIdentityDocument` | The file is written before its row. If the insert fails (a missing listing or person, a constraint, a lost connection), the file stays on disk with no row. Uploads do not check that the parent exists, so the client gets a 409 for what is a 404. Several images upload one row at a time, so a failure part-way keeps the first ones. |
| 5 | Medium | `deleteProperty`, `deleteRental` | Image rows go by `ON DELETE CASCADE`, but their files and thumbnails stay on disk, outside every backup and every cleanup. |
| 6 | Low | `updateCompanyLogo` | Each new logo is a new file, and the previous one is never removed. |
| 7 | Low | image uploads | The bytes are not checked against image signatures. The extension comes from the declared MIME type or the name, and the file is served with a type taken from its extension. |
| 8 | High | `auth.hooks.ts` | The session token is accepted from `?token=` on **every** route, mutations included, not only on the `<img>` and download routes it exists for. Seven renderer URL builders put the full session token in URLs (images, thumbnails, rental images, documents, logo, backup download). A copied image link, or a URL recorded by a proxy or by the optional Cloudflare tunnel, is a working session for the API until it expires. The API's own log drops query strings (AUDIT_AND_ROADMAP, first batch), but that is the only protection. |
| 9 | Low | `rental-images.routes.ts` DELETE | A rental image deletion writes no audit row (the sale side does). |

The fix for 8 is a media token: a value derived from the session (an HMAC
keyed by the session's stored hash). It is accepted only on GET requests to
the file routes, and it dies with its session. The session token itself is
no longer accepted from a query string.

A second, independent pass found the items below. Rows 10–15 were re-read
in the code for this plan. Rows 16–20 come from that pass alone.

| # | Severity | Where | What happens |
| --- | --- | --- | --- |
| 10 | High | `remote-access.service.ts`, `main.js` `stopLocalApi` | Nothing stops cloudflared when the API exits. The API has no exit handler, and `serverProcess.kill()` on Windows terminates the API alone, not its children. A running tunnel can outlive the app and then forward to the next launch's API, while `/status` reports it stopped. _Not reproduced with a live tunnel._ |
| 11 | Medium | `remote-access.service.ts` | The `exit` handler clears `processRef` without checking which process exited. A disable followed by an enable lets the old process's exit drop the reference to the new tunnel, which can then no longer be stopped. The spawn has no `error` listener, so a spawn failure (antivirus, permissions) is an unhandled error event that can crash the API. |
| 12 | Medium | `auth.routes.ts` login | The throttle is checked before the awaited `login()`, and the failure is recorded after it. Parallel guesses all pass the check before the first one fails, so a burst gets around the 5-attempt limit. |
| 13 | Medium | `backup.service.ts` `exportBackup`, restore from `file_path`, `PUT /backup/dir` | These accept any absolute server path, so an export can overwrite any file the app can write. Locally that path comes from a native dialog. Through the tunnel, a remote user with `backups.create` or `backups.restore` reaches the same routes. |
| 14 | Medium | renderer `index.html`, `splash.html`, `main.js` | No Content-Security-Policy anywhere, while the renderer uses `v-html` for contract previews and keeps the session token in `localStorage`. |
| 15 | Low | `followups.repository.ts`, `rental-followups.repository.ts` | A follow-up update and delete match on the follow-up id only, ignoring the listing in the URL (the same pattern as finding 1). |
| 16 | Medium | `permissions.routes.ts`, `roles.repository.ts` | `PUT /permissions/:id` can rename a system permission's key, and the Super Admin role can be renamed (its protection compares the name). |
| 17 | Medium | `main.js` `setWindowOpenHandler`, `external-links.js` | Opening a document hands its URL, session token included, to the system browser (`shell.openExternal` accepts `http://127.0.0.1:34567/...`), where it lands in history and sync. |
| 18 | Low | `backup.js` `backup:save-schedule` | The schedule's host, port, user and recipient are not validated, and the saved SMTP password is kept when the host changes. A compromised renderer could point the schedule at its own server and receive the password. |
| 19 | Low | `main.js` `config:save-database-url` | Only checked to be a non-empty string. The database URL, password included, is stored in plain text in `config.json` (SMTP and backup passwords use `safeStorage`). |
| 20 | Low | `server.ts` error logging | Drizzle's query errors carry their bound parameters in the message, so a logged 500 can include personal data and PIN hashes (no plaintext secrets). |

Phase 1a fixes rows 1–7, 9 and 15. Phase 1b fixes 8, 12 and 17. Phase 1c
fixes 10, 11, 13, 14, 16 and 18–20.

## 5. Module dependencies

```text
people ◄── properties, rentals (owner_person_id)
       ◄── purchase/rental requests (person_id)
       ◄── agreement_parties, identity_documents
       ◄── activities (Phase 2) ◄── deals (Phase 3)
deals ──► property | rental, buyer/seller people, request, agreement
agreements (issued) ──► leases (Phase 5) ──► lease installments
commissions (Phase 4) ──► deals; receipts ──► commissions, installments
receipts, expenses, transfers ──► journal entries ──► accounts
reports (Phase 6) read every table above; dashboard (Phase 7) reads reports
```

Each arrow is a foreign key. A module is built only after every module it
points to has been merged.

## 6. Data model plan

All of it is additive: new tables and nullable columns, in new migrations
`0005` and later. Every new table goes into backup `TABLE_SPECS` as
`optional`, so archives from older builds still restore.

### 6.1 CRM (Phase 2)

- `people` gains `assigned_user_id` (FK users, set null) and `source`, plus a
  `person_roles` table (person, role: owner, buyer, seller, tenant,
  landlord, investor, other). A role is also implied by the person's data:
  someone who owns a listing is an owner.
- **Follow-ups become tasks where they already live.** `property_followups`
  and `rental_followups` gain the task columns: `person_id`,
  `assigned_user_id`, status (open, done, cancelled), priority,
  `completed_at`, outcome and `updated_at`. `scheduled_at` stays the due
  date. A follow-up without a date is a logged interaction and is `done`.
  A new `activities` table holds the same columns for what has no listing:
  a customer, a request and, from Phase 3, a deal. One read model
  (`UNION ALL` over the three tables with a `source` column, the pattern the
  dashboard already uses for the two follow-up tables) serves the tasks
  page, the overdue list and the customer timeline. Each write goes to its
  own table's routes.

  Moving every follow-up into one new table was considered and rejected.
  The `properties` and `rentals` backup scopes restore their follow-ups with
  their listings, so a single table would either lose customer activities
  in a scoped restore or need its own conversion on every restore of an
  older archive. The dashboard's reference queries (`test:dashboard`) would
  also change.

  Permissions: the existing `followups.*` keys cover sale follow-ups and
  `activities` (the latter also needs `people.read`), and
  `rentals.followups.*` covers rental follow-ups, so existing roles keep
  working.
- **Duplicate detection** compares phone digits (`07…` and `+9647…` forms)
  and the national ID. It warns on create and edit; it never merges on its
  own.

### 6.2 Deals (Phase 3)

- `deals`: code `D-0001`, type (sale or rent), stage (the twelve stages
  below), priority, a sale or rental listing (at most one), buyer/tenant and
  seller/landlord people, assigned user, the request it came from, a linked
  agreement, asking price, agreed price, currency, expected commission,
  expected close date, lost reason, `stage_changed_at`, `closed_at`, and
  created/updated by.
- Stages: `new`, `contacted`, `qualified`, `viewing_scheduled`,
  `viewing_done`, `negotiating`, `agreed`, `contract_preparation`,
  `contract_issued`, `won`, `lost`, `cancelled`. The allowed moves are a
  table in code, checked under a row lock. `won` needs an agreed price and
  both parties. `lost` needs a reason.
- `deal_stage_history` (every move, with a reason) and `deal_offers` (party,
  amount, status: proposed, countered, accepted, rejected, withdrawn).
  Viewings and negotiation notes are `activities` linked to the deal.
- A deal can be created from a match, a customer or a listing. "Prepare
  contract" creates an agreement from the right template, with its parties,
  listing and price filled in, and links it to the deal. Issuing that
  agreement moves the deal to `contract_issued`.

### 6.3 Accounting (Phase 4)

Exact arithmetic everywhere. Amounts are `numeric(18,2)` in SQL and
decimal strings in the API (`"1500000.00"`). TypeScript does its arithmetic
on `bigint` minor units (`shared/money.ts`) and never on `number`.

- **Currency rule.** IQD and USD are kept apart. Every account has one
  currency, every journal entry is in one currency, and every report shows
  each currency separately. Nothing is converted between them.
- `accounts`: code, Arabic name, type (asset, liability, equity, revenue,
  expense), parent, currency, `is_postable`, `system_key`, active. The
  default chart has, per currency:
  - cash, bank and receivables;
  - client funds held, payables and employee commissions payable;
  - capital and retained earnings;
  - brokerage income and other income;
  - employee commissions and operating expenses.
  It is added idempotently at startup, next to the RBAC seed, rather than by
  a data migration (decided in 4a). A full restore of an archive from before
  the chart then gets it back too.
- `journal_entries` (code, date, description, currency, status draft or
  posted, source type and id, a unique `idempotency_key`, `reversal_of`)
  and `journal_lines` (account, debit, credit, optional person and deal,
  memo). A posted entry balances, and database triggers refuse to update or
  delete posted entries and lines. A correction is a reversing entry.
  `accounting_periods` close a month to new postings.
- `receipts` (numbered `RC-000001`, cash or bank, payer, purpose, an
  allocation to a commission or installment, a printable Arabic receipt) and
  `payments` (paid out: to landlords and sellers, to employees, expenses).
  Voiding a receipt posts a reversal. (Built in 4c as one `vouchers` table
  with a `kind`, receipt or payment, numbered `RC-` and `PV-` separately:
  the two share every column, rule and screen.)
- `commissions` (deal, payer role, fixed or a percentage of the agreed
  price, amount, currency, status) and `commission_splits` (employee share).
  A commission is office revenue. The listing's price is never revenue, and
  money collected for a landlord or seller is a liability (client funds),
  not income. (From 4f, a client-funds voucher names whose money it is, apart
  from who paid it: a tenant's rent is the landlord's, a buyer's deposit the
  seller's.)
- `expense_categories` (mapped to expense accounts), `expenses`, transfers
  between cash and bank, and reconciliation records. (Built in 4e: an
  expense is a payment voucher naming its category, which picks the expense
  account of the voucher's currency; there is no second expense document.)

### 6.4 Leases (Phase 5)

- `leases`: code, rental listing, issued residential or commercial
  agreement, landlord, tenant, start and end, rent, currency, frequency
  (monthly, quarterly, semi-annual, annual, custom), deposit, whether the
  office collects the rent, status (active, expired, terminated, renewed),
  `renewed_from_id`, termination date and reason.
- `lease_installments`: due date, amount, paid amount from receipt
  allocations, status. An installment is overdue once its due date passes
  unpaid. Rent the office collects posts to client funds, and handing it to
  the landlord clears them. Any fee the office earns on it is revenue.
- (Built in 5a: a lease's status is active or cancelled. Expired is read
  from its dates, and termination and renewal come with 5b. The schedule is
  written at activation and never changed: installments are due on their
  period's first day, and a period the end date cuts short pays its days'
  share.)
- (Built in 5b: an installment's paid amount comes from receipts naming it,
  which are client funds held for the landlord. A deposit is held for the
  tenant. Payouts name the lease and take no more than it holds for the
  person. A termination releases later installments, and a renewal is a new
  lease naming the old one. An office fee on rent is still recorded as a
  commission or other income; no separate fee document is built.)

### 6.5 Reports (Phase 6)

These are read-only queries over the tables above. Each KPI's formula is
written down in `docs/REPORTS.md`, the way `OPERATIONS_DASHBOARD.md` does
for the dashboard. Totals are checked against the journal. A report can be
exported to Excel (the existing lazy `xlsx`) and PDF (Electron's engine).

## 7. Performance targets

Measured with the existing `pnpm perf` and `perf:*` harnesses on the
5,000-property dataset.

- No regression beyond run-to-run noise (10%) on the metrics already in the
  baseline: startup, login to dashboard, paged lists, search.
- New paged lists (deals, activities, receipts, journal): median under
  15 ms and p95 under 50 ms at the API.
- Each report: under 500 ms at the API for a year of data on that dataset.
- Posting a receipt (one transaction with its journal entry): under 50 ms.
- No caching of permissions or balances. A permission revocation and a
  posted amount take effect on the next request.

## 8. Migration safety

- Migrations are append-only and LF (`.gitattributes`). They are additive:
  `CREATE TABLE`, `ADD COLUMN` (nullable or with a default), indexes and
  triggers. Nothing drops or rewrites existing data. The legacy contract
  tables and `docs/CONTRACT_SYSTEM_REMOVAL_MAP.md` are not touched.
- Data migrations (the default chart of accounts, the follow-up status of
  existing rows) are idempotent (`ON CONFLICT DO NOTHING`, guarded
  `UPDATE`s).
- Every new table is in backup `TABLE_SPECS` with `optional: true`, in
  foreign-key order and in the right restore scopes. Its serial goes in
  `SERIAL_TABLES`. A backup round trip test covers each phase that adds
  persistent data.
- Each phase's database suite runs in CI's `database` job on a fresh
  database. The upgrade path (an existing database at `0004`) is covered by
  migrating a `0004` database that holds data, in the same suite.
- Financial immutability is enforced in the database by triggers, not only
  in code.

## 9. Roadmap

Each line is one branch and one PR into `main`, merged before the next
starts. Large phases are split. The status of each is in
`IMPLEMENTATION_PROGRESS.md`.

| Phase | Branch | Scope |
| --- | --- | --- |
| 0 | `docs/phase-00-audit` | this plan, the progress tracker |
| 1a | `fix/phase-01a-file-integrity` | findings 1–7, 9, 15: parent checks, primary image, file/row consistency |
| 1b | `fix/phase-01b-media-tokens` | findings 8, 12, 17: session tokens out of URLs, login throttle race |
| 1c | `fix/phase-01c-hardening` | findings 10, 11, 13, 14, 16, 18–20: tunnel lifecycle, local-only paths, CSP, IPC, logs |
| 2a | `feat/phase-02a-activities` | task columns on follow-ups, `activities`, tasks API (status, assignee, due, priority, outcome, overdue) |
| 2b | `feat/phase-02b-customer-crm` | customer roles, assignment, duplicate detection, owner linking, people audit |
| 2c | `feat/phase-02c-crm-ui` | customer timeline, tasks page, task dialogs |
| 3a | `feat/phase-03a-deals-core` | deals, stages, offers, history, API, permissions |
| 3b | `feat/phase-03b-deals-ui` | pipeline, table, deal workspace |
| 3c | `feat/phase-03c-deal-integration` | deal from match/customer/listing, deal to contract, closing rules |
| 4a | `feat/phase-04a-chart-of-accounts` | money library, accounts, default chart |
| 4b | `feat/phase-04b-general-ledger` | journal, posting, reversals, periods, immutability triggers |
| 4c | `feat/phase-04c-receipts-payments` | receipts, payments, numbering, printable receipt |
| 4d | `feat/phase-04d-commissions` | commissions, splits, collection |
| 4e | `feat/phase-04e-expenses-cash` | expenses, transfers, reconciliation |
| 4f | `feat/phase-04f-financial-integration` | deals and contracts to commissions and postings |
| 5a | `feat/phase-05a-leases` | leases, installments, activation from a contract |
| 5b | `feat/phase-05b-lease-payments` | collection, overdue, landlord payouts, renewal, termination |
| 6a | `feat/phase-06a-financial-reports` | P&L, trial balance, cash, commissions, receivables |
| 6b | `feat/phase-06b-operational-reports` | deals, customers, properties, rentals; exports |
| 7a | `feat/phase-07a-navigation` | navigation by business area, quick add |
| 7b | `feat/phase-07b-dashboard` | dashboard of tasks, deals, leases and money |
| 8 | `refactor/phase-08-*` | duplication, dead code, measured performance work |
| 9 | `test/phase-09-*` | end-to-end sale and rental workflows, release checks |

A module that is not finished stays out of the navigation, and its routes
stay unregistered, until its acceptance tests pass. No module is shipped
behind a flag.
