# UI/UX audit and desktop redesign plan (October 2026)

Status: **phases 0–2 implemented (2026-10-25); phases 3–7 planned.** It
covers the renderer (`apps/renderer`), plus the Electron window-close handling
that phase 2 needed (section 13). No API, schema or migration change is
proposed here. Items that would need one are listed separately in section 9
and wait for owner approval. The owner's decisions are in section 10, and the
phase records in sections 11–13.

## How this was produced

- **Code review.** Four parallel, read-only reviews of `apps/renderer/src`:
  lists and filters; forms, dialogs and feedback; detail views, workflows and
  the dashboard; and cross-cutting accessibility, RTL, theming, type and
  performance. Each finding cites the file and line.
- **Runtime evidence.** Taken from the isolated web demo (`pnpm demo:reset`,
  `pnpm dev:web`, demo database `dalaly_demo`):
  - every route captured in light and dark at **1366×688 CSS px**, which is a
    1366×768 screen minus the Windows taskbar and title bar;
  - the same pages with the sidebar expanded;
  - the same pages at **1093×550**, the same screen at 125% scaling;
  - a keyboard probe: tab order, focus rings, Ctrl+K, Esc, row activation and
    Ctrl+S;
  - scripted reproduction of the data-loss bugs. Demo data was restored
    afterwards.
- **Detector.** `impeccable detect` over `src`: 64 findings, verified in
  context.
- **Fit with existing documents.** Checked against `PRODUCT.md`, `DESIGN.md`,
  `docs/UI_REDESIGN.md`, `docs/UI_ENHANCEMENTS.md`,
  `docs/OPERATIONS_DASHBOARD.md` and `docs/PERFORMANCE.md`.

The demo's web build and the Electron window run the same renderer code. What
the web build cannot show is native-only: dialogs, the window frame, and
Windows font rendering. Those are checked in Electron during implementation
(section 8).

---

## 1. Summary

### Health score (technical audit, 0–4 per dimension)

| #         | Dimension                    | Score    | Key finding                                                                                                                                                        |
| --------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Accessibility                | 1        | Sold/rented status chips 1.15:1 (light) and 1.00:1 (dark); tables not operable by keyboard; 19 unnamed icon buttons; field outlines 1.48:1                         |
| 2         | Performance                  | 3        | Good foundations: lazy routes, lazy xlsx/leaflet, server paging, idle thumbnails. Risks: the gallery decodes 3–5 MB originals as thumbnails; 643 KB of startup CSS |
| 3         | Theming                      | 2        | Token engine exists and is contrast-aware, but status roles are misassigned, there are 20 hard-coded colours, and runtime values differ from the documented ones   |
| 4         | Desktop sizing (1366 / 125%) | 1        | The sale and rental tables lose price, status and actions off the left edge at 1366 px; at 125% only about 3 rows are visible                                      |
| 5         | Implementation integrity     | 2        | Three conflicting design authorities, card-in-card on most pages, 13 distinct radii, Tailwind alongside Vuetify                                                    |
| **Total** |                              | **9/20** | **Poor: a structured overhaul, not a polish pass**                                                                                                                 |

Many patterns are worth keeping. They are listed under "Keep" in each area.

### Findings that come before any redesign

Four defects lose or corrupt office data today. Three were reproduced in the
running app.

1. **Editing a listing wipes its district and neighbourhood.** Reproduced: I
   opened property `L-0003` for edit and saved without touching it. The PUT
   sent `district_id: null, neighborhood_id: null`, and the record lost both.
   - Cause: `LocationSelects.vue:68-78` resets the children when the
     governorate changes from null to its value while the form loads.
   - Consequence: every routine edit (a price change, a status change)
     silently strips the location, which also breaks location matching.
2. **A new rental saved twice becomes two rentals.** Reproduced: after the
   first save the page stayed on `/rentals/new`, still titled "إضافة عرض
   إيجاري". Saving again after closing the matches dialog created a second
   rental.
   - Cause: `RentalFormPage.vue:130-132,172-185` with a reused route
     component.
3. **An archived customer cannot be found or restored.**
   - Archiving is one unconfirmed click next to the edit pencil.
   - The list never sends `status`, and the server hides archived people by
     default (`people.repository.ts:63-64`).
   - So the restore button can never appear (`PeoplePage.vue:48-55,156-161`).
4. **No unsaved-changes protection anywhere.** There is no route guard and no
   `beforeunload`. Idle logout after 15 minutes, a 401, a sidebar click or
   closing the window all discard a half-entered listing.

Also P0 for accessibility: **"مباع" and "مؤجر" are unreadable** in the main
status column. `domain.ts:281-282` maps them to `secondary`, which is a surface
colour.

---

## 2. Audit findings by area

Severity: **P0** blocks a task or loses data. **P1** is a significant
difficulty or a WCAG AA failure. **P2** is an annoyance with a workaround.
**P3** is polish.

### 2.1 Application shell and navigation

- **[P1] Surfaces stacked on surfaces.**
  - The workspace is an inset white card: `.dal-workspace`, 16px radius, 12px
    margin, 20–24px padding.
  - Every page then puts more bordered white cards inside it: filter card,
    results card, table card.
  - This is the "card on a card" web tell, and it breaks DESIGN.md's Layered
    Neutral Rule. It costs about 36px per side and 50px of height before any
    data.
- **[P1] Vertical budget.** At 1366×688 the sales table header starts at
  y≈350, so about 6 rows are visible. At 125%, about 3.
  - The 60px top bar is followed by a ~70px page header (title plus a filler
    subtitle).
  - Then come a ~110px filter card and a ~60px results card.
- **[P1] The title appears 2–5 times.** In the top bar (`.dal-command-title`),
  the page h1, the in-content breadcrumbs, the panel title, and the tab's h2.
  On the property page, "عقار L-0003" appears four times and the code six.
- **[P1] "Global" search covers only sale listings and shares the page
  search's state.** `AppTopbar.vue:75` binds `filters.q`.
  - On rentals, people or requests, Enter jumps to sale listings.
  - Typed text without Enter silently filters the next visit to the sale list.
- **[P2] The sidebar opens as an icon-only rail by default.**
  `AppLayout.vue:26-33` treats "unset" as collapsed.
  - 12 icons, including two hearts and three house variants, mean a new member
    of staff has to hover each one.
  - The focus ring on the rail is 1.87:1.
- **[P2] User and logout appear twice**, in the sidebar footer and the top-bar
  menu. "جلسة محلية" tells the user nothing.
- **[P2] No skip link, and focus stays on `<body>` after every navigation.**
  A keyboard user re-tabs through the whole shell on every page.
- **[P2] Inconsistent terms for the same thing.**
  - Customers: nav "الزبائن", button "إضافة شخص", page "تعديل العميل" and
    "العودة للعملاء", breadcrumb "العملاء والأشخاص".
  - Documents: nav "المستندات", page h1 "مستمسكات الأشخاص".
  - `PRODUCT.md` fixes "الزبائن".
- **[P3] Dead code in the shell.**
  - The top-bar `actions` slot is never filled.
  - `styles.css:210` has an invalid `background: var(--v-theme-background)`.

