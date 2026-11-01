# Desktop UX simplification (2026-11-01)

A frontend-only pass that measures ten everyday workflows, then cuts the
navigation, clicks and typing they need. No backend code, route, schema,
validation, calculation or API shape changed. Branch
`feat/ux-simplification`, starting from `97a9b2c`.

## 1. Method

The baseline was read from the code at `97a9b2c`: routes, sidebar, «إضافة»,
page buttons, dialogs, and the server's zod schemas for what is required.
The after-state was read from the new code and checked in the web demo
(`dalaly_demo`) with Playwright: redirects, dialog presets, the expense and
deal prefills, and screenshots at 1366×768.

Each workflow starts on the dashboard, signed in as Super Admin. It takes
the fastest discoverable mouse path. Only the fields the operation needs
are filled.

- **Clicks:** every click. That includes focusing a field and opening and
  choosing in a list (two clicks).
- **Steps:** route changes.
- **Manual fields:** fields typed into or picked from. Prefilled values
  left as they are do not count.
- **Typed characters:** a name is 14, a phone 11, an amount 7, a search 5,
  short text 10 and an area 4.

The times are **Keystroke-Level Model estimates**, not stopwatch
measurements. The same convention applies before and after:

| Component | Time |
| --- | --- |
| Click (P + BB) | 1.3 s |
| Mental preparation per click (M) | 1.35 s |
| Keystroke (K) | 0.28 s per character |
| Hand switches (H) | 2 × 0.4 s per typed field |
| Route change | 0.5 s |
| Dialog | 0.3 s |
| Save request | 0.5 s |
| Reading a result | one extra M |

## 2. Audit summary

- **47 page routes before (43 after)**, including six list pages that
  were really views of another page:
  - favourites and rental favourites (already quick views in their lists);
  - the vouchers and commissions lists;
  - the financial and the operational reports.
- **26 sidebar items before**, help included. Five of them were
  accounting pages and two were report pages.
- **Duplicated or overlapping screens:**
  - FavoritesPage / RentalFavoritesPage repeated the «المفضلة» view of
    their lists, without paging or filters.
  - Reports were split over 2 pages and 13 tabs. The account statement
    page is the same data as the «دفتر حساب» report.
  - The employees' shares view repeated part of the payables report.
  - Commissions had their own list page, as well as the deal and customer
    money tabs.
  - The dashboard showed today's appointments four times.
  - Contract templates were reachable from both the sidebar and the
    contracts page.
- **Nested tabs:** none on record pages. Settings › المظهر has a theme
  toggle inside a tab. That toggle is a form input, so it was left as is.
- **Bugs found during the audit (now fixed):**
  1. Opening a deal from a rental listing or a rental request's match
     cleared the listing. The form started as a sale and its kind watcher
     reset the listing.
  2. A dialog opened from `?new=` when its page loads was mounted already
     open, so it never ran its open logic. The voucher dialog then loaded
     no cash boxes, so a receipt or payment started from «إضافة» could not
     be issued. The same latent problem applied to every `?new=` dialog
     with a preset.
  3. A receipt issued from «سند قبض» with the default purpose «عمولة المكتب»
     but no commission chosen books income without reducing the
     commission's outstanding amount. The behaviour is unchanged (it is
     the server's rule), but the dialog now warns and points to «تسديد
     عمولة».

## 3. Page consolidation map

