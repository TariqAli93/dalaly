# Dalaly desktop UI/UX audit

Date: **1 November 2026, Asia/Baghdad**. Repository: `D:\dev_projects\dalaly`.

**Read-only runtime audit with partial end-to-end coverage. No proposed changes were implemented.** The actual Electron application ran successfully. Contract creation after choosing a type, autosave, issuing, revision management and contract export remain unverified: the existing demo database has no agreements, and choosing a type creates a persisted draft. This report must not be represented as a completed contract/export acceptance test.

## 1. Executive Summary

**Provisional expert usability score: 7.0/10.** Dalaly already has a coherent Arabic desktop shell, compact tables, useful keyboard shortcuts, contextual deal creation, reusable client selectors, and a particularly effective prefilled commission receipt. The main opportunity is to make these capabilities easier to understand and prioritize, rather than rebuild the application or merge its business domains.

The five largest observed problems are:

1. An exact-looking listing-code search can return an unrelated record through phone-number matching; pressing Enter opens the first result.
2. The dashboard's main priority mechanism omits overdue client tasks and overdue lease instalments even though other dashboard panels display them.
3. Accounting combines period-scoped summaries with independently scoped transaction lists without a prominent boundary between the two.
4. A new “مهمة لزبون” without a date defaults to “أُنجزت”. The explanation is present, but the default conflicts with the ordinary interpretation of a new task.
5. Dashboard guidance says the application does not record commissions, leases or customer contact history, despite those features being available elsewhere in the same runtime.

Recommended strategy: correct misleading behavior and copy first; retain the existing accounting/report consolidation; progressively disclose optional form detail; build one actionable attention queue; then polish density and readability. Preserve separate sales and rental records, permissions, accounting distinctions, issued-document history and all specialized features.

The score is an expert assessment, not a study with office users or a claim of improved business outcomes.

| Dimension | Weight | Score | Basis |
|---|---:|---:|---|
| Wayfinding | 20% | 6.5 | Clear groups and breadcrumbs; 14 primary destinations and lower navigation below the initial viewport |
| Workflow continuity | 25% | 7.5 | Context transfers into deals/receipts; contract completion unverified |
| Information hierarchy | 20% | 6.0 | Matching is prominent; attention signals distributed across many panels |
| Forms | 15% | 6.5 | Useful defaults and validation; optional fields dominate common forms |
| Arabic, RTL and readability | 15% | 8.0 | RTL, isolated codes/numbers and Arabic labels largely work; small labels and contradictory copy remain |
| Feedback and recovery | 5% | 8.0 | Invalid-field focus, retry and clear-filter recovery work in tested states |

Weighted result: 6.95, rounded to 7.0. Untested export and permission scenarios do not receive a pass by inference.

## 2. Runtime Inspection Details

### Environment and launch

- Verified root/package scripts and startup source before launching. Node `v22.22.2`, pnpm `10.28.0`; installed Electron `39.8.10`; Playwright already present. No dependencies installed.
- The repository's normal development command is `pnpm dev`: Vite starts on `127.0.0.1:5173`, then Electron starts its own Fastify child process.
- PostgreSQL service was already running. Read-only SQL inspected **only the existing `dalaly_demo` business database** and database metadata. No migration, seed, demo-reset or restore command was run.
- Before launching, all **16** migration journal entries were matched against applied timestamps and SHA-256 hashes. No migrations were pending. Normal application startup still invokes its migration checker and idempotent system bootstrap; this was not disabled or replaced. The final evidence verifies that migration history and sampled business tables stayed unchanged.
- Used an isolated Electron profile under `%TEMP%\dalaly-ux-audit-Wip8Js`, configured to the existing demo database. Its synthetic image/document fixtures were copied into that temporary profile so the app's actual media paths could resolve. Early missing-image states caused by profile isolation were excluded from product findings; a later check confirmed the property image and all three thumbnails decoded successfully.

Actual initial terminal commands, from the repository:

```powershell
pnpm --filter @dalaly/renderer dev
$env:VITE_DEV_SERVER_URL='http://127.0.0.1:5173'
$env:API_PORT='34567'
$env:API_HOST='127.0.0.1'
$env:ENV_FILE='D:\dev_projects\dalaly\.env.web-demo'
$env:CORS_ORIGINS='http://127.0.0.1:5173,http://localhost:5173'
pnpm --filter @dalaly/desktop exec electron ./src/main.js --user-data-dir=<temporary-audit-profile> --remote-debugging-port=9222
```

The first attempt omitted the `CORS_ORIGINS` override: the demo environment allowed its web port, not Vite's desktop development port. Login displayed an Arabic connection error. Correcting only the child-process environment resolved this. This is an audit-launch configuration issue, not evidence of a packaged-app login defect.

For exact window control, inspection subsequently relaunched the same `apps/desktop/src/main.js` through the installed Playwright `_electron.launch`, using the same temporary profile and launch variables, without the remote-debugging switch. No application code was substituted. The actual runtime reported `Electron/39.8.10`, `isPackaged: false`, and the real `window.dalalyConfig` preload bridge.

### Tools and safety boundary

The [computer-use skill](C:/Users/dev/.codex/plugins/cache/openai-bundled/computer-use/26.1027.30824/skills/computer-use/SKILL.md) was read and Windows windows were enumerated. The installed Electron-compatible Playwright API provided deterministic interactions and screenshots of actual Electron web contents. Native `BrowserWindow.setSize` supplied window dimensions. DOM/computed-style measurements supplemented visual inspection. PowerShell/System.Drawing assembled temporary contact sheets from saved screenshots; they are inspection aids, not mockups.

**Browser renderer fallback: not used.** A Vite URL loaded inside Electron is still an Electron inspection; no standalone Chrome inspection is counted.

After the one demo login, an automation guard rejected non-GET/HEAD/OPTIONS API requests. Two automatic thumbnail PUT requests triggered while viewing another listing were blocked. No business form was submitted successfully. Authentication creates normal session/login metadata; the report does not claim that the entire database received zero writes.