**Keep:** the persistent layout route (the shell doesn't remount),
permission-filtered nav, `aria-current`, Ctrl+K by `event.code` with the
open-dialog check, and the remembered rail preference.

### 2.2 Layout consistency across pages

- **[P1] Three design authorities disagree.**
  - `DESIGN.md`: Tahoma, 4/8px radii, 44px command bar, light grey nav.
  - `UI_REDESIGN.md`: Cairo, 8/12/16px radii, inset workspace.
  - The code mixes both and adds more.
  - Runtime colours also differ from both, because `configuredThemes()` always
    runs `createTheme()`.
- **[P1] Four container patterns.** `.dal-panel` (PropertiesTable), `v-card
border` (PeoplePage), a card with a header (UsersPage), and nested
  `v-card`s (`RecordNotes`, `PropertyLocationView` and `PropertyLocationEditor`
  inside the detail or form card).
- **[P2] Four grid systems.** `.form-grid`, `.rental-form-grid`, `v-row`, and
  Tailwind `md:` utilities in six files. Tailwind's 768px `md` differs from
  Vuetify's 960px, and Tailwind Preflight resets h1–h6.
- **[P2] The main action sits in different places.** In the page header
  (properties) or inside a card title (users, locations, roles).
- **[P2] Scale drift.**
  - 13 distinct radii.
  - 34 font-size declarations under 12px: 11px chips, 11px validation
    messages, 12px table cells, and 9px text on the splash recovery screen.
  - 20 hard-coded colours.
  - 4 coloured side-stripes, flagged by the detector (`side-tab`).

### 2.3 Dashboard usefulness

The work-queue idea is right, and its honesty lines ("the data can't answer
this") are a strength. These problems block it from being a 10-second read:

- **[P1] False calm.** `DashboardPage.vue:175-179` computes the priority strip
  as soon as _either_ section has loaded.
  - Overview (median 49 ms) usually beats matching (162 ms), so "لا توجد أعمال
    معلّقة… ولا طلبات مطابقة" can show and be announced (`aria-live`) before
    the matches arrive.
  - It stays permanently if matching fails or the role lacks `requests.read`.
- **[P1] Endless skeleton.** Without `requests.read` the default customers tab
  shimmers forever (`DashboardPage.vue:433-436`,
  `DecisionsPanel.vue:251,271`).
- **[P1] Dead-end chase lists.** "عروض بلا نشاط: 27" shows three examples and
  no way to the rest. Customers are capped at 8.
- **[P1] Opening an unmatched request lands on the customer page.** That page
  doesn't list requests.
- **[P2] The same counts appear in up to six places.**
  - KPI tile, priority banner ("فرصة… فتح المطابقات"), workspace toggle,
    workspace footer, rental panel, performance table.
  - The page is 1,483px tall, about 2.2 screens.
  - KPI and rental tiles use coloured stripes instead of one summary strip.
- **[P2] Match counts disagree.** The dashboard counts full matches. The
  request page counts full plus partial.
- **[P2] Mixed text forced LTR.** `.money` wraps whole strings such as "د.ع /
  شهري" (`MatchRow.vue:352`, `RentalOperations.vue:347,353`,
  `PerformanceSummary.vue:64`), which reorders the Arabic words.
- **[P2] The queue never drains.** After "تسجيل متابعة" the row looks the
  same, so two staff may call the same customer. The data supports showing the
  listing's last follow-up.
- **[P2] Focus doesn't follow.** KPI jump links scroll the page, but focus
  stays on the KPI (targets lack `tabindex`).

**Keep:**

- `useOperationsDashboard` caching and aborts.
- Required-vs-preference match reasons with no fake percentage.
- Sections hidden by permission before data arrives.
- The container-query stacking.
- The "حفظ ومطابقة" model.

### 2.4 Property and customer workflows

- **[P0]** Edit wipes the location; a rental created twice; archived customers
  are lost (section 1).
- **[P1] The customer page is not a hub.**
  - `PersonDetailsPage` shows only owned sale listings: no owned rentals, no
    purchase or rental requests, no documents.
  - It has no "new request for this customer" action, and stored fields
    (residence card, residence location) are never displayed.
  - The API already filters by `person_id` and `owner_person_id`, so this is
    renderer-only.
- **[P1] After editing you land on the list, not the record.**
  - `PropertyFormPage.vue:193,242` and `RentalFormPage.vue:130-131` go to the
    list on both save and cancel.
  - Changing status (negotiating, reserved, sold) needs the full form.
- **[P1] Entered data that is never shown.** Rental `owner_notes` appears
  nowhere, and `other_details` is hidden whenever there are notes
  (`RentalDetailsDialog.vue:220`).
- **[P1] Request amenities can never match.** `RequestManager.vue:228-236`
  stores comma-typed Arabic keys (`{"مصعد":true}`). Listings and
  `matching.rules.ts:164-170` use `elevator`, `parking` and so on. Editing a
  request also shows English keys.
- **[P1] The request flow never shows the customer's phone.**
  - `PersonPicker` shows names only, so two people with the same name can't be
    told apart.
  - There is no inline "new customer": the user must leave and lose what they
    typed.
- **[P2] Photos are added differently by listing type.** A new sale listing
  returns to the list (the form has no gallery). A new rental goes to its edit
  page (which has one).
- **[P2] Two detail containers.** A property's details are a page with a deep
  link. A rental's are a 1,120px dialog via `?open=`, and the query is never
  cleared.

Click counts from the walkthroughs:

| Workflow                                      | Steps today                                                                                                        | Main friction                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Client calls about plot X, log a follow-up    | 5 clicks, 2 context switches (sale); about 6 for a rental, because global search ignores rentals                   | No follow-up action in the summary pane; owner below the fold; phone not isolated |
| New buyer request → matches → contact         | 10+ clicks, 3 switches; a new customer means leaving the form                                                      | No phone or customer link; amenities broken; matches lost after opening one       |
| New listing → duplicate check → save → photos | 7 clicks; the plot fields that the duplicate check uses are hidden in a collapsed "optional" section at the bottom | Return to list instead of record; gallery not reachable from the form             |
| Owner opens dashboard                         | Works once both sections have loaded                                                                               | False calm; repeated numbers; no "show all"                                       |

### 2.5 Dense tables

- **[P0]** Sold/rented chips are unreadable (section 1). Reserved is 2.96:1
  (`accent` used as a tonal chip).
- **[P1] Sale and rental tables overflow at 1366px.**
  - Estimate: 14 columns need about 1,550px; available width is about
    1,078px, or 722px with the summary pane open.
  - In RTL the overflow goes to the left, so the columns lost are price,
    status and actions.
  - The horizontal scrollbar sits below the fold.
- **[P1] Rows are forced to 52px** (`styles.css:674`). DESIGN.md asks for
  about 36px.
- **[P1] Cells keep Vuetify's 16px side padding.** On 14 columns that is
  448px of padding.
- **[P2] Five icon buttons per row** (about 240px).
  - Archive (amber) sits 4px from delete (red).
  - Labels exist only as `title`, which never shows on keyboard focus.
  - The favourite button has no `aria-pressed`.
- **[P2] Raw numbers.** Areas print raw decimals ("800.00 متر"), and request
  budgets have no currency or `.money`.
- **[P3]** No sticky header; tables have no accessible name.

**Keep:** server paging with abort and latest-wins (`createPagedList`), sorting
limited to server-sortable keys, lazy fixed-size thumbnails with idle
back-fill, and the selected-row indicator.

### 2.6 Search and filtering

- **[P1] Stale district.** Changing governorate in the sale filters keeps the
  old district (`PropertyFilters.vue:179-213`): zero results, a raw id in the
  field, and a blank chip. Rentals reset correctly (`RentalFilters.vue:46-57`).
- **[P1] Hidden rental filters.** Rooms, bathrooms, floors and amenities are
  active but have no chips, so listings "disappear" with no explanation.
- **[P2] Ctrl+F checks `event.key === "f"`.** Chromium reports the Arabic
  letter on an Arabic layout, so it probably doesn't fire (untested on a real
  layout). Ctrl+K already uses `event.code`.
- **[P2] Search behaves differently on every page.**
  - Sale: live and debounced.
  - People: Enter only, and clearing doesn't reload.
  - Requests: debounced, plus a "بحث" button that does nothing extra.
  - State persistence also differs: sale filters survive navigation; rentals,
    people and requests lose theirs.
- **[P2] Mixed quick picks.** The quick picks mix a sort with filters:
  "المضافة حديثاً" is the default sort, so it is always lit and can't be
  turned off.
- **[P2] Missing status filters.** People, requests and documents have none,
  though the API accepts `status`. Open, matched and closed requests are mixed
  together.
- **[P2] Unexplained disabled button.** Export is disabled until a row is
  selected, with no explanation, and row selection is mouse-only.

**Keep:** the sale filter bar's debounce, Enter-to-apply, Esc-to-clear,
removable chips and "clear all"; separate "no data" vs "no matches" empty
states.

### 2.7 Forms and validation

- **[P0]** No unsaved-changes guard (section 1).
- **[P1] Field order fights the workflow.**
  - Plot identity (رقم القطعة, المقاطعة) is last, inside the collapsed "بيانات
    إضافية (اختيارية)" (`PropertyForm.vue:218-264`). A duplicate-plot 409
    points at hidden fields.
  - Before the required owner fields, Tab passes three "إدخال يدوي" toggles,
    the map buttons, a read-only total and nine amenity chips.
- **[P1] Save is a text button at the bottom of a 1,743px page.** There is no
  sticky action bar and no Ctrl+S (checked at runtime).
- **[P1] No required markers and no first-error focus.** The only feedback is
  a snackbar, "تحقق من الحقول المطلوبة قبل الحفظ".
- **[P1] Server validation is unreadable.**
  - The server replaces even hand-written zod messages with a generic one
    (`server.ts:40-47`).
  - The renderer joins messages without field names.
  - `PersonEditor` reads `issue.path` while the API sends `field`, so no field
    ever turns red.
