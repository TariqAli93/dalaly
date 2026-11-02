# UI refinement pass, 2026-11-02

A frontend-only pass over the whole renderer, done directly on `main` with no
branch, commit or pull request. The brief asked for a complete desktop UI/UX
redesign; the inspection found a product that already has one coherent system
("The Dalaly Desk", `apps/renderer/DESIGN.md`: command bar, dark-teal
navigation pane, panels on the canvas, two radii, Cairo, Latin digits, four
data states, a keyboard map). Redesigning that again would have replaced owner
decisions for the sake of novelty, so this pass is a refinement: every screen
was rendered and reviewed, and the defects found were fixed in place. Nothing
under `server/`, `apps/desktop/` or `server/drizzle/` was touched.

## 1. What was inspected

- Every route in `router/index.ts`, rendered in the web demo
  (`pnpm dev:web`, isolated `dalaly_demo` database) at 1366×768 in light and
  dark mode, plus 1920×1080 and 1100×700, with Playwright: 36 screens, 11 add
  dialogs and the global search palette. Captures live in
  `screenshots/` here (eight before/after pairs); the full set was kept
  outside the repository.
- Source of the shell (`AppLayout`, `AppSidebar`, `AppTopbar`, `AppPage`),
  the shared components (`DataGrid`, `FilterBar`, `EmptyState`,
  `FormSection`, `FormActionsBar`, `RecordFacts`, `DetailList`,
  `MasterDetailLayout`, `SideSheet`, `StatusChip`, `RowActions`), the
  dashboard components, the theme (`plugins/theme.ts`, `styles.css`) and the
  page files behind each finding.
- Skills used: `unslop` (audit and polish mode: the screens were "light slop",
  mostly designed), `impeccable` (Operate mode, craft floor), `ux-desktop`,
  `ux-dashboard`, `design-motion-principles` (Emil Kowalski lens: frequency
  gate, under 200 ms), `frontend-design`, `ui-ux-pro-max` (checklist),
  `find-skills` (to verify the set). `awwwards` and `premium-web-design` were
  loaded and read; both state they are not for internal tools and dashboards,
  so they served only as anti-pattern checks. The `ruflo` MCP server failed
  to connect in this session (`CONNECTION_CLOSED`), so no multi-agent
  coordination ran; the work was done sequentially.

## 2. Findings

Across 48 captures the system held: one family, one accent, hairlines instead
of shadows, consistent dialogs, skeletons, empty states with a next step,
dark mode legible everywhere. The defects were in details, and most of them
cost the office real time every day:

1. **Columns missing on the most common screen.** `DataGrid` hid
   priority-2 columns under 70rem of grid width. A 1366px screen with the
   navigation expanded leaves the list panel about 1110px (69.4rem), so the
   customers list lost «الصفة» and «السكن», the request lists lost «الموقع»,
   the tasks list lost «الأولوية» and «المكلّف», and the sale listings lost
   «المالك», on exactly the screens the offices use.
2. **Seconds in every date-time.** Follow-up dates, record dates and task
   deadlines read «2026/10/24، 11:58:31 م». Nobody schedules to the second.
3. **A toolbar row spent on one button.** On lists without quick views (the
   vouchers tab), «فلاتر إضافية» stood alone on a second 36px row.
4. **A row of three buttons under the location fields.** Every listing and
   request form carried «إدخال يدوي» under each of governorate, district and
   neighbourhood, plus a hint line, two rows for one rare switch.
5. **Ctrl+N only on five lists.** Tasks, documents, deals and leases had an
   add button but no shortcut, and the five pages that had it each carried
   their own copy of the handler.
6. **The task's record needed the row menu.** «تخص» was plain text; opening
   the listing or the customer meant «⋯» then «فتح العرض».
7. **Dialog motion ignored the reduced-motion setting.** Vuetify's default
   dialog and menu transition is JavaScript-driven (225 ms scale from the
   button), so the stylesheet's reduced-motion rules, written for a class
   that does not exist in Vuetify 3, never applied.
8. **Red on every admin row.** The locations page showed a red delete icon
   on each of its 18 + 16 rows.
