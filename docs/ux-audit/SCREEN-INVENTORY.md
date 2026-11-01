# Dalaly screen inventory

Date: 1 November 2026. Initial route inventory was prepared before visual inspection; this is the updated coverage record. See the [audit](DALALY-UI-UX-AUDIT.md) and [runtime evidence](RUNTIME-EVIDENCE.json).

**43 component-bearing routes; 39 distinct page components. Functional route coverage: 41 Electron, 0 standalone browser, 2 source-only.** Missing-contract and native failure-splash screenshots are additional error states and do not substitute for functional contract/startup-error route coverage. No successful business saves or contract exports were performed.

## Routes

| Route | Page component | Inspection status | Evidence | Limits |
|---|---|---|---|---|
| `/clients/:id` | `PersonDetailsPage.vue` | Electron: rendered, inspected | [E12-client-details](screenshots/E12-client-details.png) | Default route surface; state coverage below. |
| `/properties/:id` | `PropertyDetailsPage.vue` | Electron: rendered, inspected | [E07-sale-details](screenshots/E07-sale-details.png) | Default route surface; state coverage below. |
| `/` | `DashboardPage.vue` | Electron: rendered, inspected | [E03-dashboard-1366x768](screenshots/E03-dashboard-1366x768.png) | Default route surface; state coverage below. |
| `/properties` | `PropertiesPage.vue` | Electron: rendered, inspected | [E04-sales-list](screenshots/E04-sales-list.png) | Default route surface; state coverage below. |
| `/properties/new` | `PropertyFormPage.vue` | Electron: rendered, inspected | [E05-sale-form](screenshots/E05-sale-form.png) | Default route surface; state coverage below. |
| `/properties/:id/edit` | `PropertyFormPage.vue` | Electron: rendered, inspected | [E47-sale-edit](screenshots/E47-sale-edit.png) | Default route surface; state coverage below. |
| `/rentals` | `RentalsPage.vue` | Electron: rendered, inspected | [E08-rental-list](screenshots/E08-rental-list.png) | Default route surface; state coverage below. |
| `/rentals/:id(\d+)` | `RentalDetailsPage.vue` | Electron: rendered, inspected | [E10-rental-details](screenshots/E10-rental-details.png) | Default route surface; state coverage below. |
| `/rentals/new` | `RentalFormPage.vue` | Electron: rendered, inspected | [E09-rental-form](screenshots/E09-rental-form.png) | Default route surface; state coverage below. |
| `/rentals/:id/edit` | `RentalFormPage.vue` | Electron: rendered, inspected | [E48-rental-edit](screenshots/E48-rental-edit.png) | Default route surface; state coverage below. |
| `/people` | `PeoplePage.vue` | Electron: rendered, inspected | [E11-clients](screenshots/E11-clients.png) | Default route surface; state coverage below. |
| `/rental-requests` | `RentalRequestsPage.vue` | Electron: rendered, inspected | [E16-rental-requests](screenshots/E16-rental-requests.png) | Default route surface; state coverage below. |
| `/rental-requests/:id(\d+)` | `RequestDetailsPage.vue` | Electron: rendered, inspected | [E17-rental-request-details](screenshots/E17-rental-request-details.png) | Default route surface; state coverage below. |
| `/purchase-requests` | `PurchaseRequestsPage.vue` | Electron: rendered, inspected | [E13-purchase-requests](screenshots/E13-purchase-requests.png) | Default route surface; state coverage below. |
| `/purchase-requests/:id(\d+)` | `RequestDetailsPage.vue` | Electron: rendered, inspected | [E15-purchase-request-details](screenshots/E15-purchase-request-details.png) | Default route surface; state coverage below. |
| `/deals` | `DealsPage.vue` | Electron: rendered, inspected | [E18-deals](screenshots/E18-deals.png) | Default route surface; state coverage below. |
| `/deals/:id(\d+)` | `DealPage.vue` | Electron: rendered, inspected | [E20-deal-details](screenshots/E20-deal-details.png) | Default route surface; state coverage below. |
| `/accounting/accounts` | `AccountsPage.vue` | Electron: rendered, inspected | [E34-accounts](screenshots/E34-accounts.png) | Default route surface; state coverage below. |
| `/accounting/accounts/:id(\d+)` | `AccountStatementPage.vue` | Electron: rendered, inspected | [E35-account-statement](screenshots/E35-account-statement.png) | Default route surface; state coverage below. |
| `/reports` | `ReportsPage.vue` | Electron: rendered, inspected | [E40-reports](screenshots/E40-reports.png) | Default route surface; state coverage below. |
| `/leases` | `LeasesPage.vue` | Electron: rendered, inspected | [E38-leases](screenshots/E38-leases.png) | Default route surface; state coverage below. |
| `/leases/:id(\d+)` | `LeasePage.vue` | Electron: rendered, inspected | [E39-lease-details](screenshots/E39-lease-details.png) | Default route surface; state coverage below. |
| `/accounting` | `AccountingPage.vue` | Electron: rendered, inspected | [E27-accounting-summary](screenshots/E27-accounting-summary.png) | Default route surface; state coverage below. |
| `/accounting/cash` | `CashPage.vue` | Electron: rendered, inspected | [E33-cash](screenshots/E33-cash.png) | Default route surface; state coverage below. |
| `/accounting/commissions/:id(\d+)` | `CommissionPage.vue` | Electron: rendered, inspected | [E30-commission-details](screenshots/E30-commission-details.png) | Default route surface; state coverage below. |
| `/accounting/vouchers/:id(\d+)` | `VoucherPage.vue` | Electron: rendered, inspected | [E32-voucher-details](screenshots/E32-voucher-details.png) | Default route surface; state coverage below. |
| `/accounting/journal` | `JournalPage.vue` | Electron: rendered, inspected | [E36-journal](screenshots/E36-journal.png) | Default route surface; state coverage below. |
| `/accounting/journal/:id(\d+)` | `JournalEntryPage.vue` | Electron: rendered, inspected | [E37-journal-entry](screenshots/E37-journal-entry.png) | Default route surface; state coverage below. |
| `/tasks` | `TasksPage.vue` | Electron: rendered, inspected | [E41-tasks](screenshots/E41-tasks.png) | Default route surface; state coverage below. |
| `/documents` | `DocumentsPage.vue` | Electron: rendered, inspected | [E21-documents](screenshots/E21-documents.png) | Default route surface; state coverage below. |
| `/contracts` | `ContractsPage.vue` | Electron: rendered, inspected | [E23-contracts-empty](screenshots/E23-contracts-empty.png) | Default route surface; state coverage below. |
| `/contracts/new` | `ContractWorkspacePage.vue` | Electron: rendered, inspected | [E24-contract-new](screenshots/E24-contract-new.png) | Default route surface; state coverage below. |
| `/contracts/:id(\d+)` | `ContractWorkspacePage.vue` | Source only for populated workspace | [E58-contract-missing](screenshots/E58-contract-missing.png) | No existing agreements; only missing-record response visually tested. No real contract draft, issue or export tested. |
| `/contracts/templates` | `ContractTemplatesPage.vue` | Electron: rendered, inspected | [E25-contract-templates](screenshots/E25-contract-templates.png) | Default route surface; state coverage below. |
| `/contracts/templates/:key` | `ContractTemplateStudioPage.vue` | Electron: rendered, inspected | [E26-template-studio](screenshots/E26-template-studio.png) | Sale template editor visually inspected; other template definitions inventoried, not individually edited. |
| `/users` | `UsersPage.vue` | Electron: rendered, inspected | [E44-users](screenshots/E44-users.png) | Default route surface; state coverage below. |
| `/roles` | `RolesPage.vue` | Electron: rendered, inspected | [E45-roles](screenshots/E45-roles.png) | Default route surface; state coverage below. |
| `/locations` | `LocationsPage.vue` | Electron: rendered, inspected | [E46-locations](screenshots/E46-locations.png) | Default route surface; state coverage below. |
| `/settings` | `SettingsPage.vue` | Electron: rendered, inspected | [E42-settings-appearance](screenshots/E42-settings-appearance.png) | Default route surface; state coverage below. |
| `/help` | `HelpPage.vue` | Electron: rendered, inspected | [E43-help](screenshots/E43-help.png) | Default route surface; state coverage below. |
| `/setup` | `FirstRunWizardPage.vue` | Electron: rendered, inspected | [S01-setup-welcome](screenshots/S01-setup-welcome.png) | Welcome and database-input steps only; no test/initialize/admin creation. Alias /first-run. |
| `/startup-error` | `StartupErrorPage.vue` | Source only for this route | [S03-startup-error](screenshots/S03-startup-error.png) | The native Electron failure splash was visually inspected; S03 is that splash, not this renderer route. |
| `/login` | `LoginPage.vue` | Electron: rendered, inspected | [E01-login](screenshots/E01-login.png) | Initial form and one demo sign-in; no invalid PIN or security-setting test. |