- **[P1] Enter can submit twice.** `PropertyFormPage` and `RentalFormPage`
  have no `if (saving) return`. Vuetify's `loading` blocks only the pointer.
- **[P1] Digit handling.**
  - `NumberField` strips Arabic-Indic digits (`/[^\d.]/`), so a pasted
    "٢٥٠٬٠٠٠" becomes empty.
  - Phone fields store whatever was typed.
- **[P1] English errors.**
  - A network failure surfaces "Failed to fetch".
  - Excel import shows raw English zod errors, and the row numbers are
    probably off by one.
- **[P1] Settings can be overwritten.** A failed load of the scheduled-backup
  settings is swallowed, the form shows defaults, and Save overwrites the real
  settings (`ScheduledBackupSettings.vue:51-53`).
- **[P2] Edit pages show editable defaults while loading.**
- **[P2] Cleared count fields save as 0, not null.**
- **[P2] Login pre-fills "admin"**, although no default admin exists.

**Keep:**

- `RecordFollowupDialog`: guard, persistent while saving, inline error, real
  submit.
- `NumberField`'s display/model split.
- `PropertyLocationEditor`'s LTR fields and cancellable link resolution.
- Advisory matching that never blocks a save.

### 2.8 Dialogs and feedback

- **[P1] Large form dialogs can lose everything to Esc or a stray click.**
  - The request form (900px, about 770px tall) and `PersonEditor` (15 fields)
    are neither `persistent` nor `scrollable`.
  - At 125% their buttons are below the fold.
- **[P1] Focus drops to `<body>` when a dialog closes.** Dialogs open through
  v-model, and Vuetify only restores focus to an activator. 17 of 18 dialogs
  have no accessible name.
- **[P1] Errors disappear in 3.6 seconds.**
  - Hover can't pause them (`pointer-events: none`).
  - There is a single slot, so a save's confirmation is immediately replaced
    by the match count.
- **[P1] Request save and matching share one `try`.** If matching fails, the
  dialog stays open with `editing = null`, and a retry creates a duplicate.
- **[P2] Inconsistent confirmations.**
  - Archive is confirmed for listings but not for customers.
  - Starting remote access has no confirmation.
  - The restore result, which carries the safety-backup path, goes to the
    3.6-second snackbar.
  - Backup history shows "manual", "success", "pruned".

**Keep:** `useConfirm`'s single error and loading path, and `SideSheet`'s
focus return to the opener.

### 2.9 Keyboard interaction (measured)

| Check                                                    | Result                                                  |
| -------------------------------------------------------- | ------------------------------------------------------- |
| Tab presses from load to the first table row (sale list) | **26**, then **6 per row** (name link + 5 icon buttons) |
| Arrow-key movement between rows                          | none                                                    |
| Row click / Enter on a rental row                        | nothing opens                                           |
| Ctrl+K → type a code → Enter                             | works (sale listings only)                              |
| Ctrl+S in the property form                              | nothing                                                 |
| Focus after navigation                                   | `<body>`                                                |
| Image reorder, row selection                             | mouse only                                              |

### 2.10 RTL and bidi

- **[P1] Date flipped.** The person page renders "25/2026/10، 8:52:05 ص" in
  scrambled order (`/2026/10، 8:52:05 ص25`): no isolation around the
  date-time.
- **[P1] Phones not isolated.** The owner phone isn't isolated in
  `PropertyDetailsPanel.vue:235` or `RentalDetailsDialog.vue:197`, so
  "+964…" puts the plus on the wrong end.
- **[P2] Phone inputs.** Phone fields aren't `type="tel"`, so the existing LTR
  rule for tel inputs never applies.
- **[P2] English in the UI.**
  - Roles shows raw permission groups ("audit", "backups", "documents").
  - Also "Super Admin", "(Fluid Container)", "تشغيل migrations", the backup
    statuses, the Excel errors and "Failed to fetch".
  - Demo seed data adds English rental names ("apartment - المنصور") and
    amenities ("electricity", "kitchen"). Demo-only, but it appears in the
    Codel website captures.
- **[P3] Wrong arrows.** The Locations empty-state arrows point away from the
  column they refer to.

**Keep:** the Latin-digit formatters, 41 correct uses of `.money`/`<bdi>`, and
Leaflet in an LTR container with RTL popups.

### 2.11 Accessibility

Runtime contrast. Every failing pair is bold.

| Pair                                            | Light    | Dark     |
| ----------------------------------------------- | -------- | -------- |
| Body text on surface                            | 14.64    | 13.14    |
| Muted text on surface                           | 5.91     | 7.56     |
| Tonal chip "sold/rented" (`secondary`)          | **1.15** | **1.00** |
| Tonal chip "reserved" (`accent`)                | **2.96** | 5.82     |
| Summary-pane labels (0.6 opacity)               | **4.05** | 5.72     |
| Placeholder (only label on search fields)       | **2.25** | 4.46     |
| Field outline (`--v-field-border-opacity: 0.2`) | **1.48** | **1.83** |
| Focus ring on the dark-teal sidebar             | **1.87** | 6.62     |
| Top-bar search field vs bar                     | **1.08** | **1.12** |

Other issues:

- **Unlabelled controls.** 19 icon-only buttons have no name; 32 more rely on
  `title` alone; three switches have no label.
- **Small, crowded targets.** The image-strip star and delete buttons, and the
  follow-up edit and delete buttons, are 20×20 with 2px gaps.
- **Small meaningful text.** 34 declarations under 12px carry meaning.
- **Unannounced state.** Quick-filter toggles don't announce their state.
- **OS dark preference.** It is overridden on first run: `main.ts` picks dark,
  then `useThemeMode` resets to light.

### 2.12 Empty, loading and error states

- **[P1] A failed list load looks like an empty office.** The table says "لا
  توجد عروض بعد — أضف أول عرض", because `usePagedList` only shows a snackbar
  and no page passes `onError`.
- **[P1] Users page.** It shows "no users" while still loading.
- **[P1] Follow-ups.** A load error shows "لا توجد متابعات".
- **[P2] Dashboard.** A failed panel keeps shimmering. The overview has one
  page-level alert, and `overviewLoading` is never used.
- **[P2] Favourites pages.** They show the "add your first listing" empty
  text.

### 2.13 Performance on low-end Windows hardware

Ranked. The measurements come from `docs/PERFORMANCE.md`.

1. **Gallery strips decode the 3–5 MB originals.** Pending uploads are held as
   base64 strings of about 5 MB each. Measured: ten originals in table cells
   cost +50 MB of renderer memory. Fix: use `thumbnailUrl` in strips, and
   object URLs for previews.
2. **643 KB of startup CSS is parsed in both the splash and main windows.**
   About 300 KB of it is the 7,462 MDI icon rules, for 123 icons in use. Plus
   277 KB of Vuetify utilities and 403 KB of icon WOFF2. Removing the icon CSS
   made no measurable splash difference on the dev PC, so this is a later,
   measured step.
3. **Theme rebuilds.** Every mounted theme toggle adds a deep watcher that
   rebuilds both theme stylesheets. Dragging a colour picker rebuilds them N
   times per mouse move.
4. **Row weight.** About 12 components per table row: actions, favourite, 4–5
   buttons, chip, thumbnail, link. That is about 1,200 at page size 100, with
   no virtualisation.
5. **Thumbnail backfill.** It costs 16 ms of main-thread work per image, or
   48 ms with a 4× slower CPU. Fix: pass `resizeWidth` to `createImageBitmap`.
6. **Locations.** Every neighbourhood row has a switch and two buttons, with
   no virtualisation.
7. **Unused fonts.** 1.07 MB of TTF ships for fonts that are only used if
   picked in Settings (Tajawal, Almarai, IBM Plex).

**Keep:** every route lazy-loaded; xlsx and leaflet loaded on demand; the
Vuetify auto-import and WOFF2-only icon plugin (startup JS 719 → 328 KB); the
`pnpm perf` harness.

---

## 3. Design system: "Dalaly Desk" (reconciled)

One system that works inside Vuetify 3 instead of around it. It keeps what the
owner briefs made binding (`UI_ENHANCEMENTS.md`):

- the dark-teal navigation pane;
- white surfaces;
- teal and ochre;
- Cairo as the default font;
- the appearance settings.

It restores what `DESIGN.md` intended and the code lost: desktop density, no
card chrome, two radii, and one command bar. When implementation starts, this
section replaces the contradictory parts of `DESIGN.md` and `UI_REDESIGN.md`,
through `/impeccable document` at the end of phase 1.