9. **A card inside a panel.** «مفتوح الآن مع الزبون» on the customer page
   was a bordered box inside the activity tab; the rental page's leases panel
   had a title that matched no other panel header.
10. **Small copy.** The global search label ended in an ellipsis.

## 3. What changed

### Design foundations (`styles.css`, `main.ts`, `DESIGN.md`)

- Motion tokens: `--dal-motion-fast` 100 ms, `--dal-motion-base` 160 ms,
  `--dal-motion-enter` 200 ms, `--dal-ease` and `--dal-ease-exit`. The nav
  item and button transitions use them.
- CSS transitions `dal-dialog` (fade, 8px rise, 1.5% scale) and `dal-menu`
  (fade, 4px drop) set as Vuetify defaults for `VDialog`, `VMenu`, `VSelect`,
  `VAutocomplete` and `VCombobox`. Dialogs open in 200 ms and close in 100 ms
  instead of 225 ms, and the reduced-motion rules now reach them (fade only,
  no movement). The dead `.v-dialog-transition-*` rules were replaced.
- `DataGrid`: priority-2 columns hide under 62rem instead of 70rem.
- `utils/format.ts`: `formatDateTime` renders to the minute;
  `formatDateTimeSeconds` exists for the audit log, which keeps seconds.
- `DESIGN.md` records the thresholds, the motion tokens and transitions, the
  filter bar rule, the location fields, the date precision and the Ctrl+N
  scope.

### Shared components

- `FilterBar`: a bar without quick views or a sort control keeps «فلاتر
  إضافية» at the end of the search row; the sub-row appears only while
  filter chips are active. The vouchers tab loses an empty row; sale and
  rental lists are unchanged.
- `LocationSelects`: the manual-entry switch is a 12px link in each field's
  details line, beside a shorter hint («اختر المحافظة أولاً، أو إدخال يدوي»),
  and stays at full contrast under a disabled select. Used by the sale
  listing form, the rental form and both request dialogs.
- `composables/useCreateShortcut.ts`: one Ctrl+N handler (by `event.code`,
  ignored while a dialog is open, permission checked at keypress) replaces
  the five copies in `PropertiesPage`, `RentalsPage`, `PeoplePage`,
  `RequestManager` and `UsersPage`, and adds the shortcut to `TasksPage`,
  `DocumentsPage`, `DealsPage` and `LeasesPage` (on the leases tab). Their
  add buttons say «(Ctrl+N)» in the tooltip and carry `aria-keyshortcuts`;
  the Help page's shortcut table lists the new pages.

### Pages

- `TasksPage`: «تخص» links to the listing or the customer file
  (`recordOf`, the same target as the row menu).
- `RentalDetailsPage`: the leases panel uses the standard 40px panel header.
- `PersonOpenWork`: a flat strip divided by a hairline, no box in a panel.
- `LocationColumn` (settings › locations): row controls rest muted and take
  ink on their hovered or focused row; delete turns red only there.
- `GlobalSearch`: label «بحث شامل».
- `AuditLogList`: keeps seconds through `formatDateTimeSeconds`.

### Dashboard

Reviewed against `ux-dashboard` and `unslop` and left as the owner approved
it on 2026-11-02: one queue of what needs attention, a summary strip whose
colour means state, the match row as the one teal moment, counts that open
their lists. The figures it shows answer the owner's morning questions; no
decorative chart or KPI was found to remove.

## 4. Before and after