Names, phones, identity-like values and financial amounts were masked in screenshot capture. Only existing synthetic demo fixtures were used. No real customer records or credentials are included in the reports. Temporary configuration files and contact sheets are outside the repository.

### Coverage and checks

| Measure | Result |
|---|---|
| Discovered component-bearing route definitions | **43**, excluding the layout route, redirects and aliases |
| Functional route surfaces visually inspected inside Electron | **41** |
| Standalone browser renderer surfaces | **0** |
| Functional route surfaces reviewed through source only | **2**: populated contract workspace and renderer `/startup-error` |
| Additional actual error surfaces | Missing-contract response and native startup-failure splash inspected; neither substitutes for a populated contract |
| Reports | All **13** report types opened, including empty and populated variants; selected-account ledger also inspected |
| Workflows A–F | **6 examined**; **5 exercised through safe pre-submit steps**, D limited to chooser/template/deal-handoff inspection |
| Successfully saved business records / completed end-to-end saves | **0 / 0**, intentionally |
| Native outer window sizes | 1366×768, 1440×900, 1920×1080 |
| Corresponding client areas at 100% | 1350×729, 1424×861, 1904×1041 |
| Additional scaling/theme | Sale form at 125% Electron zoom; dashboard/form/settings sampled in dark mode |
| Validation | Empty sale form showed four required-field errors and focused `area_value` |
| Keyboard | Ctrl+F, ArrowDown/Enter, Alt+Left with retained query, Ctrl+K/Escape, and F1 exercised |
| Loading/error/empty | Delayed GET, injected GET 503, retry, zero-result search, empty contracts and missing-contract response |

Controlled failures are labelled `T01`–`T04`: they demonstrate actual UI responses to audit-injected read failures, not naturally occurring backend outages. Retry cleared the page error and restored the 11-row list; a transient snackbar remained briefly. A separate unconfigured profile showed setup; a separate unreachable-database profile showed the native failure splash with retry/logs/exit. Setup was not completed.

One development lazy-import error coincided with two Vite dependency HTTP 504s. Reloading successfully opened the same contract chooser. This was retained as a development-runtime limitation, not classified as a verified production P0.

See [screen coverage](SCREEN-INVENTORY.md), [workflow traces](WORKFLOW-ANALYSIS.md), and [sanitized runtime evidence](RUNTIME-EVIDENCE.json). Screenshots are real states, not proposed before/after designs. No source tests/build were needed for this documentation-only change; final validation checks links, image files, data fingerprints and repository scope.

## 3. Screen Inventory

The complete route, alias, report, tab and significant dialog inventory is in [SCREEN-INVENTORY.md](SCREEN-INVENTORY.md). Its denominator is route definitions, not screenshots: edit/create routes may share a component, while reports and tabs contribute additional states without inflating the route count.

Every route is assigned Electron, source-only, or error-only coverage. Contract steps, issue/export/revision actions, setup completion and destructive dialogs are explicitly distinguished from the safe states actually opened.

## 4. Screen-by-Screen Findings

Severity: P0 blocks essential work or risks loss; P1 substantially impairs daily work; P2 adds moderate confusion/effort; P3 is polish. **No P0 was verified.** There are **21 findings: 5 P1, 15 P2, 1 P3**. Effort estimates are implementation estimates for one engineer familiar with the code: S ≤1 day, M 2–4 days, L 5–10 days; they exclude user research and are not commitments.

### UX-01 — P1: Code search can promote an unrelated listing

**Observed:** On sales offers, Ctrl+F → `H-0001` → wait for results returns two rows: `F-0001` first and `H-0001` second. ArrowDown/Enter opened the first row (`/properties/8`). The extra record matches the numeric part through the owner's phone. This is not a keyboard-navigation failure.

**Evidence/method:** Electron interaction, [K01](screenshots/K01-filtered-sales.png), backed by `properties.repository.ts` `buildSearchClause`: non-digit characters are stripped for an alternative phone match. **Impact:** looking up a known code can open the wrong property, forcing rechecking and recovery.

**Proposal:** recognize complete record-code patterns, prioritize an exact code match, and visibly explain broader matches; retain general phone/text search. Any change to search semantics needs a separately scoped implementation decision and regression checks. **Expected benefit:** reliable one-result known-code lookup; time saving not measured. **Effort:** M. **Files:** `server/src/modules/properties/properties.repository.ts`, `server/src/shared/utils/search.ts`, `PropertiesPage.vue`, `GlobalSearch.vue`.

### UX-02 — P1: The headline priority excludes important overdue work

**Observed:** At 1366×768, the priority strip leads with two appointments today. Seven overdue tasks and eight overdue instalments appear in lower business panels; the customer-contact panel starts around y=958, below the 729px client viewport. The priority algorithm accepts matching/overview data, not the business task/lease summaries.

**Evidence/method:** Electron [dashboard top](screenshots/E03-dashboard-1366x768.png), [lower panels](screenshots/E55-dashboard-lower.png), source `utils/dashboardPriority.ts`. **Impact:** staff may act on the next appointment while missing older obligations or client follow-ups.

**Proposal:** a unified attention queue with overdue tasks, due appointments, overdue instalments, expiring leases and collectible commissions, preserving separate categories, currencies and access checks. Use explicit due dates and actions, not an invented urgency score. **Expected benefit:** one place to decide the next action; no measured 50% task-time claim. **Effort:** L. **Files:** `DashboardPage.vue`, `BusinessPanels.vue`, `PriorityStrip.vue`, `utils/dashboardPriority.ts`.

### UX-03 — P1: Accounting period and list scopes are easy to confuse

**Observed:** “هذا الشهر” is selected, while the transaction list includes August, September and October entries; the commissions list includes older commission dates. Summary cards have scope notes, but the table's independent date filters are behind “فلاتر إضافية”. This is a scope-presentation problem, not proof of wrong accounting totals.

**Evidence/method:** Electron [summary](screenshots/E27-accounting-summary.png), [commissions](screenshots/E28-commissions.png); source `AccountingPage.vue` passes the selected period to the summary/flow, but renders `VoucherList` independently. **Impact:** a non-accountant can reconcile unrelated periods or interpret “zero this month” as inconsistent with visible rows.