### 3.1 Principles

1. **One surface per region; no surface on a surface.** Panels (white, 1px
   hairline, 8px radius, no shadow) sit directly on the canvas. Nothing white
   sits on white.
2. **The command bar owns the page.** Title, record context, status and page
   actions live in one 48px bar. No page header, no subtitle, no in-content
   breadcrumbs.
3. **Data first above the fold.** At 1366×688 a list shows at least 10 rows,
   and a record shows identity, price, status and owner without scrolling.
4. **Keyboard is a first-class path.** Every list, form and dialog works
   without the mouse, and the shortcuts are discoverable (tooltips and Help).
5. **Colour carries state, not decoration.** Teal means action, selection or
   location. Ochre means "waiting on a human". Sage means settled. Red means
   destructive or error. No coloured stripes, no gradients, no decorative
   badges.
6. **Honest states.** Loading, empty, no-match and error are four different
   things on every data surface.

### 3.2 Tokens

Colour roles are Vuetify theme colours. Layout and scale are `--dal-*` CSS
variables in `styles.css`. User-customised themes keep deriving from these
through `createTheme()`.

**Colour (light / dark)**, keeping today's values unless noted:

| Role                     | Light                    | Dark                     | Use                                         |
| ------------------------ | ------------------------ | ------------------------ | ------------------------------------------- |
| `background` (canvas)    | #F3F5F6                  | #142428                  | Behind panels, command bar                  |
| `surface` (panel)        | #FFFFFF                  | #192C30                  | Panels, dialogs, menus, inputs              |
| `surface-variant`        | #E8EEF0                  | #213B40                  | Table header, hover, selected-quiet         |
| `sidebar` / `on-sidebar` | #193638 / #FFFFFF        | same                     | Navigation pane                             |
| `border` (hairline)      | #DDDFE0                  | #355057                  | Panel and divider strokes (decorative)      |
| `field-outline` **new**  | on-surface at 50% (≥3:1) | on-surface at 40% (≥3:1) | Input outlines, checkbox and switch tracks  |
| `primary`                | #116466                  | #74C8C0                  | Primary buttons, links, selection, focus    |
| `accent` (ochre fill)    | #C27C3A                  | #E7AE77                  | Fills and large text only, never small text |
| `warning`                | #8A5A1F                  | #D8A15F                  | Waiting: reserved, negotiating, scheduled   |
| `info` (sage)            | #5B6F62                  | #9DB5A7                  | Settled: sold, rented                       |
| `success`                | #2F6D4F                  | #7FC9A3                  | Matched, confirmations                      |
| `error`                  | #B3261E                  | #FFB4AB                  | Destructive, errors                         |
| `muted` (derived)        | ≥5.9:1 on surface        | ≥7.5:1                   | Secondary text                              |

**One status map**, in `constants/` and used by `StatusChip` for every domain:

- available → `primary`
- reserved, negotiating, scheduled → `warning`
- sold, rented → `info`
- matched → `success`
- archived, closed, inactive → neutral (muted text on `surface-variant`)
- error or expired → `error`

**Focus:** a 2px outline with a 2px offset, in `primary` on surfaces and
`on-sidebar` inside the nav pane.

**Type** (Cairo by default, still selectable in Settings; every size
multiplied by `--dal-font-scale`):

| Token                | Size / weight / line-height | Use                                                                             |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `--dal-text-xs`      | 12px / 400 / 1.5            | Secondary metadata only (timestamps, counts). Never the sole carrier of meaning |
| `--dal-text-sm`      | 13px / 400–600 / 1.5        | Table cells, field labels, nav items, chips, validation messages                |
| `--dal-text-md`      | 14px / 400 / 1.6            | Inputs, detail values, prose                                                    |
| `--dal-text-lg`      | 16px / 700 / 1.4            | Page title (command bar), dialog title                                          |
| `--dal-text-section` | 14px / 700 / 1.4            | Panel and section headers                                                       |
| `--dal-text-kpi`     | 20px / 700 / 1.2            | Summary-strip values, record price                                              |

- Numbers use `font-variant-numeric: tabular-nums` where the font supports it
  (to be confirmed for Cairo during phase 1).
- Numbers go through `utils/format.ts`. Latin data goes in `<Num>`, `<Money>`
  or `<Phone>` components, which isolate only the Latin part.

**Space:** a 4px base, using the existing `--dal-space-1…6` tokens (4, 8, 12,
16, 20, 24), which currently have zero uses.

- Canvas gutter 12px, 16px above 1440px.
- Panel header padding 8px 12px; panel body 12px 16px.
- Table cell side padding 8px.

**Shape:**

- `--dal-radius-control` **4px**: buttons, inputs, chips, nav items.
- `--dal-radius-panel` **8px**: panels, dialogs, menus.
- Nothing else; pills only for numeric count badges.

**Elevation:** none at rest. A single `--dal-shadow-pop` for menus, dialogs,
tooltips and the snackbar.

**Density** (desktop metrics):

| Element            | Metric                                                            |
| ------------------ | ----------------------------------------------------------------- |
| Command bar        | 48px                                                              |
| Navigation pane    | 232px expanded / 56px rail; item 36px                             |
| Buttons            | 32px (`density="comfortable"`); icon buttons 32px with 18px icons |
| Fields             | 40px (`density="compact"`, outlined), `hide-details="auto"`       |
| Table header / row | 36px / 40px with a 28px thumbnail (36px when thumbnails are off)  |
| Panel header       | 40px                                                              |

**Motion:** colour and opacity only, 150ms, standard easing. No layout
animation. Instant under `prefers-reduced-motion`.

### 3.3 Vuetify mapping

`main.ts` defaults (replacing today's `rounded: "lg"` and the commented-out
blocks):

```ts
const field = { variant: "outlined", density: "compact", rounded: true, hideDetails: "auto" };
defaults: {
  global: { ripple: false },
  VTextField: field, VSelect: field, VAutocomplete: field, VCombobox: field,
  VTextarea: field, VNumberInput: field, VFileInput: { ...field, prependIcon: "" },
  VBtn: { variant: "flat", density: "comfortable", rounded: true },  // 32px, 4px
  VChip: { rounded: true, size: "small", variant: "tonal" },
  VCard: { variant: "flat", rounded: "lg", border: true },          // discouraged: use .dal-panel
  VDialog: { scrollable: true },
  VDataTableServer: { density: "compact", hover: true, fixedHeader: true,
                      itemsPerPageOptions: [25, 50, 100] },
  VList: { density: "compact" }, VTabs: { height: 40 },
  VTooltip: { location: "top", openDelay: 400 },
  VSnackbar: { location: "bottom start" },
}
```

Button hierarchy:

- One `color="primary"` flat button per area.
- Secondary actions are `variant="tonal"`.
- Tertiary actions are `variant="text"`.
- Destructive actions are `color="error" variant="text"`, normally inside a
  menu.

### 3.4 Keyboard map (global contract)

| Keys                           | Action                                                                        | Scope                   |
| ------------------------------ | ----------------------------------------------------------------------------- | ----------------------- |
| Ctrl+K                         | Global search across sale and rental listings, customers and requests         | Everywhere              |
| Ctrl+F                         | Focus the page's own search field                                             | List pages              |
| Ctrl+N                         | New record of this page's type                                                | List pages              |
| Ctrl+S                         | Save                                                                          | Forms (page and dialog) |
| Esc                            | Close the dialog or pane; clear search; leave a form only via the dirty guard | Everywhere              |
| ↑ / ↓, Home / End, PgUp / PgDn | Move between rows (one row in the tab order)                                  | Tables                  |
| Enter                          | Open the focused row                                                          | Tables                  |
| Space                          | Select the row (summary pane, export)                                         | Tables                  |
| Shift+F10 / Menu key           | Row actions menu                                                              | Tables                  |
| Alt+←                          | Back to the list, with the same row focused                                   | Record and form pages   |
| F1                             | Help and shortcuts                                                            | Everywhere              |

Every shortcut is matched with `event.code`, so it works on the Arabic layout.
None fires while a dialog is open. Each one shows in its control's tooltip and
on the Help page.

---

## 4. Common shell