## Aliases and redirects

Aliases `/people/:id` → client record and `/first-run` → setup are not additional screens. Seven legacy redirects are `/customers`, `/favorites`, `/rental-favorites`, `/reports/operations`, `/reports/financial`, `/accounting/commissions` and `/accounting/vouchers`. A catch-all redirects to the dashboard. The layout parent is not counted as another page. Legacy `?open=<id>` on rental/request lists resolves to the record route.

## Significant tabs and views

| Area | Discovered states | Runtime coverage |
|---|---|---|
| Dashboard | Sale/rental/all matching; customer/match drawers; decisions/appointments; task/client/lease/deal/financial panels; quick actions | Default matching, drawers and global alert/add menus inspected; no actions saved |
| Offer lists | Search, primary/advanced filters, favorites/available, sorting, row summary/context menu, pagination | Default lists, code search, keyboard row/open/back, empty/loading/error/retry captured; not every filter permutation or favorite write tested |
| Offer detail | Details, location, follow-ups, notes, audit; image gallery | All five sale tabs inspected; rental default and lease links inspected. Media decode verified after temporary-profile asset copy |
| Client record | Activity, deals, leases, money, requests, owned offers, documents, notes, data | All nine tabs opened and captured: E12 plus C01–C08. No personal-document file opened |
| Deals | Nine-stage board, table, detail, creation/stage/commission forms | Both views, details and safe forms inspected; no stage or financial posting |
| Accounting | Transactions, commissions, employee shares; summary and flow; cash transfers/reconciliations | All three accounting views, cash summary and dialogs inspected; empty cash transfer list; no transactions |
| Leases | Lease list, overdue instalments, lease detail, renewal chain, money and instalment schedule | List, overdue view and existing renewed lease inspected; creation form opened only |
| Settings | Appearance, office, security, backups, system/external access | All five tabs read. Light/dark changed only in isolated profile; no security, backup, remote-access or email setting changed |
| Help | Instructions, FAQs, shortcuts, about/support | Default help and F1 inspected; no support communication |
| Contracts | Four types; five workspace steps; review/issued/revision states | Chooser/templates/studio/missing-record only. Real workspace steps and persistence/export remain source-only |
| Setup | Welcome, DB configuration, first admin, initialization/result; recovery branches | Welcome and DB form visually inspected. Later setup/recovery actions not run |