**Proposal:** title each scope explicitly (“ملخص هذا الشهر”, “كل الحركات”), show active dates beside the table and offer an explicit “استخدام فترة الملخص” action. Do not silently alter query/accounting rules. **Expected benefit:** fewer reconciliation misunderstandings. **Effort:** M. **Files:** `AccountingPage.vue`, `components/accounting/VoucherList.vue`, `CommissionList.vue`.

### UX-04 — P1: A new task defaults to completed when undated

**Observed:** “مهمة لزبون” opens type “مهمة”, optional appointment, and state “أُنجزت”. Source computes `scheduled_at ? 'open' : 'done'` when status is not specified. The explanatory hint is present.

**Evidence/method:** Electron [task form](screenshots/F02-task-form.png), source `components/tasks/TaskDialog.vue:93`. No task was saved. **Impact:** an intended future action may be recorded as already done if the operator skips an optional date.

**Proposal:** distinguish “تسجيل اتصال حدث” from “مهمة يجب إنجازها” before status defaults are applied. Review the task/activity rule with the product owner; preserve historical meaning and explicit user-selected status. **Expected benefit:** fewer accidentally completed tasks; occurrence rate unmeasured. **Effort:** M, with business-rule review. **Files:** `TaskDialog.vue`, `TasksPage.vue`, task payload validation.

### UX-05 — P1: In-app guidance contradicts implemented features

**Observed:** Dashboard footer says commissions, leases and their payments are not recorded. Match details says last client contact is not recorded. Client records and the accounting/lease screens demonstrably provide these capabilities. Customer-drawer source contains similar obsolete guidance.

**Evidence/method:** Electron [footer](screenshots/E55-dashboard-lower.png), [match drawer](screenshots/W02-match-drawer.png), [client activity](screenshots/E12-client-details.png); source `PerformanceSummary.vue:156`, `MatchDetailsDrawer.vue:110`, `CustomerDrawer.vue:104`. **Impact:** users can stop searching for a feature that already exists or mistrust the data.

**Proposal:** replace obsolete statements with narrowly accurate scope explanations; link to the existing client/lease/accounting record when useful. **Expected benefit:** clearer feature discovery with no behavior change. **Effort:** S. **Files:** the three dashboard components above and `HelpPage.vue` for cross-checking.

### UX-06 — P2: The sale form presents too many optional decisions at once

**Observed:** The default form contains **33 labelled field controls**, plus switches/amenities, across about **1630px** document height at a 729px client height. Nine fields are starred; five already have defaults, leaving four blank required values in the default pricing branch. Optional plot, address, dimensions and map fields are initially expanded. Validation correctly focuses the first invalid field; the fixed save bar works.

**Evidence/method:** Electron [form](screenshots/E05-sale-form.png), [validation](screenshots/E06-sale-validation.png), DOM field count and source `PropertyForm.vue`. **Impact:** the operator must scan many irrelevant controls before recognizing the minimal task.

**Proposal:** show about 12 common controls initially; disclose parcel/legal detail, building specifications, map and notes in named sections. Retain all nine required fields and conditional pricing validation. **Expected benefit:** estimated **33→12 (64%) fewer initially exposed field controls**, not 64% less typing or task time. **Effort:** M. **Files:** `PropertyForm.vue`, `PropertyFormPage.vue`, `FormSection.vue`, `FormActionsBar.vue`.

### UX-07 — P2: Rental form structure differs from sales and remains long

**Observed:** Rental creation has **23 labelled controls**, eight starred fields, four defaulted required values, and about **1368px** height. Sales begins with location/parcel; rental begins with offer type. Core rental defaults and owner selection already work.

**Evidence/method:** Electron [rental form](screenshots/E09-rental-form.png), source `RentalForm.vue`. **Impact:** staff moving between offer types must relearn field order and scan optional details.

**Proposal:** align the sequence of shared concepts (offer, location, price/area, owner), with rental period and legal/parcel detail remaining domain-specific. Target 11 common initial controls; retain separate APIs, records, images and validation. **Expected benefit:** projected **23→11 (52%)** reduction in initially exposed controls; required blank values remain four. **Effort:** M. **Files:** `RentalForm.vue`, `PropertyForm.vue`, their page wrappers.

### UX-08 — P2: Request creation exposes advanced preferences immediately

**Observed:** Purchase-request dialog has **16 labelled controls**, including two starred fields; type is prefilled and client is the one blank required field. Budget/location/specifications, three room/floor limits, amenities and two note fields are all part of a long scrollable dialog. “حفظ ومطابقة” usefully states the intended next step.

**Evidence/method:** Electron [request dialog](screenshots/E14-purchase-request-form.png); source `RequestFormDialog.vue`. **Impact:** a simple client request looks more demanding than its actual minimum requirements.

**Proposal:** initial group: client, property type, budget range and location; disclose space, amenities and notes as preferences, retaining the distinction between hard constraints and ranking preferences. Rental adds its required period. **Expected benefit:** projected **16→7 (56%)** fewer initial controls; no field removed. **Effort:** M. **Files:** `RequestFormDialog.vue`, `utils/requestForm.ts`.

### UX-09 — P2: Quick client creation still displays a full dossier

**Observed:** The dialog explicitly says only the name is required, but also shows phone/contact, identity, residence, office relationship and notes. The same editor is reused within other workflows. Source includes a status field shown conditionally for editing, so total controls differ between creation and edit.

**Evidence/method:** Electron [client form](screenshots/F01-client-form.png); source `components/people/PersonEditor.vue`. **Impact:** entering a client while handling a request can become a context switch into administrative data entry.

**Proposal:** compact name/phone/type first; expose identity, address and office metadata on demand or when contract requirements demand them. Keep the existing person picker and later editing. **Expected benefit:** less initial scanning; no measured entry-time percentage. **Effort:** M. **Files:** `PersonEditor.vue`, `PersonPicker.vue`, `RequestFormDialog.vue`.