| Screen                                  | Before                                            | After                                            | What to look for                                                       |
| --------------------------------------- | ------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| الزبائن                                 | `screenshots/before-people.png`                   | `screenshots/after-people.png`                   | «الصفة» and «السكن» columns at 1366px                                  |
| طلبات الشراء                            | `screenshots/before-purchase-requests.png`        | `screenshots/after-purchase-requests.png`        | «الموقع» column                                                        |
| المهام والمتابعات                       | `screenshots/before-tasks.png`                    | `screenshots/after-tasks.png`                    | priority and assignee columns, record links, dates to the minute       |
| إضافة عرض عقاري                         | `screenshots/before-property-new.png`             | `screenshots/after-property-new.png`             | location fields: one line of hint plus link instead of a button row    |
| إضافة طلب شراء (dialog)                 | `screenshots/before-dlg-purchase-request.png`     | `screenshots/after-dlg-purchase-request.png`     | same compaction inside the dialog                                      |
| الحسابات › الحركات المالية              | `screenshots/before-accounting-vouchers.png`      | `screenshots/after-accounting-vouchers.png`      | «فلاتر إضافية» in the search row; the empty sub-row is gone            |
| ملف الزبون                              | `screenshots/before-person-details.png`           | `screenshots/after-person-details.png`           | «مفتوح الآن مع الزبون» as a strip                                      |
| العرض الإيجاري                          | `screenshots/before-rental-details.png`           | `screenshots/after-rental-details.png`           | leases panel header                                                    |
| المحافظات والمناطق                      | `screenshots/before-locations.png`                | `screenshots/after-locations.png`                | quiet row controls                                                     |

## 5. Effort saved (estimates, same convention as `docs/UX_SIMPLIFICATION.md`)

- Open a task's listing or customer from the list: 2 clicks (menu, item) →
  1 click.
- Start a task, document, deal or lease from its list: 1 click → 0 clicks
  with Ctrl+N (the button stays).
- See a customer's roles or assigned employee, or a request's location, on a
  1366px screen: open the record and come back (2 clicks, one page load) →
  read it in the list.
- Location fields in the four listing and request forms: 36px less to scroll
  per form, the same clicks.
- Vouchers list: 36px more rows per screen.

No figure in this document is a measurement across whole workflows; the
2026-11-01 pass measured −23% clicks over ten workflows and that remains the
last measured number.

## 6. Checks

| Check                                                                    | Result                          |
| ------------------------------------------------------------------------ | ------------------------------- |
| `pnpm lint` (ESLint, then server `tsc`, renderer `vue-tsc`, Electron)    | passed                          |
| `pnpm test` (126 unit tests, no database)                                | 126 passed, 0 failed            |
| Prettier on every changed file                                           | only the repository-wide CRLF warning that untouched files raise too; diffs are line-exact |
| Playwright interaction script (scratchpad, not committed): Ctrl+N and Esc on tasks, documents, deals, leases, people, users and the sale form; record links in the tasks list; manual-entry toggle under a disabled select; filter-bar placement on vouchers and properties; `dal-dialog` transition classes; dates without seconds | 22 checks, all passed |
| Visual review of 48 captures before and 24 after, light and dark         | done                            |

Not run: the database-backed suites (`test:runtime`, `test:contract` and
the rest) and the real Electron startup suite, because no API shape, route
or main-process file changed. The captures come from the web demo in
Chromium, not from the packaged Electron window; the renderer is the same
bundle.

## 7. Limitations and work left

- Capture noise: the first screenshot run hit Vite's dependency
  re-optimisation (`504 Outdated Optimize Dep`) once and `about:blank`
  denies `localStorage`; neither is an application error. The web demo had
  to run on port 5200 because an orphaned Vite from an earlier session
  still holds 5199 (and several orphaned `tsx watch` API processes exist);
  this session could not stop them.
- Deferred, needs the owner: fewer tabs on the customer file (nine today;
  merging «الملاحظات» into «البيانات» was considered and left for
  consistency with the listing pages), the report name in the command bar
  instead of above the reports panel, a quieter notification badge (today it
  counts overdue and warning items in red), and `hideDetails: "auto"` on
  fields (22px per field, but validation errors would shift the layout).
- Backend-dependent, listed before and still open: request match counts in
  the lists, a commission date filter, a stale-listing filter on the server.
- `.impeccable/design.json` is older than `DESIGN.md`; refreshing the
  sidecar is a separate `/impeccable document` run.

## 8. Confirmations

- Untouched: `server/`, `apps/desktop/`, `server/drizzle/`, every service
  and type under `apps/renderer/src/services` and `types`, authentication,
  permissions, money, matching and contract logic.
- No branch, worktree, commit, merge, rebase or push. The pre-existing
  uncommitted change in `.claude-flow/` (plugin state) was left as found.