```
RTL: reading starts at the right
┌──────────────────────────────────────────────────────────────────────────┬──────────────┐
│ ⓤ  ☾  │🔍 بحث شامل… (Ctrl+K)│   ⋯  [استيراد]  [+ إضافة عرض]   عروض البيع  11 │ ≡  دلالي     │ 48px command bar
├──────────────────────────────────────────────────────────────────────────┤──────────────┤
│  canvas, 12px gutter                                                     │ لوحة التحكم  │
│  ┌ panel ─────────────────────────────────────────────────────────────┐  │ العقارات     │
│  │ toolbar: search · المحافظة · النوع · الحالة · المزيد ·  chips · ترتيب │  │  عروض البيع  │
│  ├────────────────────────────────────────────────────────────────────┤  │  …           │
│  │ table (sticky header, 40px rows)                                   │  │              │
│  ├────────────────────────────────────────────────────────────────────┤  │              │
│  │ footer: 1–25 من 120 · عدد الصفوف                                    │  │ المساعدة     │
│  └────────────────────────────────────────────────────────────────────┘  │              │
└──────────────────────────────────────────────────────────────────────────┴──────────────┘
```

- **`AppLayout`.** The nav pane, then the command bar, then
  `<main id="main" tabindex="-1">` directly on the canvas. The inset workspace
  card and its 16px radius are removed.
  - The `appearance.fluid` and `maxWidth` setting still applies, to the main
    area.
- **Command bar (`AppTopbar`).**
  - At the start (right), from the outside in: nav toggle, then the page title
    as the `h1`.
  - On record pages the title carries its context: a link to the parent list,
    "عروض البيع ‹", then the record name and a status chip.
  - Then the page actions, teleported from `AppPage`'s `#actions` slot: one
    primary, secondary actions, and a "⋯" overflow.
  - At the end (left): global search, theme toggle, user menu.
  - Under 1280px the search collapses to an icon button that opens the same
    search, and secondary actions fold into "⋯".
- **`AppPage` v2.** Props `title`, `parent`, `count`, a `status` slot and an
  `actions` slot (teleported).
  - On route change it moves focus to the h1 (`tabindex="-1"`) and sets
    `document.title`.
  - `subtitle` and the in-content `PageHeader` are removed; any useful
    subtitle text moves to the Help page.
- **Navigation pane.**
  - Expanded by default, so labels are visible to new staff. The rail stays
    available and remembered.
  - 36px items, section headers at 12px, focus ring in `on-sidebar`.
  - The user footer is removed (the command bar's user menu keeps name,
    settings, change PIN and logout).
  - "المساعدة" moves to the footer.
  - The two favourites entries can fold into the list pages' "المفضلة" view
    (decision D5). Routes stay as redirects.
- **Skip link.** "تخطَّ إلى المحتوى" is the first tab stop.
- **Global search (`GlobalSearch`).**
  - A command-palette overlay on Ctrl+K or a click.
  - Debounced at 250ms, it queries existing list endpoints in parallel: sale,
    rentals, people, both request types, `q` and `limit=5` each.
  - Results are grouped, with code, plot and phone shown and matches marked.
    ↑/↓/Enter open the record, and "عرض كل النتائج" opens the filtered list.
  - It no longer shares state with the page search. No API change.

---

## 5. Reusable patterns (component inventory)

New or reshaped shared components, and which pages use them:

| Component / composable                                                                                                                                                                                                                                                          | Replaces                                                         | Used by                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| `AppPage` v2 + teleported actions                                                                                                                                                                                                                                               | `PageHeader`, the subtitle, in-content breadcrumbs, back buttons | every page                                             |
| `GlobalSearch`                                                                                                                                                                                                                                                                  | the top-bar text field                                           | shell                                                  |
| `DataPanel` (`.dal-panel` with toolbar, body and footer regions)                                                                                                                                                                                                                | `v-card border`, filter and results cards                        | all lists                                              |
| `FilterBar` (search, inline primary filters, "المزيد" drawer, chips built from one field list, count, sort, quick views with `aria-pressed`)                                                                                                                                    | `PropertyFilters`, `RentalFilters` and the ad-hoc search rows    | sale, rentals, people, requests, documents, favourites |
| `useListState` (filters, page and sort ↔ URL query; survives navigation)                                                                                                                                                                                                        | module state in `useProperties`, page-local refs                 | all lists                                              |
| `DataGrid` (wraps `VDataTableServer`: sticky header, column priority and widths, roving-tabindex rows, Enter/Space/Shift+F10, skeleton / empty / no-match / error-with-retry states, `aria-label`)                                                                              | per-page tables                                                  | all tables                                             |
| `RowActions` (up to two inline icon actions with `aria-label` + tooltip; the rest in one shared "⋯" menu with text labels; destructive items last, after a divider)                                                                                                             | 3–5 icon buttons per row                                         | all tables                                             |
| `StatusChip` (`domain` prop, one status map)                                                                                                                                                                                                                                    | inline chips in People, Documents, Users, details                | everywhere                                             |
| `Money`, `Num`, `Area`, `Phone` (isolate the Latin part only; `Phone` adds call / copy / WhatsApp), `DateTime`                                                                                                                                                                  | `.money` on whole strings, raw `{{ }}`                           | everywhere                                             |
| `RecordHeader` (identity strip: code, type, plot identity, location, price, status menu, owner + `Phone`)                                                                                                                                                                       | duplicated titles and the two price blocks                       | property, rental, customer, request pages              |
| `DetailList` (`dl` grid, 2–4 columns, 32px rows, label 13px muted, value 14px)                                                                                                                                                                                                  | 76px label/value rows                                            | detail pages, side panes                               |
| `FormSection` (fieldset + 14px header + `.form-grid` 3/2/1 columns)                                                                                                                                                                                                             | nested cards, four grid systems                                  | all forms                                              |
| `FormActionsBar` (sticky: Save as primary, "حفظ وإضافة آخر", Cancel, unsaved-changes dot)                                                                                                                                                                                       | bottom text buttons                                              | page forms                                             |
| `useDirtyForm` (snapshot, route guard, `beforeunload`, sessionStorage draft before idle logout, Ctrl+S, saving guard)                                                                                                                                                           | nothing today                                                    | all forms                                              |
| `useApiFormErrors` (maps `issues[].field` and `DUPLICATE_PLOT` to fields; focuses the first error)                                                                                                                                                                              | snackbar-only errors                                             | all forms                                              |
| `FormDialog` (scrollable; persistent while dirty or saving; autofocus first field; submit inside `v-form`; focus returns to the opener; `aria-labelledby`)                                                                                                                      | ad-hoc dialogs                                                   | follow-up, customer, user, role, location, PIN         |
| `SidePanel` (from `SideSheet`; also the summary pane overlay at ≤1100px with focus trap and Esc)                                                                                                                                                                                | `MasterDetailLayout` overlay, 1,120px rental dialog              | previews, quick edit                                   |
| `useFocusReturn`                                                                                                                                                                                                                                                                | nothing today                                                    | every dialog and pane                                  |
| `normalizeDigits`, `PhoneField`, integer `CountField` (empty → null), `AmenityPicker`, `OwnerFields` (person picker that fills name and phone, shows phone in results, "new customer" inline), `ListingImages` (one gallery: thumbnails, object-URL previews, keyboard reorder) | divergent copies                                                 | forms                                                  |
| `SummaryStrip` (one bordered row of label / value / delta with vertical hairlines)                                                                                                                                                                                              | KPI tiles with stripes, rental tiles                             | dashboard                                              |
| `InlineState` (empty / no-match / error + retry, compact, inside the data area)                                                                                                                                                                                                 | `EmptyState` misuse                                              | everywhere                                             |
| Snackbar queue (success 4s, error persistent with close, hover pauses)                                                                                                                                                                                                          | single 3.6s slot                                                 | everywhere                                             |

---

## 6. Page-by-page plan