### UX-10 — P2: Lower navigation needs scrolling on a normal laptop

**Observed:** The 232px expanded sidebar has 14 primary destinations in six groups, plus contextual child links and a fixed Help item. At 1366×768, lower accounting/settings destinations fall below the initially visible list; entering accounting adds three child links. The active state and breadcrumbs are clear.

**Evidence/method:** Electron [sales list](screenshots/E04-sales-list.png), [accounting](screenshots/E27-accounting-summary.png); source `constants/domain.ts`, `AppSidebar.vue`. **Impact:** users must remember that more destinations exist below the fold.

**Proposal:** prototype the eight destination groups in section 6; keep current direct child access and search. A group should open a useful workspace with last-used view, not an empty menu. Validate that frequent tasks require no additional click before adopting it. **Expected benefit:** projected **14→8 (43%)** fewer primary choices; total navigation effort not established. **Effort:** L. **Files:** `AppSidebar.vue`, `constants/domain.ts`, router.

### UX-11 — P2: A nine-stage board hides much of the pipeline horizontally

**Observed:** At 1366×768 the board scroll pane is **1092px wide with 2280px of content**. Later stages are out of view. The alternative table is immediately available and shows both open deals without horizontal pipeline scanning; that preference persists.

**Evidence/method:** Electron [board](screenshots/E18-deals.png), [table](screenshots/E54-deals-table.png), DOM scroll measurement. **Impact:** checking negotiations or contract-stage deals requires lateral searching when the board is selected.

**Proposal:** keep board and table; offer stage groups/quick jumps with counts, preserve individual stages, and explain the table as the compact alternative. Do not introduce drag-to-change-stage without preserving confirmation/history semantics. **Expected benefit:** fewer horizontal scans; time saving unmeasured. **Effort:** M. **Files:** `DealsPage.vue`, deal board/table components, `constants/deals.ts`.

### UX-12 — P2: Contract template editing is an expert workspace

**Observed:** The studio has an outline, document canvas, properties pane, toolbar and **72 rendered buttons** including offscreen outline actions. Its default fit at the laptop size shows the document around 60%; 1920×1080 provides a substantially more legible canvas. This count is not 72 simultaneously visible commands.

**Evidence/method:** Electron [laptop studio](screenshots/E26-template-studio.png), [wide studio](screenshots/Z1920-template-studio.png). **Impact:** a novice trying to adjust wording must distinguish document structure from page formatting and template-wide changes.

**Proposal:** retain this full studio for template specialists. Present ordinary contract users with selected clause/content editing first, contextual properties for the selected block, and a clear template-versus-contract scope label. Preview/issue remains a separate action. **Expected benefit:** less accidental scope confusion; real contract-content workflow remains unverified. **Effort:** L. **Files:** `ContractTemplateStudioPage.vue`, `ContractStudio.vue`, contract workspace components.

### UX-13 — P2: Contract exploration immediately crosses a persistence boundary

**Observed UI / source-confirmed behavior:** The chooser says selecting a type creates a draft and later steps autosave. `ContractWorkspacePage.vue:486` calls `createAgreement(key)` before routing to the parties step. The click was deliberately not performed. Abandoned-draft frequency and actual autosave recovery were **not** measured.

**Evidence/method:** Electron [chooser](screenshots/E24-contract-new.png) plus source-only inspection of create/autosave/leave handling. **Impact hypothesis:** users comparing the four types may create drafts unintentionally; this is a risk, not an observed data-loss incident.

**Proposal:** show the type's steps/required information without persistence and provide an explicit “بدء مسودة” action, or explain draft creation on the card itself. Preserve autosave and revision safeguards. Verify existing draft recovery before changing lifecycle rules. **Expected benefit:** clearer commitment; reduction in abandoned drafts unquantified. **Effort:** M. **Files:** `ContractWorkspacePage.vue`, `services/agreements.service.ts`, `constants/agreements.ts`.

### UX-14 — P2: Every report begins with the same broad KPI strip

**Observed:** All 13 report types retain five sales/rental/commission/completed-deal overview cards, including selected-account ledger and balance sheet. At the first day of this month several cards show zero while the selected report has useful balances or current outstanding work.

**Evidence/method:** Electron [ledger](screenshots/R13-ledger-selected.png), [receivables](screenshots/R09-receivables.png), [report hub](screenshots/E40-reports.png). **Impact:** the report's own question competes with metrics from other questions/scopes.

**Proposal:** move broad business KPIs to a report overview; each report opens with its title, period/as-of date, filters and its own relevant summary. Keep all 13 reports and existing export behavior. **Expected benefit:** five fewer unrelated cards when reading a specific financial report. **Effort:** M. **Files:** `ReportsPage.vue`, `MoneyStrip.vue`, `constants/reports.ts`.

### UX-15 — P2: Empty period reports give little help choosing a useful period

**Observed:** Income and commission reports show “لا بيانات في هذه المدة” on 1 November. Prior-period presets are available above, but the empty area provides no nearby action or explanation of whether other periods have data. The ledger's “اختر حساباً” state is a better specific prompt.

**Evidence/method:** Electron [income empty](screenshots/R05-income-statement.png), [commission empty](screenshots/R08-commissions.png), [ledger prompt](screenshots/R12-ledger.png). **Impact:** users may treat a valid empty period as missing data or a fault.

**Proposal:** in the empty state offer “الشهر الماضي” or “تغيير الفترة”, retain the selected scope in the title, and distinguish zero results from failed loading. Do not imply data exists in another period without checking. **Expected benefit:** one clear recovery choice; completion benefit unmeasured. **Effort:** S. **Files:** `ReportsPage.vue`, `ReportView.vue`, `utils/reportDocument.ts`.

### UX-16 — P2: The full photo gallery occupies every property-detail tab

**Observed:** The image panel remains alongside detail, location, follow-up, notes and audit tabs. It consumes about a third of the available content width on the laptop even while the operator reads a short history or writes a follow-up. Media works after the audit-profile paths are resolved.