| Page / route before | Decision | Reason | Where it lives now |
| --- | --- | --- | --- |
| `/` Dashboard | Keep | Operational centre | Adds «عمليات سريعة» (7 one-click actions) |
| `/tasks` | Keep | Daily follow-ups | Sidebar, top group |
| `/properties`, `/rentals` (+ `:id`, `/new`, `/:id/edit`) | Keep | Core lists and forms | The owner picker now sits above the owner fields |
| `/favorites` | Merge into `/properties` | Duplicate of the «المفضلة» quick view | Redirect to `/properties?view=favorites` |
| `/rental-favorites` | Merge into `/rentals` | Same | Redirect to `/rentals?view=favorites` |
| `/purchase-requests`, `/rental-requests` (+ `:id`) | Keep | Requests and their matches | Sidebar under «العقارات والطلبات» |
| `/people`, `/clients/:id` | Keep | Customer list and hub | After adding a customer: «فتح ملف الزبون» |
| `/documents` | Keep | Customer documents | Sidebar under «الزبائن» |
| `/deals`, `/deals/:id` | Keep | Pipeline and deal record | `?new=sale` / `?new=rent`. The deal dialog was simplified |
| `/contracts`, `/contracts/new`, `/contracts/:id` | Keep | Contract Studio | Opens on «التفاصيل» from a deal. Issued contracts get «حفظ PDF» |
| `/contracts/templates` (+ `:key`) | Convert to sub-item | Rare, admin | Under «العقود» while inside contracts, and «القوالب» on the contracts page |
| `/leases`, `/leases/:id` | Keep | Active leases | Sidebar under «الصفقات والعقود» |
| `/accounting/vouchers` | Merge into `/accounting` | Same money, different list | Tab «الحركات المالية» (redirect keeps `?new=`) |
| `/accounting/commissions` | Merge into `/accounting` | Same | Tab «العمولات» with inline «تحصيل», and tab «حصص الموظفين» |
| `/accounting/vouchers/:id`, `/accounting/commissions/:id` | Keep | Records (print, void, cancel) | Parent link «الحسابات» |
| `/accounting/cash`, `/accounting/journal`(+`:id`), `/accounting/accounts`(+`:id`) | Convert to sub-items / details | Accountant detail | «عرض التفاصيل» menu and sidebar sub-items under «الحسابات» |
| `/reports/financial` | Merge into `/reports` | One reports page | Category «العمولات والحسابات» (redirect keeps the query) |
| `/reports/operations` | Merge into `/reports` | Same | Categories العقارات · الصفقات · الإيجارات · الزبائن |
| `/users`, `/roles`, `/locations` | Convert to sub-items | Admin | Under «الإعدادات» while inside settings |
| `/settings` | Keep | Settings | Sidebar, last item |
| `/help` | Keep, rebuilt | Help and About | Fixed sidebar footer item, user menu, F1 |

Pages added: `AccountingPage` (`/accounting`) and `ReportsPage` (`/reports`).
Pages removed: `FavoritesPage`, `RentalFavoritesPage`, `VouchersPage`,
`CommissionsPage`, `FinancialReportsPage` and `OperationsReportsPage`. Every
old route redirects.

## 4. Navigation

| Measure | Before | After |
| --- | --- | --- |
| Sidebar items always visible (Super Admin, help included) | 26 | 15 |
| Accounting entries | 5 | 1 («الحسابات», plus 3 sub-items inside it) |
| Report entries | 2 pages, 13 tabs | 1 page, 5 categories, 1 report picker |
| Depth | 2 (group → page) | 2 (group → page; sub-items only inside their area) |
| Help | A nav item | A fixed footer item (1 click from every page) |

Groups: (top) لوحة التحكم, المهام والمتابعات · العقارات والطلبات · الزبائن ·
الصفقات والعقود · الحسابات والتقارير · الإعدادات.

## 5. Before / after workflow metrics

Times are KLM estimates. The «Required» column counts required fields that
are not prefilled.