| Page                                           | Pattern                  | Main changes                                                                                                                                                                                                                                                                                                                                                                    | Priority                     |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **عروض البيع** `/properties`                   | List                     | One panel; ~9 columns (name over code, type, district · neighbourhood, plot, area, price, status, actions; frontage, nazal and owner move to the pane); 40px rows; `FilterBar` with governorate reset and every chip; quick views separate from sort; keyboard rows; four states; the export reason explained                                                                   | **P1 – representative page** |
| **تفاصيل العقار** `/properties/:id`            | Record                   | `RecordHeader` (plot identity, price once, status menu, owner + phone); `DetailList` in 3 columns; tabs التفاصيل · الصور · الموقع · المتابعات · الملاحظات · السجل; "تسجيل متابعة" in the header; gallery via `ListingImages`; history loaded on tab open                                                                                                                        | P1                           |
| **إضافة/تعديل عقار**                           | Form page                | Sections in workflow order: الهوية (type, legal type, مقاطعة, رقم القطعة, name optional, status) → الموقع → المساحة والسعر → المالك → المميزات → أبعاد الأرض → ملاحظات; duplicate-plot check on blur of the plot fields (existing search API), shown inline; sticky actions; Ctrl+S; dirty guard; first-error focus; after save → record page; gallery section on the edit page | P0 fixes / P1 layout         |
| **عروض الإيجار** `/rentals`                    | List                     | Same `DataGrid`/`FilterBar`; amenities column dropped (shown in the pane); chips for every filter; state kept in the URL; row opens the record                                                                                                                                                                                                                                  | P1                           |
| **تفاصيل الإيجار**                             | Record                   | New renderer route `/rentals/:id` with the same layout as the property page; `?open=` redirects; all three notes fields shown; owner linked                                                                                                                                                                                                                                     | P1                           |
| **إضافة/تعديل إيجار**                          | Form page                | Same `FormSection`s; the stale-form/duplicate fix; after save → record                                                                                                                                                                                                                                                                                                          | P0 fix / P1 layout           |
| **المفضلة / مفضلة الإيجارات**                  | List view                | Either the "المفضلة" quick view on the list pages (D5), or the same `DataGrid` with the correct empty text; reuse `usePropertyActions`                                                                                                                                                                                                                                          | P2                           |
| **الزبائن** `/people`                          | List                     | Status filter (نشط/مؤرشف/الكل); archive confirmation + undo; live search like the other lists; phone column via `Phone`; no avatars; one term, الزبائن                                                                                                                                                                                                                          | P0 fix / P1                  |
| **ملف الزبون** `/clients/:id`                  | Record hub               | `RecordHeader` (name, code, type, phones with call/copy, status); tabs: الطلبات (both types, with "طلب جديد لهذا الزبون") · العقارات المملوكة (sale + rental) · المستندات · الملاحظات · البيانات; stored residence fields shown; dates isolated. All through existing `person_id` / `owner_person_id` filters                                                                   | P1                           |
| **طلبات الشراء / الإيجار**                     | List + form              | `FilterBar` with status and match filters; a customer column with phone; row opens a read-only request view with matches, and edit is a separate action; form as a page or `SidePanel` with `OwnerFields` (inline new customer) and `AmenityPicker`; save and matching in separate `try`s; budget as `Money`                                                                    | P1                           |
| **لوحة التحكم**                                | Work queue               | A `SummaryStrip` replaces the KPI tiles and the "فرصة" banner; the priority strip waits for every permitted section; each chase category gets "عرض الكل" to a filtered list; counts shown once; "آخر متابعة" on match rows; per-panel error + retry; jump links move focus; target ≤1.3 screens at 1366×688                                                                     | P1                           |
| **المستندات**                                  | List + dialog            | A separate "إضافة مستند" `FormDialog` (person, type, number, file, expiry) instead of the filter row doubling as the upload form; name, expiry and status columns; archived shown correctly; one nav and page name                                                                                                                                                              | P2                           |
| **المستخدمون / الأدوار**                       | Admin lists              | `DataGrid`, `RowActions` with names; Arabic labels for permission groups and keys (a constants map; "Super Admin" shown as "مدير النظام" — keep the stored name); save as one guarded flow                                                                                                                                                                                      | P2                           |
| **المحافظات والمناطق**                         | Three-column master list | Named switches and buttons, correct arrows, a virtualised neighbourhood list                                                                                                                                                                                                                                                                                                    | P2                           |
| **الإعدادات**                                  | Settings                 | Left-aligned sections in one panel per tab; disabled fields without `settings.update`; confirmation before starting remote access; backup history in Arabic; a persistent restore result with a copy-path action; scheduled-backup load error blocks Save; appearance: presets first, custom colours under "متقدم", "(Fluid Container)" removed                                 | P2                           |
| **المساعدة**                                   | Read                     | Rewritten for every module + a keyboard-shortcuts table                                                                                                                                                                                                                                                                                                                         | P2                           |
| **تسجيل الدخول / الإعداد الأول / خطأ التشغيل** | Auth                     | No "admin" pre-fill; errors shown once; per-step validation in the wizard; Arabic stage names; splash recovery text ≥13px                                                                                                                                                                                                                                                       | P2                           |

---

## 7. Phases, priorities and acceptance criteria

Each phase ends with the verification protocol (section 8) and a separate
commit series, so it can be reviewed and reverted on its own.

**Phase 0: data-safety fixes (renderer only, small, before any visual
change).**

- LocationSelects reset only on user change.
- Rental create → `router.replace` to the record, with the instance reset on
  route-param change.
- People: archive confirm, undo, status filter.
- Status-chip map: sold/rented → `info`, reserved → `warning`.
- Submit guards on Enter.
- Request amenities → `AmenityPicker`; request save and matching in separate
  `try`s.
- Priority strip waits for every permitted section.
- Scheduled-backup load error blocks Save.

_Accept:_ each defect has a scripted reproduction against the demo that fails
before the fix and passes after; `pnpm lint`, `pnpm test` and `test:contract`
pass.

**Phase 1: foundation, shell and the representative page (عروض البيع).**

- Tokens and Vuetify defaults; contrast fixes (field outline, placeholder,
  sidebar focus ring).
- Tailwind removed (six files converted to Vuetify utilities); dead CSS and
  commented code removed.
- Shell: command bar, flush canvas, nav expanded by default, skip link, focus
  on navigation, `GlobalSearch`.
- Shared components: `AppPage` v2, `DataPanel`, `FilterBar`, `useListState`,
  `DataGrid`, `RowActions`, `StatusChip` v2, `Money`/`Num`/`Area`/`Phone`,
  `InlineState`, snackbar queue.
- The sale list rebuilt on them.

_Acceptance criteria for the sale list:_

- **1366×688, nav expanded:** no horizontal scroll; price, status and actions
  visible; **≥10 rows** above the fold.
- **1366×688, nav as rail:** ≥11 rows.
- **1093×550 (125%):** no horizontal scroll; **≥6 rows**.
- **Keyboard:** from load, Ctrl+F → type a plot number → ↓ → Enter opens the
  record → Alt+← returns with filters, page and the same row focused. Every
  row action is reachable in ≤3 keystrokes from its row. From load, the first
  row is ≤4 keystrokes away (skip link → Tab → ↓, or Ctrl+F → ↓). _(Revised
  in phase 1 from "≤8 tab stops": with labelled navigation and sortable
  column headers that count is about 24, and the shortcut paths are what the
  criterion is for.)_
- **Both themes:** text ≥4.5:1, field outlines, focus rings (including in the
  nav) and chips ≥3:1 / 4.5:1, measured on screenshots.
- **States:** skeleton rows while loading; a failed load shows the error with
  retry (never "no listings"); "no data" and "no matches" are distinct.
- **Integrity:** zero detector findings in touched files; `pnpm lint`
  (includes typecheck), `pnpm test` and `test:contract` pass; no API or schema
  change.
- **Performance:** `pnpm perf` startup and renderer memory within 5% of the
  phase-0 baseline; components per row ≤6.

**Phase 2: property record and form.**

- `RecordHeader`, `DetailList`, `ListingImages` (thumbnails, object URLs,
  keyboard reorder).
- `FormSection`, `FormActionsBar`, `useDirtyForm`, `useApiFormErrors`,
  `normalizeDigits`, `PhoneField`, `CountField`.

_Accept:_

- **Record page:** identity, plot, price, status and owner visible without
  scrolling at 1366×688 and 1093×550.
- **Form:** Ctrl+S saves; leaving dirty asks first; the first invalid field is
  focused; plot identity is in the first section; at most 20 tab stops to
  reach the owner fields.
- **Data:** an edit round-trip preserves every field (scripted compare of the
  API record before and after an untouched save).

**Phase 3: rentals** (list, `/rentals/:id` record, form) on the same parts;
unified follow-ups component. _Accept:_ the sale-list and record criteria
apply as written; `?open=` links still work.

**Phase 4: customers and requests.** People list, customer hub, request list
and request form (`OwnerFields`, `AmenityPicker`). _Accept:_ workflow (b) in at
most 6 clicks with no context switch to People; a customer's requests,
listings and documents are reachable from the customer page.

**Phase 5: dashboard.** `SummaryStrip`, one count per fact, settled priority
strip, "عرض الكل" links, last follow-up, per-panel errors. _Accept:_ at
1366×688 the owner sees counts and the top three actions without scrolling;
the page is ≤1.3 screens tall; the strip never states calm before every
permitted section has loaded (scripted with a delayed matching response).

**Phase 6: system pages.** Documents, users, roles, locations, settings, help,
login, setup, splash. _Accept:_ no English UI strings (a grep for Latin words
in templates, excluding data and codes); every control named.

