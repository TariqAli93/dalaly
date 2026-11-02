# Dalaly UI/UX implementation summary

Date: 2 November 2026. Branch: `feat/ux-audit-implementation` (16 commits on
`main` at `b3b0bbe`). Evidence: the Codex audit in [`docs/ux-audit/`](../ux-audit/DALALY-UI-UX-AUDIT.md),
read in full, including its screenshots.

This change implements the safe, verified recommendations of that audit. All
21 findings were checked against the current code before changing anything;
20 were addressed, one (UX-13) was verified and left as it is. Every phase was
exercised in the real Electron application, not only in tests.

See also: [metrics](BEFORE-AFTER-METRICS.md), [changelog](CHANGELOG.md),
[regression checklist](REGRESSION-CHECKLIST.md), [screenshots](screenshots/README.md).

## How it was verified

- **Real Electron.** `apps/desktop/src/main.js` launched through Playwright's
  `_electron.launch` with an isolated profile, against Vite on 5188 and its
  own API on 34611 (another developer session was using 5173/34567 when the
  work began; it was not touched). Client area 1350×729 at the 1366×768
  outer size, as in the audit.
- **Isolated data.** A new database `dalaly_ux_impl`, created as a copy of the
  demo database (`CREATE DATABASE … TEMPLATE dalaly_demo`). Everything that
  saves (a task, a sale listing, a client, a purchase request, five contracts,
  exports) was done there. `dalaly_demo` and the development database
  `dalaly` were not written; demo table counts were fingerprinted before the
  copy. The demo media were copied into the temporary profile.
- **Baseline first.** Dashboard and form measurements were captured before
  Phases 2 and 3 with the same scripts used afterwards. They reproduce the
  audit's numbers exactly (sale 33/9/4, rental 23/8/4, purchase request 16).
- **Automated checks.** `pnpm lint` (ESLint and every typecheck), `pnpm test`
  (125 tests), `pnpm build`, the API contract test (149) and the database
  suites for search, list and CRM paging, list queries, tasks (44) and
  contracts (11). New unit tests cover the task intent, the attention queue
  and collapsible form sections; a new database test covers code search
  precedence and fails without the fix.

## Phase 1 — correctness and interpretation (UX-01, 03, 04, 05)