## All 13 report types

Each key below was opened in Electron. They are query-driven views of one route, not 13 extra route definitions. Most default to this month; empty periods are valid observed states.

| Key | Evidence | Notes |
|---|---|---|
| `deals` | [E40](screenshots/E40-reports.png) | Current pipeline and empty period outcomes |
| `sale-listings` | [R01](screenshots/R01-sale-listings.png) | Default data/empty state inspected; no export executed. |
| `rental-listings` | [R02](screenshots/R02-rental-listings.png) | Default data/empty state inspected; no export executed. |
| `leases` | [R03](screenshots/R03-leases.png) | Default data/empty state inspected; no export executed. |
| `customers` | [R04](screenshots/R04-customers.png) | Default data/empty state inspected; no export executed. |
| `income-statement` | [R05](screenshots/R05-income-statement.png) | Default data/empty state inspected; no export executed. |
| `balance-sheet` | [R06](screenshots/R06-balance-sheet.png) | Default data/empty state inspected; no export executed. |
| `cash-flow` | [R07](screenshots/R07-cash-flow.png) | Default data/empty state inspected; no export executed. |
| `commissions` | [R08](screenshots/R08-commissions.png) | Default data/empty state inspected; no export executed. |
| `receivables` | [R09](screenshots/R09-receivables.png) | Default data/empty state inspected; no export executed. |
| `payables` | [R10](screenshots/R10-payables.png) | Default data/empty state inspected; no export executed. |
| `trial-balance` | [R11](screenshots/R11-trial-balance.png) | Default data/empty state inspected; no export executed. |
| `ledger` | [R12](screenshots/R12-ledger.png) | Unselected prompt; selected-account state in R13. |