**Evidence/method:** Electron [follow-ups](screenshots/P02-property-tab.png), [history](screenshots/P04-property-tab.png), [rental detail](screenshots/E10-rental-details.png). **Impact:** less width remains for operational context; important details are spread below the fold.

**Proposal:** keep a compact image strip/expand control on operational tabs and the full gallery on details/photos. Preserve paste, upload, order, primary-image and export actions. **Expected benefit:** wider task area without losing photo access. **Effort:** M. **Files:** `PropertyDetailsPage.vue`, `RentalDetailsPage.vue`, their image/gallery components.

### UX-17 — P2: Client context is split across nine tabs

**Observed:** Activity, deals, leases, money, requests, owned listings, documents, notes and data are separate tabs. The activity screen displays no activity for the sampled client while the deals/money tabs contain related business records. Contact details remain consistently available in the header.

**Evidence/method:** Electron [activity](screenshots/E12-client-details.png), [money](screenshots/C03-client-tab.png), [requests](screenshots/C04-client-tab.png); all nine tabs opened. **Impact:** an operator must inspect multiple tabs to answer “what should I discuss with this client?”

**Proposal:** enhance the activity overview with linked next task, active request/deal, outstanding balance and document alerts as permission allows. Keep specialist tabs; do not copy complete lists into the overview or hide relevant records merely to reduce tab count. **Expected benefit:** fewer context-switching visits for a follow-up call; baseline timing not established. **Effort:** L. **Files:** `PersonDetailsPage.vue`, `PersonActivity.vue`, `PersonMoney.vue`.

### UX-18 — P2: Disabled email backup still exposes its full configuration

**Observed:** The backup tab shows local backup/restore, history, schedule toggle, recipient/time, SMTP and encryption setup even when scheduled email backup is off. Important warnings and the distinction between local complete backups and emailed database-only backups are present and should remain.

**Evidence/method:** Electron [backup settings](screenshots/E51-settings-backups.png); source `ScheduledBackupSettings.vue`. **Impact:** infrequent configuration occupies a long screen and distracts from “create a local backup”.

**Proposal:** keep local backup status/actions first; disclose the disabled scheduling form behind an explanatory section. Retain the external-data warning before enabling or sending. No security/privacy setting was changed during inspection. **Expected benefit:** less setup scanning for everyday backup use. **Effort:** S–M. **Files:** `SettingsPage.vue`, `BackupSettings.vue`, `ScheduledBackupSettings.vue`.

### UX-19 — P2: Small labels and faint dependency hints deserve readability tuning

**Observed:** Sample active field labels are 13px, floating labels 9.75px and helper text 12px. Calculated active-label contrast was about **5.89:1**, form hint **5.91:1** and sidebar group labels **7.75:1**. Disabled location guidance inherits opacity 0.38, about **2.24:1** on white. The sale save bar remained within the client viewport at 125% Electron zoom.

**Evidence/method:** Electron [sale form](screenshots/E05-sale-form.png), [125%](screenshots/Z125-sale-form.png), computed styles/alpha-composited color calculation in `RUNTIME-EVIDENCE.json`. **Impact:** small Arabic floating labels and faint prerequisite explanations cost extra reading effort. Disabled controls have a contrast exception, so this is **not a blanket WCAG failure claim**.

**Proposal:** raise the minimum readable floating-label size; place prerequisite instructions outside disabled field opacity; preserve compact control height and test Arabic text at higher user font settings. Sampled active colors already meet the normal-text 4.5:1 benchmark. **Expected benefit:** easier label recognition; no measured productivity percentage. **Effort:** M. **Files:** `main.ts` field defaults, theme/style tokens, location selector and `FormSection.vue`.

### UX-20 — P3: Permission catalog mixes human labels with technical keys

**Observed:** Roles page presents the roles table beside a 79-permission catalog, where Arabic names and technical identifiers are displayed together. Module filtering and grouped role assignment already exist.

**Evidence/method:** Electron [roles](screenshots/E45-roles.png), [role dialog](screenshots/F05-role-form.png); no checkboxes, role assignments or security settings were changed. **Impact:** occasional administrators must scan developer identifiers in addition to the permissions' meanings.

**Proposal:** make human descriptions primary and technical identifiers available through detail/copy controls. Preserve all permission keys and grouping; keep specialist management separate from ordinary office tasks. **Expected benefit:** cleaner admin scanning. **Effort:** S. **Files:** `RolesPage.vue`, `RoleDialog.vue`, permission-label mappings.

### UX-21 — P2: Import exit is an unnamed icon and Escape does not dismiss it

**Observed:** The initial Excel import dialog is persistent. Escape leaves it open. It has a header close icon with no accessible name, no labelled Cancel action at this stage, and a file chooser. Clicking the unnamed header button successfully closes the dialog. This is an accessibility/discoverability issue, **not an inescapable modal or data-loss incident**.

**Evidence/method:** Electron [import entry](screenshots/F12-import-dialog.png), DOM button inspection and a successful close-icon interaction; source `ExcelImportDialog.vue:100`. No file was selected or imported. **Impact:** keyboard/screen-reader users cannot identify the exit by its accessible name, and users accustomed to Escape need to discover the icon.

**Proposal:** add an Arabic accessible name and explicit Cancel/Close action; allow Escape when no import is committing, preserving any necessary in-progress safeguard. **Expected benefit:** straightforward exit without changing import mapping or validation. **Effort:** S. **Files:** `components/properties/ExcelImportDialog.vue`.

### Coverage observations with no new defect asserted

Documents provide client/type/status filters and an upload form; actual uploads, personal-document previews and native file dialogs were not exercised. Commission details link to deal, journal and receipt, and collection prepopulates the remaining amount, date, cash account and description. Cash management keeps currencies separate. Lease screens retain arrears on renewed/ended leases and explain custody money versus office income. These distinctions are useful and should survive any visual simplification.