**Phase 7: documentation and full regression.** `/impeccable document` to
regenerate `DESIGN.md` and its sidecar from the shipped code; retire the
contradicting parts of `UI_REDESIGN.md`; record before/after measurements in
`docs/PERFORMANCE.md`; a full screenshot set in both themes and both scalings.

---

## 8. Verification protocol (every page)

1. **Screenshots** of the page (and its dialogs and panes) at 1366×688 in light
   and dark, with the nav expanded and as a rail, and at 1093×550. Compared
   against the "before" set.
2. **RTL check.**
   - Icon sides and arrow directions.
   - Dialog button order: primary first in reading order, group at the inline
     end.
   - Number, phone, date and code isolation.
   - A grep of the rendered DOM for Latin words outside data.
3. **Keyboard script.** Tab count to the first data element, the documented
   shortcuts, focus after open and close of every dialog and pane, and no
   focus on `<body>` after any action.
4. **Accessibility.** Accessible names on all controls (Playwright `getByRole`
   with names); contrast pairs checked from rendered colours; the
   reduced-motion run.
5. **Regression.**
   - `pnpm lint`, `pnpm test`, `pnpm --filter @dalaly/server test:contract`.
   - The phase-0 data-safety scripts.
   - An untouched-save round-trip on every form.
   - `pnpm build`.
6. **Electron.** The same page in the real desktop window (`pnpm dev`, or a
   packaged build with `pnpm perf`), to check native dialogs, the window frame
   and Windows font rendering.
7. **Performance.** `pnpm perf` against the previous phase.

---

## 9. Outside renderer scope: needs owner approval

- **Field-level server messages.** `server.ts:40-47` replaces the hand-written
  Arabic zod messages with a generic one. Field mapping (`useApiFormErrors`)
  works with the field names it receives, but the messages stay generic until
  the server keeps them.
- **A "stale" filter on the listing endpoints** for the dashboard's "عرض الكل"
  on listings without activity. Until then the link can open the list sorted
  by "آخر تحديث" ascending, which is an approximation and must be labelled as
  one.
- **Demo seed data.** Arabic rental names and known amenity keys
  (`server/src/infrastructure/database/seed.ts:535`, `seed.data.ts`). Demo
  only, but it appears in the website captures.

## 10. Owner decisions

Decided on 2026-10-25:

- **D1.** Phase 0 first, then phase 1.
- **D2.** Title and actions in one command bar; the inset workspace card is
  removed.
- **D3.** Navigation pane expanded by default; the rail stays available and
  remembered.
- **D4.** Table thumbnails at 28px in 40px rows.

Still open:

- **D5.** Favourites: a view on the list pages, with the nav entries removed
  (recommended), or keep the separate pages. Decide before phase 3.

## 11. Phase 0 record (2026-10-25)

Renderer-only fixes. Each one was reproduced against the web demo first and
passes its scripted check afterwards.

| Fix                                   | Change                                                                                                                                                                                                                                         | Check                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Edit wiped district and neighbourhood | `LocationSelects` resets children only in the user's own select handlers; loaded hand-typed locations open in manual mode                                                                                                                      | Untouched save keeps 467/45; changing governorate by hand still clears the district     |
| Rental created twice                  | After create the page becomes `/rentals/:id/edit` (`router.replace`) before matching; the form reloads on route-param change; Enter double-submit guard on both forms                                                                          | Page title "تعديل" after create; two saves create one rental                            |
| Archived customers unrecoverable      | Archive asks first and says where to find the record; status filter (الحاليون / نشط / غير نشط / المؤرشفون) through the existing `status` parameter                                                                                             | Archived row leaves the default list, appears under «المؤرشفون», restore works          |
| Sold/rented chips unreadable          | `statusColor`: sold/rented → `info`, reserved → `warning`, matched → `success`                                                                                                                                                                 | Rendered chip contrast ≥4.61 (light) and ≥5.15 (dark)                                   |
| Unsaved changes lost                  | `useDirtyForm`: confirm before leaving a dirty form; idle logout and 401 save a session draft and return to the page after login, where `DraftNotice` offers it; request and customer dialogs stay open on Esc or an outside click once edited | Dirty leave asks; idle logout → login → same form → draft restored; dialog survives Esc |
| Request amenities never matched       | Chip group over `AMENITY_OPTIONS`; stored free-text names map to keys where they match a label, and unknown ones are kept as removable chips                                                                                                   | Saved payload `{"parking":true,"elevator":true}`                                        |
| Request duplicated on retry           | Save and matching in separate `try`s; the dialog becomes the saved request's edit form                                                                                                                                                         | —                                                                                       |
| False "nothing pending"               | The priority strip waits for every permitted section; the calm text names only what was checked; a failed section is reported instead of calm                                                                                                  | With matching delayed 2.5s the strip stays a skeleton                                   |
| Scheduled-backup settings overwritten | A failed load shows an error with retry and disables Save                                                                                                                                                                                      | Desktop only; not exercised in the web demo                                             |
| `PersonEditor` field errors           | Reads `issues[].field`                                                                                                                                                                                                                         | —                                                                                       |

Deferred to phase 2: protecting the Electron window close (it needs a
`will-prevent-unload` handler in `apps/desktop`, since cancelling
`beforeunload` there blocks the close with no prompt), and an undo action on
archive (it needs the snackbar queue).

Checks: `pnpm test` 40/40, `test:contract` 67/67, ESLint and all typechecks
clean. `pnpm lint` as a whole fails only on the untracked vendored scripts in
`.github/skills/impeccable/scripts/`, which predate this work.

## 12. Phase 1 record (2026-10-25)

### What changed

- **Tokens and defaults.**
  - Two radii, 4px controls and 8px containers; Vuetify `rounded: true` for
    fields, buttons and chips.
  - `--dal-bar-height` 48, `--dal-row-height` 40, `--dal-head-height` 36,
    `--dal-cell-px` 8, `--dal-gutter` 12 (16 from 1440px), `--dal-scrim`.
  - A 12px floor for chips and validation messages; default page size 25.
  - Twelve unused global classes removed, along with the commented duplicates
    in `main.ts` and `theme.ts`.
  - `hideDetails: "auto"` stays commented out as the owner left it; toolbars
    pass `hide-details` themselves.
- **Contrast**, measured on the rendered page:

  | Check                             | Light | Dark  |
  | --------------------------------- | ----- | ----- |
  | Field outline                     | 3.06  | 3.36  |
  | Placeholder                       | 5.89  | 7.53  |
  | Focus ring in the navigation pane | 11.67 | 11.67 |
  | Status chips                      | ≥4.61 | ≥5.15 |

- **Shell.**
  - One 48px command bar: the title is the page's `h1`, plus parent link,
    result count, and teleported status and actions.
  - Global search, theme, refresh, and a user menu that holds settings, help
    and logout.
  - Panels sit on the canvas; the inset workspace card is gone.
  - Skip link; focus moves to the page title on navigation.
  - Alt+← goes back, F1 opens Help.
  - The navigation pane is expanded by default. It is a single tab stop with
    arrow keys; its focus ring uses `on-sidebar` and it takes its colour from
    the theme's `sidebar` role.
- **`GlobalSearch` (Ctrl+K).** Sale and rental listings, customers, purchase
  and rental requests, through the existing paged endpoints (5 per type,
  permission-filtered), with combobox keyboard handling and "كل نتائج عروض
  البيع".
- **`DataGrid`.**
  - Roving-tabindex rows: ↑/↓, Home/End, PgUp/PgDn, Enter, Space, and
    Shift+F10 for a menu of every action.
  - Focus returns to the opened row after Alt+←.
  - Columns hide by priority through `rem` container queries.
  - Four states: first-load skeleton, error with retry, no-match with "مسح
    الفلاتر", empty.
  - Rows stay visible while reloading, where before Vuetify swapped them for
    the loading slot.
  - Sticky header and visible footer; one shared row menu.
- **`RowActions`.** Up to two inline icons with `aria-label` and a native
  title; the rest in "المزيد", with destructive actions last after a divider.
  Row export moved here from the disabled header button.
- **Snackbar queue.** Errors stay until closed, others last 4 s, and messages
  can carry an action.