Selected-account ledger: [R13](screenshots/R13-ledger-selected.png). All report export buttons were inspected as controls; PDF/Excel/printing outcomes were not tested.

## Dialogs, drawers and significant substeps discovered in source

This section inventories all component files named Dialog/Drawer/Editor/Step. Some specialized components are nested rather than standalone screens. “Source-discovered” does not claim a complete visual or behavioral test. Dangerous or unavailable actions were not triggered.

| Component path under `apps/renderer/src/components` | Coverage | Evidence / reason |
|---|---|---|
| `tasks/TaskDialog.vue` | Electron, safe initial state only | [F02-task-form](screenshots/F02-task-form.png) |
| `shared/PropertyLocationEditor.vue` | Source-discovered; not separately exercised | Nested/specialist editor or location picker; see parent route coverage, no changes made. |
| `shared/RecordFollowupDialog.vue` | Follow-up tab inspected; wrapper not separately opened | [P02-property-tab](screenshots/P02-property-tab.png) |
| `setup/FirstAdminResultDialog.vue` | Source-discovered; not separately exercised | Would complete setup/create credentials. |
| `requests/MatchingResultsDialog.vue` | Source-discovered; not separately exercised | New-request save not performed; existing request-page matches inspected. |
| `requests/RequestFormDialog.vue` | Electron, safe initial state only | [E14-purchase-request-form](screenshots/E14-purchase-request-form.png) |
| `properties/ExcelImportDialog.vue` | Electron, safe initial state only | [F12-import-dialog](screenshots/F12-import-dialog.png) |
| `people/PersonEditor.vue` | Electron, safe initial state only | [F01-client-form](screenshots/F01-client-form.png) |
| `leases/LeaseActivateDialog.vue` | Source-discovered; not separately exercised | No eligible agreement; contract issue/revision boundary. |
| `leases/LeaseDialog.vue` | Electron, safe initial state only | [F03-lease-form](screenshots/F03-lease-form.png) |
| `leases/LeaseRenewDialog.vue` | Source-discovered; not separately exercised | Destructive/lifecycle action or no eligible active fixture. |
| `leases/LeaseTerminateDialog.vue` | Source-discovered; not separately exercised | Destructive/lifecycle action or no eligible active fixture. |
| `documents/DocumentDialog.vue` | Electron, safe initial state only | [E22-document-form](screenshots/E22-document-form.png) |
| `deals/DealDialog.vue` | Electron, safe initial state only | [W01-context-deal](screenshots/W01-context-deal.png) |
| `deals/DealStageDialog.vue` | Electron, safe initial state only | [F15-stage-form](screenshots/F15-stage-form.png) |
| `dashboard/CustomerDrawer.vue` | Electron, safe initial state only | [F11-customer-drawer](screenshots/F11-customer-drawer.png) |
| `dashboard/MatchDetailsDrawer.vue` | Electron, safe initial state only | [W02-match-drawer](screenshots/W02-match-drawer.png) |
| `contracts/AgreementListingStep.vue` | Source-discovered; not separately exercised | No eligible agreement; contract issue/revision boundary. |
| `contracts/AgreementPartiesStep.vue` | Source-discovered; not separately exercised | No eligible agreement; contract issue/revision boundary. |
| `contracts/AgreementReviewStep.vue` | Source-discovered; not separately exercised | No eligible agreement; contract issue/revision boundary. |
| `contracts/AgreementRevisionsDialog.vue` | Source-discovered; not separately exercised | No eligible agreement; contract issue/revision boundary. |
| `contracts/AgreementTermsStep.vue` | Source-discovered; not separately exercised | No eligible agreement; contract issue/revision boundary. |
| `contracts/InlineEditor.vue` | Source-discovered; not separately exercised | Nested/specialist editor or location picker; see parent route coverage, no changes made. |
| `contracts/ReasonDialog.vue` | Source-discovered; not separately exercised | No eligible agreement; contract issue/revision boundary. |
| `contracts/TemplateHistoryDialog.vue` | Source-discovered; not separately exercised | Nested/specialist editor or location picker; see parent route coverage, no changes made. |
| `auth/ChangePinDialog.vue` | Source-discovered; not separately exercised | Security/permission changes excluded; no authentication dialog automated. |
| `app/AppConfirmDialog.vue` | Source-discovered; not separately exercised | Destructive/lifecycle action or no eligible active fixture. |
| `admin/LocationDialog.vue` | Electron, safe initial state only | [F14-location-form](screenshots/F14-location-form.png) |
| `admin/PermissionDialog.vue` | Source-discovered; not separately exercised | Security/permission changes excluded; no authentication dialog automated. |
| `admin/RoleDialog.vue` | Electron, safe initial state only | [F05-role-form](screenshots/F05-role-form.png) |
| `admin/UserDialog.vue` | Electron, safe initial state only | [F04-user-form](screenshots/F04-user-form.png) |
| `accounting/AccountDialog.vue` | Electron, safe initial state only | [F13-account-form](screenshots/F13-account-form.png) |
| `accounting/CommissionDialog.vue` | Electron, safe initial state only | [F16-commission-form](screenshots/F16-commission-form.png) |
| `accounting/ExpenseCategoriesDialog.vue` | Source-discovered; not separately exercised | Specialist dialog discovered; catalog setup not exercised. |
| `accounting/JournalEntryDialog.vue` | Electron, safe initial state only | [F09-journal-form](screenshots/F09-journal-form.png) |
| `accounting/PeriodsDialog.vue` | Electron, safe initial state only | [F10-periods](screenshots/F10-periods.png) |
| `accounting/ReconciliationDialog.vue` | Electron, safe initial state only | [F07-reconciliation-form](screenshots/F07-reconciliation-form.png) |
| `accounting/TransferDialog.vue` | Electron, safe initial state only | [F06-transfer-form](screenshots/F06-transfer-form.png) |
| `accounting/VoucherDialog.vue` | Electron, safe initial state only | [E31-commission-collection](screenshots/E31-commission-collection.png) |

Additional shared surfaces: AppPage/topbar/sidebar, global Ctrl+K search, global Add, notifications, snackbars, empty/error/loading states, unsaved-form confirmation infrastructure, export menus and native file dialogs. Global search/Add/notifications, validation and sales recovery were inspected. Native file pick/save, destructive confirmation, actual uploads, print spooler, restore, email and external-link communications were not exercised.

## Evidence states and window coverage

- T01: controlled delayed GET; T02: audit-injected 503; T03: retry recovered page data (transient snackbar may remain); T04: no search results. These are actual rendered states under controlled faults.
- E23: real empty contracts; E58: real missing contract; S01/S02: actual isolated first-run profile; S03: actual isolated native database-failure splash.
- Native outer sizes 1366×768, 1440×900, 1920×1080 were inspected using dashboard/form/studio samples; client areas were 1350×729, 1424×861, 1904×1041. Deal table/board behavior is identified per screenshot; the persistent view selection must not be mistaken for a board screenshot.
- Sale form at 125% Electron zoom; dashboard/form/settings in dark theme. No complete accessibility certification or packaged-app test.

The [screenshot index](screenshots/README.md) enumerates saved files. Unverified states must remain unverified when this inventory is reused.