Users, locations, accounts, journal entries and help were visually inspected. Global add/notification menus, the customer drawer and the import entry were also opened. No permission-role variants, bulk imports, deletions, financial postings, external access, email delivery or restore were executed. English-looking demo listing names and a custom `kitchen` amenity are fixture/custom values; they do not by themselves prove an untranslated interface. The development About screen displays Electron's version; packaged product-version behavior is unverified.

## 5. Workflow Analysis

Detailed reproducible traces and counting conventions are in [WORKFLOW-ANALYSIS.md](WORKFLOW-ANALYSIS.md). Counts stop at safe boundaries and exclude automation navigation used merely to inventory a route.

| Workflow | Observed current route | Measured baseline | Proposed direction / limit |
|---|---|---|---|
| A: add sale/rental | Dashboard quick action → full-page form | 1 entry click; via sidebar/list, 2. Sale 33 labelled controls / 9 required / 4 blank required; rental 23 / 8 / 4 | Disclose optional detail; keep defaults, save bar and validation. No save performed |
| B: client request | Dashboard purchase shortcut → request dialog; existing details → matches | 1 purchase entry click; 16 labelled controls / 2 starred, one blank required | Compact basic criteria; preserve “save and match”. New-request matching response not tested |
| C: deal | Match card → deal dialog | 1 click; property, client, request and owner context transferred | Preserve this existing shortcut; standalone dialog requires reselecting property/client. No deal saved |
| D: contract/export | Contracts → new → four types; deal → preparation dialog | 1 click from list to chooser. Source: five workspace steps after draft creation | Draft/issue/export completion not measured. No fabricated completion count |
| E: accounting | Commission detail → collect → prefilled receipt | 1 click to receipt; zero manual input needed for the displayed full-balance preset, two starred fields already filled | Keep contextual receipt; clarify collection labels and period boundaries. Issue not clicked |
| F: daily office | Dashboard → match details / appointment panel / client/task links | 1 click to match drawer; important client-contact panel below initial viewport | Unified attention queue with direct existing actions; no diary-completion or contact-time baseline |

No measured end-to-end duration, error-rate reduction or general “50% effort reduction” is established. Visible-field reductions are design estimates with an explicit denominator, not evidence that business tasks are twice as fast.

## 6. Information Architecture

Current primary destinations: dashboard; tasks/follow-ups; sale offers; rental offers; purchase requests; rental requests; clients; documents; deals; contracts; active leases; accounting; reports; settings. Contextual children expose templates; cash/journal/accounts; users/roles/locations. Help is fixed below. Favorites are list views. Old commission/voucher/report URLs redirect to consolidated workspaces.

**Do not repeat work already completed:** accounting and commissions already share a workspace; financial/operational reports already share a page; favorites already live inside offer lists; tasks/appointments/follow-ups already share a task surface. Deals/contracts and rental offers/active leases have related but distinct lifecycle meanings.

Proposed primary groups for a prototype:

| Destination | Useful default | Specialized views retained |
|---|---|---|
| اليوم | Prioritized attention + matches | Dashboard summaries, appointments, tasks and follow-up views |
| العروض | Last-used sale/rental list | Sale/rental creation, detail, favorites and import, separate domain handling |
| الطلبات والمطابقة | Open requests and matching | Purchase and rental modes with preserved filters/deep links |
| الزبائن | Client list and follow-up context | Documents, history, notes and linked records |
| الصفقات والعقود | Active deal list with contract status | Separate deal records, four contract types, specialist templates |
| الإيجارات السارية | Due/overdue and expiring leases | Instalments, settlements, renewals and terminated-lease arrears |
| الحسابات | Money overview and transactions | Commissions, shares, cash, accounts, journal and periods |
| التقارير والإدارة | Last-used report, with explicit administration entry | All reports, appearance/office/backup settings, users/roles/locations, Help |

This is a navigation experiment, not an instruction to merge settings with reports in a giant tab list. A usability test may justify retaining settings as a ninth destination. Keep specialized routes/deep links, permissions and keyboard access. Reject the proposal if common sale/request/collection entry rises above the current 1-click shortcut or 2-click list path.

## 7. Dashboard Redesign Proposal

At the laptop baseline there are seven quick actions, five summary indicators, a priority area, matching workspace, five business panels, commission collection, decisions/appointments, risk and offer-status areas. Counting the nine substantive panels after the top strips, consolidation into four purposeful regions is **9→4 (56%) fewer regions**, a layout estimate, not measured human effort.

Proposed order at 1366×768:

1. **Compact urgent overview:** overdue tasks, appointments today, overdue lease obligations and pending collections, with explicit counts and currency-separated money where relevant. Replace the five mixed-purpose KPIs with only actionable summaries; zero risks can be quiet but still discoverable.
2. **Needs Attention queue:** show the next five items across tasks, contacts, appointments, overdue/expiring leases and commissions. Each row has type, client/asset, due date, reason and one main action. Keep task completion, collecting money and contacting someone as distinct operations.
3. **Matching workspace:** retain current hard-constraint explanation, preferences, sale/rental switch and direct deal/follow-up controls. Show a compact client/request and listing comparison, with full reasons in the existing drawer.
4. **Concise business/financial summary:** period-labelled cash, commission and expense figures, with links to the dedicated screens. Preserve IQD/USD separation and custody-money explanations. Detailed performance/status tables move to Reports or expand on demand.

Widget disposition:

| Existing element | Recommendation |
|---|---|
| Matching workspace and contextual actions | Retain, simplify repeated prose |
| Tasks, appointments and contact-needed clients | Merge their actionable rows into attention; retain source pages |
| Overdue leases and expiring leases | Promote attention summaries; retain instalment/renewal detail |
| Outstanding commission collection | Keep direct collection inside attention, preserve preset receipt |
| Risk panel | Keep unmatched requests actionable; disclose zero/stale detail |
| Offer status and performance table | Move detailed table to Reports; retain a compact link/summary |
| Financial summary | Retain once with explicit period and scope |
| Backup action | Keep available in global/admin actions; use urgent dashboard space only for a real backup problem |
| Seven quick actions | Retain current fastest routes, group rarely used commands only after frequency testing |