| Finding                | Before                                                                         | After                                                                                                                                                                                                                                                                               | Files                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| UX-01 code search      | `H-0001` listed `F-0001` first (its owner's phone holds 0001); Enter opened it | A search word that is a whole listing code orders that listing first, ahead of the chosen sort. Same result set: phone, partial and Arabic searches find what they did                                                                                                              | `server/src/modules/properties/properties.repository.ts`, `server/scripts/search-text.test.ts` |
| UX-04 new task         | Undated «مهمة لزبون» saved as done                                             | New records choose «مهمة يجب إنجازها» or «تسجيل أمر حدث», shown as a toggle; the tasks page and the overdue-instalment follow-up start as a task. Other callers keep the old date rule until the user picks, now visibly. Edit mode unchanged                                       | `TaskDialog.vue`, `utils/taskIntent.ts`, `TasksPage.vue`, `OverdueInstallments.vue`            |
| UX-03 accounting scope | «هذا الشهر» above a list of all dates, list dates hidden in extra filters      | «ملخّص هذا الشهر من … إلى …»; the transactions list says «كل الحركات، بكل التواريخ — لا تتبع فترة الملخّص» or its own range, with explicit «حركات هذا الشهر فقط» / «كل التواريخ». Commission and share lists state they cover all dates. No silent synchronisation, no query change | `AccountingPage.vue`, `VoucherList.vue`, `utils/periods.ts`, `styles.css` (`.dal-scope`)       |
| UX-03 wording          | «تسديد عمولة» (the payer's view) beside «تحصيل»                                | «تحصيل عمولة» everywhere; employee payouts stay «دفع»                                                                                                                                                                                                                               | `AccountingPage.vue`, `constants/domain.ts`, `HelpPage.vue`, `VoucherDialog.vue`               |
| UX-05 copy             | Dashboard said commissions, leases and contact history are not recorded        | Each note says where they are (client activity tab, accounting, active leases)                                                                                                                                                                                                      | `MatchDetailsDrawer.vue`, `CustomerDrawer.vue`, `PerformanceSummary.vue`                       |

Electron: `H-0001` → first row H-0001, ArrowDown/Enter opened `/properties/1`;
an undated task saved from the tasks page is `status = open`,
`completed_at = null` in the database and appears under «المفتوحة»;
«حركات هذا الشهر فقط» filtered the list to one voucher.

## Phase 2 — dashboard around daily decisions (UX-02, with UX-05/17)

The dashboard is four regions instead of three strips and ten panels:

1. **Figures** (`SummaryStrip`): tasks past due, today's tasks and
   appointments (week count as note), overdue instalments (amount per
   currency), commissions not collected, requests with matches. Each opens
   its full list (or scrolls to matching).
2. **«يحتاج متابعتك»** (`AttentionQueue`, built by `utils/attentionQueue.ts`
   from data the page already loads; no new endpoint). Tiers: متأخر، اليوم،
   للتحصيل، تواصل، متابعة. Ordered by tier, then oldest date; no score. A
   record from two sources is one line. Each line has one next action: open
   the record, the prefilled commission receipt, the prefilled rent receipt
   (held for the landlord, not office income), the customer drawer, or the
   viewing follow-up. The default view shows up to three lines per tier, so
   today's work and collections appear in the first screen even with a
   backlog; tier chips filter. A source that fails is named with a retry, and
   the empty state lists what was checked.
3. **Matching** (`MatchWorkspace` unchanged) with `RiskPanel` (requests
   without a match, stale listings; viewings moved to the queue).
4. **Work summary** (`WorkSummary`): open deals by state and this month's
   money per currency with its dates and a note that client funds are not
   income; `PerformanceSummary` beneath.

Retired: `PriorityStrip`, `BusinessPanels`, `OutstandingCommissions`,
`DecisionsPanel`, `utils/dashboardPriority.ts`. Their rows and figures moved;
every alert category (`tasks_overdue`, `installments_overdue`, `tasks_today`,
`deals_stalled`, `leases_expiring`, `customers_needing_contact`) is a queue
tier or line. `docs/OPERATIONS_DASHBOARD.md` is updated.

Electron at 1366×768: eight queue lines in the first viewport covering
overdue, today, collection and contact; «تحصيل القسط» opened the rent receipt
preset; «تحصيل» the commission receipt (one click, as before); match → «صفقة»
opened the deal with property, buyer and seller filled (as before); a 503 on
`/dashboard/business` showed the warning and the other sources' lines, and
retry recovered. Also checked at 1440×900, 1920×1080 and in dark mode.

## Phase 3 — daily forms (UX-06, 07, 08, 09)

`FormSection` gained an optional collapsible mode (a button in the legend
with `aria-expanded`; fields stay mounted with `v-show`, so values, defaults
and validation are unchanged). `useFormSections` opens a section when it
holds data (editing, a restored draft), when the server reports an error on
one of its fields, or when the user opens it, and reveals the section of the
first invalid field before focusing it.

| Form                      | Visible first                                                                     | Collapsible                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sale                      | offer (type, legal type, status), location, area and price, owner                 | parcel and subdistrict; specifications and amenities; detailed address; map; name and notes          |
| Rental                    | same section order as sale; rent period with price                                | specifications; detailed address; map; name and notes                                                |
| Purchase / rental request | client, type (+ rent period), budget, location (the matching's required criteria) | preferences (area, counts, amenities: they rank, never exclude); status and notes, open when editing |
| Client                    | name, phone, role                                                                 | other contact and type; identity and residence; office relation and notes                            |

Electron: empty save focused `area_value` with 4 errors; a duplicate-plot
409 arriving while the parcel section was closed opened it and focused
`plot_number` with the server's message; a minimal sale saved (L-0005, total
computed 200 × 1,000,000); editing H-0001 opened the four sections with data;
a client created inside the request dialog with name and phone was selected,
the request saved and «حفظ ومطابقة» listed four results (new-request matching
was unverified in the audit); the save bar stayed visible at 125%.

## Phase 4 — reports and accounting (UX-14, UX-15; UX-03 above)

Each report opens with its name and period (the server's, or the filters'
while loading), then filters, then its own figures and tables. The five
cross-report figures became «نظرة عامة على الفترة», closed by default and
remembered per viewer; while closed, their four requests are not sent. An
empty period names the report and period, says it is not a loading error and
offers «تغيير الفترة» and the other presets without claiming data elsewhere.
All 13 reports opened in Electron with their exports.

## Phase 5 — navigation and workspaces (UX-10, 11, 17)

- **Navigation.** The proposed regroup to ~8 destinations was not
  implemented: putting sale/rental offers or purchase/rental requests behind
  one entry adds a click to frequent paths, which the brief rejects. Instead
  rows are 32px and group labels 24px, so all 14 destinations and Help fit at
  1366×768 (12 before). The rules now outrank Vuetify's compact list sizes
  whatever order the styles load in; before, row height depended on it.
- **Deals.** A stage chip bar shows all nine stages with counts and jumps to
  (and focuses) a column; empty stages are narrower; «كل الصفقات في جدول»
  switches to the remembered table view. No drag, no stage-move change.
- **Client.** «مفتوح الآن مع الزبون» heads the activity tab: open deals (one
  small request, three rows) and open requests (already loaded), linked.

## Phase 6 — consistency and smaller fixes (UX-16, 18, 19, 20, 21)

- UX-16: the gallery folds to its title with «عرض الصور» on a listing's
  non-detail tabs (+195px for the tab at 1366×768); `ListingImages` stays
  mounted.
- UX-18: with the email schedule off, one line and «عرض الإعدادات دون تفعيل»
  replace the mail and encryption fields; warning and «حفظ الجدولة» stay.
- UX-19: floating labels 0.85em (11.05px, was 9.75px); hints under disabled
  fields at full opacity in the muted colour (5.91:1, was ≈2.24:1).
- UX-20: permissions show name and description first, the key small and
  monospace, with «نسخ المعرّف التقني».
- UX-21: «إغلاق الاستيراد» label, a visible «إلغاء», Escape closes unless an
  import is committing; an outside click still keeps the dialog.

## Phase 7 — contracts: verified, then wording only (UX-12, UX-13)

Verified before any change, in `dalaly_ux_impl`:

- server suite `agreements.test.ts` 11/11 (draft revisions, wrong-kind
  refusals, issue checks, immutable revisions, corrections as new revisions,
  templates never touching contracts, permissions, backups);
- UI: deal D-0001 → «إعداد العقد» → draft CT-0001 with seller, buyer and
  listing from the deal; autosave «غير محفوظ…» → «محفوظ», kept after a reload;
  the review step listed the three missing values, then «جاهز للإصدار»; issue
  with its immutability warning → «صادر · 1»; issued fields read-only (0 of
  17 inputs enabled); PDF (3 pages), Word (.docx) and print (the native print
  call stubbed) all ran and were recorded in `agreement_exports`; «مراجعة
  جديدة» with a reason opened revision 2 while revision 1 stayed stored; all
  four types created drafts from their templates (CT-0002…CT-0005).

Change: one accurate scope line in the template studio (a template edit
reaches new contracts only) and in a contract's content step while editable
(«لهذا العقد وحده»). UX-13 (choosing a type creates a draft) is left as is:
the chooser already says so, never-issued drafts can be deleted, and no
abandoned-draft problem was observed. The editors, persistence and issued
documents are unchanged.

## Follow-up — Latin digits in native date and number fields

Found during this work (not in the audit): Chromium draws `<input type="number|date|time|datetime-local|month">` in the application locale (`--lang ar-IQ`), so they showed Arabic-Indic digits, and empty date fields showed a broken placeholder («قنس/رهش/موي»). A probe showed that neither the input's `lang` nor CSS changes this; Chromium reduces any Arabic `--lang` to `ar`, and an English locale switches the native controls to English and takes the date order from Windows' region.

- The 25 number fields use the existing `NumberField` (Latin digits; Arabic-Indic typing is converted). Arrow-key stepping of the native number field is gone.
- The 29 date fields, the month field and the backup time field use a new `components/app/DateField.vue` (`utils/dateInput.ts`): Latin `dd/mm/yyyy` (`hh:mm`, `mm/yyyy`), any digits and separators accepted, an invalid entry shown with a message and sent as empty, and the system calendar through a button or Alt+↓ (a hidden native input, so `min`/`max` still bound the picker and are checked). The bound value keeps the native formats (`YYYY-MM-DD`, `HH:MM`, `YYYY-MM`).
- The task dialog's date-time field is a date field and a time field writing the same local `YYYY-MM-DDTHH:MM`; a date without a time shows 09:00 in the time field.

Electron: no input on the checked screens holds an Arabic-Indic digit; a task typed «٥/١١/٢٠٢٦», 14:30 and then picked 7/11 was stored as `2026-11-07T11:30Z` (14:30 Baghdad). The calendar popup itself still follows Chromium's Arabic locale.

## Backend and data

One backend change, as the brief allowed for UX-01: an `ORDER BY` prefix in
`properties.repository.ts`. No schema, migration, API shape, permission,
financial or matching change. UX-04 needed none: the API already accepted an
explicit status.

## Remaining risks

- The attention queue reads the five rows per list the API returns; tier
  counts use the server totals, and «عرض كل الأسطر» shows only loaded rows.
  Larger offices may want per-tier links to full lists (the summary strip has
  them for the main categories).
- With much backlog, overdue rent instalments of one tenant can fill the
  «متأخر» tier's three default lines; each line is still a distinct
  obligation.
- No timed study with office staff was run. Reductions below are exposed
  controls and measured layout, not task time.

## Deferred, with the decision needed

| Item                                        | Why deferred                                       | Decision needed                                                     |
| ------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Navigation regroup to 8–9 destinations      | Adds a click to rental offers/requests             | Usability test with office staff; accept a click for fewer choices? |
| Explicit «بدء مسودة» for contracts (UX-13)  | Behaviour change; no observed problem              | Owner choice if abandoned drafts appear                             |
| Ordinary vs expert contract editing (UX-12) | Large editor change                                | Product scope for a simplified clause editor                        |
| Commission list date filter                 | Needs an API filter (`commissions/paged` has none) | Approve an API addition                                             |
| Request match counts on the client page     | Not in the request list payload                    | Approve an API field                                                |