| # | Workflow (path) | Steps | Clicks | Manual fields | Required | Est. time | Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | Add a sale listing, new owner | 2 → 2 | 7 → 6 (−14%) | 4 → 4 | 4 → 4 | 33.3 → 30.7 s (−8%) | Area, price, owner name and phone are server-required |
| W1b | Same, owner already a customer | 2 → 2 | 7 → 6 (−14%) | 3 → 3 | 3 → 3 | 26.9 → 24.3 s (−10%) | The picker was there before, only lower down |
| W2 | Request for an existing customer, see matches | 1 → 1 | 5 → 4 (−20%) | 1 → 1 | 1 → 1 | 18.4 → 15.8 s (−14%) | Already one required pick |
| W3 | Add a customer (name and phone) | 1 → 1 | 5 → 4 (−20%) | 2 → 2 | 1 → 1 | 23.2 → 20.5 s (−11%) | Name and phone have to be typed |
| W4 | Sale deal (deals page / quick action) | 2 → 2 | 9 → 8 (−11%) | 4 → 4 | 1 → 1 | 35.6 → 32.9 s (−7%) | Listing, client, price and commission are the deal itself |
| W4c | Same, commission from the last-rate chip | 2 → 2 | 9 → 8 (−11%) | 4 → 3 (−25%) | 1 → 1 | 35.6 → 30.2 s (−15%) | No office default rate exists (backend) |
| W4m | Sale deal from a dashboard match (before: details drawer → request page → «صفقة») | 2 → 1 | 6 → 4 (−33%) | 2 → 2 | 0 → 0 | 23.5 → 17.4 s (−26%) | Agreed price and commission are typed |
| W5 | Rental deal (deals page / quick menu) | 2 → 2 | 10 → 9 (−10%) | 5 → 5 | 1 → 1 | 38.2 → 35.6 s (−7%) | As W4 |
| W5r | Rental deal from the rental listing page | 1 → 1 | 12 → 6 (**−50%**) | 4 → 3 | 1 → 1 | 44.4 → 24.9 s (−44%) | The gain is the bug fix: the listing no longer has to be picked again |
| W6 | Record a received commission | 2 → 1 | 5 → 3 (−40%) | 1 → 1 | 0 → 0 | 17.3 → 11.5 s (−34%) | A search is needed when many commissions are owed |
| W6v | Same, a commission among the oldest five on the dashboard | 2 → 0 | 4 → 2 (**−50%**) | 0 → 0 | 0 → 0 | 12.4 → 6.1 s (−51%) | Only the five oldest are listed there |
| W7 | Office expense of a recurring type | 2 → 1 | 8 → 5 (−38%) | 4 → 2 (**−50%**) | 3 → 1 | 34.1 → 17.3 s (−49%) | The amount must be typed |
| W7n | Office expense, first of its type | 2 → 1 | 8 → 6 (−25%) | 4 → 3 | 3 → 2 | 34.1 → 24.7 s (−28%) | No earlier payee to reuse |
| W8 | Contract from a deal to a saved PDF | 3 → 3 | 14 → 11 (−21%) | 3 → 3 | 2 → 2 | 46.3 → 34.8 s (−25%) | Issue confirmation and the native save dialog stay |
| W8n | Same, first contract on this machine | 3 → 3 | 14 → 11 (−21%) | 3 → 3 | 2 → 2 | 46.3 → 38.4 s (−17%) | The place of signing is typed once |
| W9 | Find outstanding commissions | 1 → 1 | 1 → 1 (0%) | 0 → 0 | 0 → 0 | 4.5 → 4.5 s (0%) | Already one click. Now the total is shown too («العمولات المتبقية») |
| W10 | Commissions report for last month | 1 → 1 | 6 → 3 (**−50%**) | 3 → 2 | 0 → 0 | 17.8 → 9.8 s (−45%) | Before, the picker opened in January, so about 4 more clicks in practice |

Totals over the ten primary paths (W1–W10):

- clicks 70 → 54 (**−23%**);
- manual fields 27 → 24 (−11%);
- estimated time 268.6 → 213.2 s (**−21%**).

**The ≥50% target was met only for:**

- W10 clicks;
- W5 from a rental listing (clicks);
- W6v, a commission collected from the dashboard (clicks and time);
- W7 manual fields (time −49%);
- the deal form's visible fields: **13 → 5 (−62%)**.

Elsewhere the remaining actions are the operation's own data:

- fields the server requires (listing area, price, owner; a customer's
  name);
- the choices that define a deal (listing, client, price, commission);
- or a single click to open the page.

Halving them would mean removing required validation, or prefilling
financial figures the user did not give, and the brief rules both out.
The changes that could go further need the backend (section 8).