The first viewport should answer who to contact, what matches, today's schedule and urgent obligations without requiring the user to infer urgency from unrelated panels. Acceptance requires a timed five-second comprehension test with office staff; the audit did not run one.

## 8. Forms Simplification Plan

| Form | Keep immediately available | Disclose when relevant | Integrity boundary |
|---|---|---|---|
| Sale offer | Type/legal state, basic location, area/pricing and owner | Parcel refinements, building dimensions, detailed address/map, amenities/notes | Keep all required/conditional pricing and legal fields |
| Rental offer | Type, location, rent/period, area and owner | Detailed specs, amenities, map, notes | Separate rental prices, images, requests and payloads |
| Request | Client, type, budget, location | Space/room/amenity preferences, extra notes | Hard constraints remain distinguishable from preferences; rental period stays required |
| Client | Required name and practical contact fields | Identity, residence, office relationship and notes | Existing identity/person reuse; contract-required data requested at the appropriate step |
| Deal | Existing property/client selection and agreed price/expected commission | Current advanced title/priority/employee/currency section | Preserve existing context transfer and financial rules |
| Receipt/expense | Amount, party/purpose and description | Current “تغيير” for date/account/currency | No change to issued-voucher immutability, custody or posting rules |
| Lease | Parties, amount, start/end, periodicity/currency | Deposit, notes and contract linkage context | Preserve schedule validation and arrears after renewal/termination |
| Contract | Source-reviewed parties → property → details → content → preview/issue | Specialist template/page formatting | Must verify with existing draft/issued fixtures before implementation |

Reuse the already implemented person picker, owner auto-fill, calculated sale totals, date/cash defaults and contextual presets. Do not propose them as missing features. No required field should be removed just to reach a numerical reduction target.

## 9. Component and Design System Improvements

- Keep the flat bordered desktop workspace, compact lists, sticky command areas, `AppPage` and existing Vuetify defaults. A wholesale card redesign would add risk without addressing the main findings.
- Standardize form group order through `FormSection` and maintain real `fieldset`/`legend` semantics. Use expansion/disclosure controls for optional groups with meaningful labels and retained values.
- Keep `VAutocomplete`/`PersonPicker` server search, loading, selected-item lookup and code/phone disambiguation. Do not replace them with full-directory downloads.
- Use one semantic money display and explicit period/as-of descriptions. Monetary summaries, custody funds, expected commission and realized office income must remain distinguishable.
- Make the page's main next action visually primary. For collection use consistent Arabic such as “تحصيل عمولة من الزبون”; distinguish employee-share payout from collecting office revenue.
- Keep DataGrid/table keyboard selection and context menus; avoid making every row action a separate prominent button. Preserve `aria-label`s, tooltips and shortcuts.
- Give loading, error and zero-result states separate messages and recovery actions. The tested sales retry and clear-filter states are useful reference patterns.
- Template specialists need full toolbars; ordinary contract creation should use contextual controls and a clear scope label. Do not remove export, revision or page-format functionality.

## 10. Accessibility and RTL Findings

The application rendered right-to-left; sidebar, breadcrumbs, field order and table alignment were consistent in sampled screens. Latin record codes, phone numbers, currency symbols and dates were inspectable without a gross ordering defect. IQD and USD were kept separate in the finance screens. These are observed samples, not exhaustive bidi certification.

Keyboard navigation focused the requested page-search input; ArrowDown/Enter opened the selected first result; Alt+Left retained the query; Ctrl+K opened global search and Escape closed it; F1 opened Help. Empty sale submission focused the first invalid field. The exact-code search mismatch is UX-01, not evidence that these key bindings fail. Source also provides skip-to-content and navigation roving focus, but a screen-reader session and complete dialog focus-trap audit were not performed.