- **Sale list.**
  - Nine columns, with the currency in the price header.
  - The toolbar is one row of filters plus a row for quick views, chips,
    "فلاتر إضافية" with a count, and a sort menu.
  - Fixed: the governorate change now resets district and neighbourhood, and
    Ctrl+F works by `event.code` (Arabic layout) and not inside dialogs.
  - Empty filter values no longer float their labels.
  - Ctrl+N opens a new listing.
  - The pane offers "تسجيل متابعة". Its labels are at the muted token, the
    code is isolated, and areas show without ".00".
  - As an overlay (≤1100px) the pane opens from the inline end, takes focus,
    and closes with Esc.

### Results

| Criterion                     | Result                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1366×688, nav expanded        | 10 rows, no horizontal or page scroll                                                                                                                                                                                                             |
| 1093×550 (125%), nav expanded | 7 rows, no horizontal or page scroll                                                                                                                                                                                                              |
| Keyboard                      | 17 scripted checks pass (skip link, nav roving, Ctrl+F → ↓ → Enter → Alt+← back to the same row with filters, arrows/Home/End, Shift+F10 lists every action, Esc returns focus, Space opens the pane, Esc closes it, Ctrl+K across types, Ctrl+N) |
| Accessible names              | 0 unnamed buttons or links on the page                                                                                                                                                                                                            |
| Detector                      | 0 findings in phase 1 files; the remaining ones are in `PropertyLocationMap.vue` (phase 2)                                                                                                                                                        |
| Checks                        | ESLint and all typechecks clean, `pnpm test` 40/40, `test:contract` 67/67, `vite build`                                                                                                                                                           |

**Performance.** `main` vs this branch, web-demo builds, same API and 131
listings, Chromium with 4× CPU throttling, 4 alternating runs, medians:

| Metric                | Same page size (10) | As shipped (25)      |
| --------------------- | ------------------- | -------------------- |
| First rows after load | −4%                 | +22% (2.5× the rows) |
| Render 100 rows       | −19%                | +3%                  |
| Search to one row     | +12%                | +8%                  |
| Long tasks            | +5%                 | +33%                 |
| JS heap               | −30%                | −28%                 |
| DOM nodes / per row   | −19% / −21%         | −19% / −21%          |

The first-load cost of the shipped build comes from showing 25 rows instead
of 10: about +0.4 s on first paint at 4× throttling, in exchange for a
screen-full of rows. The first measurement put two `v-tooltip`s in every row
and rendering 100 rows cost +27%; they were replaced by `aria-label` plus a
native title. Search remains about 12% slower (about 70 ms throttled), which
is still unexplained. `pnpm perf` against packaged builds was not run, because
a `pnpm dev` instance holds port 34567.

### Deferred

- **Tailwind removal** moves to phase 7. Its Preflight reset still styles pages
  that have not been migrated; removing it now would change all of them at
  once.
- **`useListState`** (filters in the URL): the sale list already keeps
  filters, page and sort across visits in module state. URL sync comes with
  the rental and request lists.
- **`DataPanel`, `FilterBar`, `Money`/`Phone`:** extracted when a second list
  uses them (phase 3), from `PropertyFilters` and the table cells.

## 13. Phase 2 record (2026-10-25)

### What changed

- **Record page (`/properties/:id`).**
  - The command bar carries the code and status, one primary "تعديل",
    "تسجيل متابعة", export, and a "⋯" menu for archive, restore and delete.
    There are no breadcrumbs.
  - `RecordFacts` strip: price with the unit price, plot, location with its
    landmark, the owner with call and WhatsApp links (`PhoneLink`), and area
    with type and legal status. The plan's `RecordHeader` became this strip
    plus the command bar's status slot.
  - Tabs التفاصيل · الموقع · المتابعات · الملاحظات · السجل beside a fixed
    الصور panel (not a tab, so the photos stay in view). Details use
    `DetailList` sections and hide empty items. History loads when its tab
    first opens.
  - A follow-up recorded from the command bar appears in its tab without a
    reload.
- **Photos (`PropertyImages`).**
  - The strip uses the thumbnail endpoint and falls back to the original.
    For users who manage photos, a missing thumbnail is made in idle time,
    as the list does.
  - Previews use object URLs, and uploads leave the queue one by one.
  - Ctrl+→/← reorders, with focus kept on the moved photo.
  - Star and delete are small named buttons, and a load error is shown.
- **Follow-ups tab.** Load errors are shown. The dialog is a real form
  (Enter submits) and stays open while saving. Named edit and delete buttons;
  an icon replaces the emoji.
- **Form (`/properties/new`, `/:id/edit`).**
  - Sections, as `FormSection` fieldsets: الموقع والقطعة first, then العرض,
    المساحة والسعر, المالك, تفاصيل إضافية, الموقع على الخريطة and ملاحظات
    العقار. Required labels end in "*".
  - The sticky `FormActionsBar` holds "حفظ (Ctrl+S)", "إلغاء" and an
    unsaved-changes indicator. Ctrl+S matches `event.code`, so it works on
    the Arabic layout, and it is ignored while a dialog is open.
  - A failed check focuses the first invalid field. Server errors land on
    their fields through `useApiFormErrors`; a 409 `DUPLICATE_PLOT` goes
    under رقم القطعة and takes focus.
  - **Duplicate warning before save.** When the plot or location changes
    (400 ms debounce), the form looks up candidates by plot number and
    compares the same identity the server uses (`samePlot`: location names,
    number and letter), with a link to the existing listing. The server still
    decides.
  - `normalizeDigits` turns Arabic-Indic and Persian digits into Latin
    digits in number fields and `PhoneField`. `CountField` stores an empty
    count as `null`.
  - Validation messages take space only when present. In this form that
    means `hideDetails: "auto"` through a `v-defaults-provider`; the global
    default stays as the owner left it. Edit pages are about 300px shorter.
    Areas load without ".00".
  - Save opens the record (after the purchase-matches dialog when there are
    matches). Cancel goes back to the record when editing, otherwise to the
    list. The same component reloads when the route moves between records
    or to `/new`.
  - `LocationSelects` keeps the three fields at one height, with the
    manual-entry toggles aligned. This also applies in the rental form.
- **Window close in Electron.** `useDirtyForm` now protects closing the
  window too. Before, it skipped `beforeunload` on the desktop because
  nothing answered it. `main.js` asks through `will-prevent-unload`, and the
  API and backup scheduler now stop on `will-quit` rather than `before-quit`
  (see ARCHITECTURE.md, "Closing and quitting").
- **API client.** A network failure becomes an Arabic message ("تعذر الاتصال
  بخادم البرنامج…") instead of the browser's `TypeError`.
- **Map.** The attribution is on the documented Label step (0.82rem), and the
  dark theme uses theme roles instead of two literal colours.

### Results

| Criterion                         | Result                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Record identity without scrolling | facts end at 141px of 688 (1366×688) and 214px of 550 (1093×550); one edit action, no breadcrumbs            |
| Ctrl+S                            | saves an edit, then shows the record (after the matches dialog when there are matches); no leave prompt      |
| Leaving a dirty form              | asks; "stay" keeps the edit, "leave" changes nothing on the server                                           |
| First invalid field               | focused on Ctrl+S (scripted against the first field Vuetify marks invalid)                                   |
| Plot identity                     | first section; duplicate warning before save, and a 409 lands on رقم القطعة with focus                       |
| Tab stops to the owner fields     | 17 (limit 20)                                                                                                |
| Edit round trip                   | untouched save: 0 fields differ in a scripted before/after compare                                           |
| Digits                            | "٣٠٠" → 300 and "٠٧٧٠١٢٣٤٥٦٧" → 07701234567                                                                  |
| Window close (Electron)           | scripted in Electron: clean form closes without asking; dirty form asks; File → Exit + stay keeps the API up |
| Accessible names                  | 0 unnamed controls on the record page and the form                                                           |
| Detector                          | 0 findings in phase 2 files, including `PropertyLocationMap.vue`                                             |
| Checks                            | ESLint and all typechecks clean, `pnpm test` 43/43 (new `renderer-utils.test.ts`), `test:contract` 67/67     |

The phase 1 keyboard script still passes 16 of 17 checks. The exception is
its old "≤20 tab stops to the first row" check, which section 7 replaced with
the shortcut paths; those pass.

The Electron check drove a test window with the same handler and listener,
and stubbed the dialog's answer. The running app was not restarted, because a
`pnpm dev` instance was in use. Restart it once to load the new `main.js` and
`preload.cjs`.

### Deferred

- **Status menu in the record header:** there is no status-only endpoint;
  only archive and restore exist. Needs owner approval (section 9).
- **`ListingImages`:** `PropertyImages` carries the new behaviour; the rental
  gallery moves onto it in phase 3.
- **Rental form:** its areas still show ".00", and its sections, save bar and
  shortcuts arrive with phase 3.