| Overall target | Result |
| --- | --- |
| Unnecessary pages | 6 merged into 2 (net −4); every old route redirects |
| Duplicate tabs | Report tabs 13 → 5 categories; favourites and the voucher and commission lists merged; no nested tabs added |
| Navigation depth | 2 levels; rare pages show only inside their area |
| Deal creation manual inputs | 4 → 4 (3 with the rate chip); visible fields 13 → 5 |
| Common operation clicks | −23% overall; ≥50% on W10 of the ten, and on the variants W5r and W6v |
| Common operation time (est.) | −21% overall; −51% on W6v, 44–49% on W7, W10 and W5r |
| Redundant data entry | Owner and asking price no longer asked in the deal form; expense description and payee reused; contract place and delivery date one click |
| Accounting | One workspace (`/accounting`) |
| Reports | One page (`/reports`) |

## 6. Deal form field classification

| Field | Class | Now |
| --- | --- | --- |
| Kind (sale / rent) | Essential, derivable from a preset | Visible (toggle) |
| Listing | Essential for the workflow | Visible, first; its price shows as the hint |
| Client (buyer / tenant) | Essential, the only server-required field | Visible |
| Owner (seller / landlord) | Derivable from the listing (server fills it) | One line «البائع: …» with «البائع آخر» |
| Agreed price | Essential once agreed | Visible |
| Expected commission | Essential (estimate) | Visible, amount or % of the price |
| Asking price | Redundant (server takes the listing's) | «خيارات إضافية» |
| Currency | Advanced (IQD default) | «خيارات إضافية» |
| Title | Optional | «خيارات إضافية» |
| Priority | Advanced (server default) | «خيارات إضافية» |
| Assigned employee | Optional | «خيارات إضافية» |
| Expected close date | Advanced | «خيارات إضافية» |
| Notes | Optional | «خيارات إضافية» |

A one-line review («صفقة بيع · العرض · البائع · السعر · العمولة») sits
beside «حفظ». The form keeps a single save and has no confirmation step.

## 7. Routes and components

**Added**

- `pages/AccountingPage.vue` and `pages/ReportsPage.vue`.
- In `components/accounting/`: `VoucherList.vue`, `CommissionList.vue`,
  `PayableShares.vue` and `MoneyFlow.vue`.
- `components/shared/MoneyStrip.vue`, `components/dashboard/QuickActions.vue`
  and `components/dashboard/OutstandingCommissions.vue`.
- `composables/useAccountingSummary.ts`.
- `utils/periods.ts` and `utils/commissionVouchers.ts`.
- `constants/about.ts`.

**Changed**

- Shell and constants:
  - `AppSidebar` (sub-items, help footer);
  - `constants/domain.ts` (`NAV_SECTIONS`, `QUICK_ADD`, `QUICK_ACTIONS`,
    `isNavOpen`), `constants/permissions.ts`, `constants/reports.ts`,
    `constants/accounting.ts`;
  - `router/index.ts` (2 routes, 6 redirects), `locales/ar.json`.
- Dialogs and forms:
  - `VoucherDialog`, `DealDialog`, `ListingPicker` (`loaded`),
    `PersonEditor` (`offerFile`), `PropertyForm`, `RentalForm`,
    `AgreementTermsStep`.
- Pages:
  - `DealsPage`, `DealPage`, `ContractWorkspacePage`, `DashboardPage`,
    `HelpPage` (rebuilt), `PeoplePage`, `PropertiesPage`, `RentalsPage`;
  - `CommissionPage`, `VoucherPage`, `CashPage`, `JournalPage`,
    `AccountsPage` (parent link);
  - `MatchRow`, `MatchWorkspace`, `MatchDetailsDrawer` («صفقة» on a
    match);
  - `DealCommissions`, `BusinessPanels`, `constants/alerts.ts` (links and
    wording);
  - `composables/useNewFromQuery.ts`.

**Removed:** `FavoritesPage`, `RentalFavoritesPage`, `VouchersPage`,
`CommissionsPage`, `FinancialReportsPage` and `OperationsReportsPage`. The
code was searched for each of them first; only the docs referred to them.

**Wording:** commission states now use «مقبوضة» and «متبقية» everywhere. There
were three labels before («محصّلة», «غير محصّلة بالكامل», «لم تُحصَّل»).

## 8. Backend recommendations (not implemented)

1. **Totals over all time without a date hack.** `/accounting` passes
   `from=2000-01-01` for «منذ البداية». A period-free form of the
   commissions and income reports would be cleaner.
2. **Commissions report totals in SQL.** They are summed over the first
   2,000 rows, so a long period can undercount. The page warns when
   `truncated` is set.
3. **An office default commission rate per deal kind** (company settings).
   The deal form could then prefill the expected commission, and the
   commission dialog its rate.
4. **The value of completed sales and rentals** in the deals report (the
   sum of agreed prices per currency). «إجمالي المبيعات» now shows a count
   of won deals, because no total value is returned.
5. **A total of cash and bank per currency** from `/cash/balances`. Today
   it comes from the cash-flow report's `closing`, which needs
   `reports.financial`.
6. **The office's city in company settings,** to prefill the contract's
   place of signing for the first contract.
7. **A dedicated "expense category" filter on `/vouchers/paged`.** The
   payee reuse reads the latest 50 expense vouchers.
8. **A general «open external link» IPC** for an allow-listed website, so
   Codel's site could be a link in About. Only map links are bridged
   today.

## 9. Known limitations and open items

- **Codel logo:** none is in the repository. Put the official file at
  `apps/renderer/src/assets/brand/codel-logo.svg` (or `.png`). It is picked
  up at build time, shown at its own ratio on a white tile in both themes,
  with alt «شعار شركة كودل (Codel)». Until then the page shows «Codel» as
  text. The logo was not drawn or approximated.
- **Codel contact details:** website, email and phone/WhatsApp are `null`
  TODOs in `apps/renderer/src/constants/about.ts`. They are not invented,
  and they are hidden until filled in.
- **Version:** About reads `app_version` from the startup status the app
  already fetches (`useSetup`). It is not hard-coded.
- **Dalaly's logo:** there is no logo file in the renderer, so About uses
  the same mark as the sidebar header (`mdi-home-city-outline` on the
  sidebar colour).
- **Sidebar height:** at 1366×768 the expanded sidebar still scrolls
  slightly to reach «الإعدادات», which is also in the user menu.
- **Typed hash URLs:** in the browser test harness, typing a hash URL as
  the very first navigation after login was sometimes reverted. In-app
  navigation (`router.push`, links) was verified for every redirect.
  Electron has no address bar.
- **The dashboard was not restructured.** Its panels were refactored just
  before this pass (`97a9b2c`). This pass only added the quick actions,
  «العمولات غير المستلمة» (the five oldest, from `/commissions/paged`) and
  «صفقة» on each match.
  - The repeated appointment counts are still there.
  - So is the «قيمة المتاحة» sum in «حالة العروض».
  - Both are candidates for a follow-up with the owner.
- **Users, roles and locations** stay their own pages, as sub-items of
  «الإعدادات». Folding them into the settings tabs would need per-tab
  header actions.

## 10. Checks run

- `pnpm --filter @dalaly/renderer typecheck` and ESLint on the renderer:
  clean.
- `pnpm test`: 122 passed, 0 failed.
- `pnpm build` (server, renderer, asset check): passed.
- Web demo with Playwright at 1366×768: no console errors. Checked:
  - `/accounting`, `/reports`, `/help` and `?section=about`;
  - the deal and expense dialogs;
  - redirects of the six merged routes;
  - expense type prefill (office rent → «صاحب البناية»);
  - a deal from a rental listing keeps its listing;
  - a 2% commission computes;
  - on the dashboard, «صفقة» on a match opens the deal with its listing,
    client and owner filled, and «تحصيل» in «العمولات غير المستلمة» opens
    the receipt with the outstanding amount;
  - contract «حفظ PDF»: checked in the code only; no issued contract was
    opened in the demo.
- Not run:
  - the database-backed suites (`test:runtime`, `test:contract`), since
    no server code or API shape changed;
  - the packaged Electron launch (`test:startup:electron`).