Measured normal active-label contrast samples meet the **4.5:1** normal-text benchmark. Disabled controls are exempt from that criterion, so their faint labels are reported as a readability opportunity, not an automatic conformance failure. See [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Keyboard operable controls should retain a visible focus indication throughout use; the audit sampled this behavior rather than certifying every control. See [W3C focus-visible guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).

Native window checks found no document-wide horizontal overflow in the sampled dashboard, sale form and studio sizes. The deal board has intentional internal horizontal scrolling. Forms still require vertical scanning on wide monitors; more pixels do not remove the underlying input complexity. At 125% zoom the sale form changed to a two-column layout; save remained within the measured viewport. Windows display scaling, 200% zoom, high-contrast mode, every custom palette and assistive technology remain untested.

## 11. Prioritized Improvement Backlog

| Priority | Screen | Problem | Proposed Fix | Impact | Effort |
|---|---|---|---|---|---|
| P1 | Sales/search, UX-01 | Code lookup returns phone-based alternative first | Exact-code prioritization with regression checks | High correctness/recovery benefit | M |
| P1 | Dashboard, UX-02 | Urgency excludes task/lease business data | Unified attention queue | High daily value | L |
| P1 | Accounting, UX-03 | Summary/list period boundary unclear | Explicit scopes and opt-in shared dates | High interpretation benefit | M |
| P1 | Tasks, UX-04 | Undated new task defaults done | Separate task/activity intent; review default rule | High error-prevention potential | M |
| P1 | Dashboard help, UX-05 | Obsolete feature statements | Correct and link existing capabilities | High trust/discovery benefit | S |
| P2 | Sale form, UX-06 | 33 expanded labelled controls | Common core + optional sections | Frequent-task scanning | M |
| P2 | Rental form, UX-07 | 23 controls, different sequence | Align shared concepts, keep separate domains | Frequent-task consistency | M |
| P2 | Request form, UX-08 | Advanced preferences initially exposed | Basic request + preference disclosure | Frequent-task scanning | M |
| P2 | Client form, UX-09 | Full dossier during quick entry | Compact create mode | Less context switching | M |
| P2 | Navigation, UX-10 | Lower items below fold | Prototype useful grouped workspaces | Discovery benefit, test click cost | L |
| P2 | Deals, UX-11 | Nine-stage horizontal span | Table cue/stage group jumps | Less pipeline scanning | M |
| P2 | Studio, UX-12 | Expert controls dominate | Contextual editing by user/task | Lower scope confusion | L |
| P2 | Contract chooser, UX-13 | Type choice creates persisted draft | Explicit draft-start boundary | Hypothesis; validate first | M |
| P2 | Reports, UX-14 | Repeated unrelated KPI strip | Report-specific summary | More space for actual report | M |
| P2 | Empty reports, UX-15 | Little nearby period recovery | Change-period/preset action | Low-risk recovery improvement | S |
| P2 | Property details, UX-16 | Full gallery on operational tabs | Compact expandable gallery | More task context | M |
| P2 | Client overview, UX-17 | Business context across nine tabs | Linked follow-up summary | Less tab hopping | L |
| P2 | Backups, UX-18 | Disabled mail configuration expanded | Disclose infrequent setup | Lower setup density | S–M |
| P2 | Fields, UX-19 | Small labels/faint dependency hints | Readability tokens and independent hints | Reading comfort | M |
| P3 | Roles, UX-20 | Technical keys compete with labels | Human-first catalog detail | Admin polish | S |
| P2 | Excel import, UX-21 | Unnamed close icon; persistent initial dialog | Named exit and safe idle Escape/Cancel | Keyboard/accessibility recovery | S |

## 12. Implementation Roadmap

See [UI-UX-IMPROVEMENT-ROADMAP.md](UI-UX-IMPROVEMENT-ROADMAP.md) for dependencies, risks, estimates and acceptance criteria. Work should be split into small reviewable changes, not one redesign branch.

1. **Critical usability issues:** misleading guidance, lookup behavior, period scope and task-intent decision. No P0 was verified; treat search and financial interpretation as the first checks.
2. **Navigation/page consolidation:** validate the proposed grouping while preserving the consolidations already present, routes, permissions and one-click contextual paths.
3. **Forms/workflows:** optional-group disclosure and compact creation, then contract-lifecycle validation using isolated fixtures.
4. **Dashboard hierarchy:** attention queue integrating the existing task, lease, commission and matching sources without losing alerts.
5. **Visual consistency/polish:** floating labels, hints, gallery density and specialist tooling; repeat the representative native-size/keyboard/RTL checks.

Recommendations that alter task state, search semantics or contract persistence are not “styling-only” quick wins. They need explicit behavior acceptance and targeted automated checks in their later implementation tasks. This audit adds no migration or breaking API change.

## 13. Before/After Metrics

**“After” means proposed target, not an implemented result.** Percentages below describe only the named denominator.

| Metric | Measured current baseline | Proposed target | Projected difference / evidence limit |
|---|---:|---:|---|
| Sale labelled controls expanded by default | 33 | 12 | 64% fewer initially exposed controls; required fields unchanged |
| Rental labelled controls expanded by default | 23 | 11 | 52% fewer; required blank values still 4 |
| Purchase request labelled controls | 16 | 7 | 56% fewer; criteria retained in optional sections |
| Sale required values blank on default form | 4 | 4 | No false claim of input elimination |
| Rental required values blank on default form | 4 | 4 | No false claim of input elimination |
| Dashboard substantive panels after top strips | 9 | 4 regions | 56% fewer regions; does not prove faster decisions |
| Primary navigation destinations | 14 | 8–9 prototype | 36–43% fewer choices; must not add daily clicks |
| Known-code search results for H-0001 | 2; exact result second | Exact result first / explicit alternatives | Lookup accuracy target, no measured time reduction |
| Dashboard → sale form | 1 click | ≤1 click | Preserve existing efficiency |
| Match → contextual deal | 1 click; records prefilled | ≤1 click, same context | Preserve existing efficiency |
| Commission detail → receipt | 1 click; amount/date/cash/purpose filled | ≤1 click | Preserve existing efficiency |
| Task-time, error-rate, five-second comprehension | Not measured with users | Establish in validation | No defensible percent change yet |

For a later office study, record median/p90 duration, meaningful interactions, manually entered values, navigation transitions, error recovery and correct outcome for each flow. Compare the same fixture/task and user cohort before/after. Use projected 50% reductions as hypotheses only where the baseline supports them.

## 14. Top 20 Recommended Changes

Rank balances daily impact, confidence and effort; the detailed severity remains unchanged.

1. Correct obsolete dashboard/contact-history guidance — UX-05.
2. Make complete-code lookup reliably prioritize the intended record — UX-01.
3. Label accounting summary and list scopes explicitly — UX-03.
4. Clarify task versus completed activity before applying defaults — UX-04.
5. Promote overdue tasks and lease obligations into one attention queue — UX-02.
6. Disclose optional sale-property details — UX-06.
7. Simplify rental form exposure and align common field order — UX-07.
8. Start requests with client and core criteria — UX-08.
9. Provide compact client creation within related workflows — UX-09.
10. Give Excel import a named, obvious exit and safe idle dismissal — UX-21.
11. Give empty reports a direct period-recovery action — UX-15.
12. Replace repeated cross-business report KPIs with report-specific summaries — UX-14.
13. Summarize actionable client context on the activity overview — UX-17.
14. Preserve the table alternative and make later pipeline stages easier to find — UX-11.
15. Prototype grouped navigation without adding daily clicks — UX-10.
16. Separate ordinary contract content editing from expert template controls — UX-12.
17. Make the draft-creation boundary explicit, after lifecycle validation — UX-13.
18. Collapse disabled email-backup configuration while retaining warnings — UX-18.
19. Increase floating-label readability and detach instructions from disabled opacity — UX-19.
20. Compact the gallery on non-photo operational tabs — UX-16.

Supporting deliverables: [inventory](SCREEN-INVENTORY.md), [workflows](WORKFLOW-ANALYSIS.md), [roadmap](UI-UX-IMPROVEMENT-ROADMAP.md), [quick wins](QUICK-WINS.md), [evidence manifest](RUNTIME-EVIDENCE.json), and [screenshot index](screenshots/README.md).
