# Operational dashboard (October 2026)

The dashboard is the office's work queue: who to contact, which listing fits
which request, what is due today, and what is slipping. Every figure comes
from stored records and has one definition, written below. Where the data
model cannot answer a question, the dashboard says so in one line instead of
showing a substitute.

This replaces the earlier analytics dashboard (status cards, two Chart.js
charts, recent offers, recent activity, top locations). `GET
/dashboard/summary` and its test stay on the API; the renderer no longer
calls it.

## Audit: what was found

Confirmed in the code before changing it (October 2026, `main` at
`c9ef8e8`):

| Finding                                                                                                                                                                                   | Status                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Match "نسبة المطابقة 45%" was a weighted sum, not a percentage: a request stating only a type and budget topped out at 50%.                                                               | Fixed: full/partial match and "preferences 2 of 3".    |
| A listing of another property type could be listed as a match (budget 25 + location 15 reached the 40 threshold).                                                                         | Fixed: required criteria (below).                      |
| A request stating only its type (score 25) never matched anything.                                                                                                                        | Fixed: listed when every required criterion is met.    |
| Location reasons read "neighborhood متطابقة": the column name, in English, in Arabic text.                                                                                                | Fixed.                                                 |
| Matches were visible only right after saving a request; the request list had no way to see them.                                                                                          | Fixed: "المطابقات" on each open request.               |
| A rental match opened its edit form (`/rentals/:id/edit`); rentals have no detail route.                                                                                                  | Fixed: rentals have a record page, `/rentals/:id`.     |
| Request status "open" showed in English (the property status list has no "open").                                                                                                         | Fixed: `REQUEST_STATUSES` in `constants/crm.ts`.       |
| Rental follow-ups called a visit "زيارة" and offered 3 of the 5 types; sale follow-ups said "معاينة" and offered all 5. Each component kept its own list.                                 | Fixed: one `FOLLOWUP_TYPES`.                           |
| The sidebar's collapsed state reset on every launch; "add offer" and "add rental" were navigation items; active state was special-cased per path; titles were overridden in the template. | Fixed: `NAV_SECTIONS`, `isNavActive`, remembered rail. |
| Window titles of the request and favorites pages said "العروض العقارية" / "الإيجارات".                                                                                                    | Fixed: own route labels.                               |
| Every money and date cell created a new `Intl` formatter.                                                                                                                                 | Fixed (measured below).                                |
| The old dashboard's follow-ups listed only reminders from the last 24 hours and called them overdue; a follow-up has no "done" state, so a past one is not known to be overdue.           | Replaced: today's and the next 7 days' appointments.   |
| Four components (MetricCard, OfferTrendChart, DistributionChart, RankedBarList) and `chart.js` were used only by the old dashboard.                                                       | Removed.                                               |

Not changed here (still open): the rental and property tables' column count
overflows their card at 1366 px with the sidebar expanded; the request form
is a 900 px dialog rather than a page; the documents page uses one person
field as both filter and upload target; no keyboard row navigation in
tables; `Ctrl+S` in forms. See "Not done" at the end.

## What the data supports

| Question                               | Data                                                                                            | Shown                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Which listings match which requests    | Purchase/rental requests (`status = open`), listings (`status = available`), the matching rules | Yes                                      |
| Who needs contacting                   | Open requests of active customers, with or without matches                                      | Yes                                      |
| What is due                            | Follow-ups with `scheduled_at` (on listings, not on people)                                     | Appointments today / next 7 days         |
| Viewings without an outcome            | Follow-ups of type `visit` and later follow-ups on the same listing                             | Yes                                      |
| Listings without interest              | `updated_at` and follow-up `created_at`                                                         | Yes, with a chosen period                |
| Deals in progress, closings            | Listing status; the change log's status changes                                                 | Yes                                      |
| Last contact with a customer           | Not recorded: no per-person interaction log                                                     | No; "last update of the request" instead |
| Rental contracts, renewals, payments   | Not recorded: rentals are offers, not contracts                                                 | No; the rental panel says so             |
| Commissions, revenue                   | Not recorded                                                                                    | No; the performance panel says so        |
| Pipeline stages "contacted", "viewing" | Not states of a request                                                                         | No conversion rates                      |

## Matching rules

One module, `server/src/modules/matching/matching.rules.ts`, holds the rules
twice: `evaluateMatch` explains one pair (request pages, listing forms, the
dashboard's rows) and `requiredSql` / `preferenceMetSql` /
`preferenceTotalSql` select and rank all pairs at once (the dashboard).
`test:dashboard:operations` evaluates every request against every listing
both ways and fails on any difference.

**Required** — a listing that misses one is not a match:

- property type (trimmed, case-insensitive);
- location, when the request names one: the most specific level it names by
  id (neighborhood, else district, else governorate) must be the listing's;
  without ids, the first level it names by text (governorate, then district,
  then neighborhood);
- budget, when the request states one: the sale price, or the rent as
  entered, within `budget_min`–`budget_max`;
- rent period (rentals), when the request states one.

**Preferences** — they rank matches, never exclude them: area (range and
unit), rooms, bathrooms and floors (at least as many; sale listings record no
floors, so that preference is never met for them), amenities (all of them).

The request pages list a listing when every required criterion is met, or,
as before, when its score reaches 40 ("partial match", labelled with what
failed). Full matches come first. The score keeps its old weights for
ordering only and is not shown as a percentage.

Only **open** requests of **active** customers count on the dashboard;
matching on the request page itself works for any open request.

## Figures

All times use the office's time zone, Asia/Baghdad.

| Figure                             | Definition                                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requests with matching listings    | Open requests of active customers with at least one available listing meeting every required criterion. A request counts once however many listings match it.                                                                                           |
| Requests without a match           | The other open requests of active customers.                                                                                                                                                                                                            |
| Appointments today                 | Sale and rental follow-ups whose `scheduled_at` falls today (from 00:00), including ones earlier today. "Next 7 days" counts from today 00:00 to 7 days later. Cancelled follow-ups are left out.                                                       |
| Viewings without a later follow-up | Follow-ups of type `visit` whose time passed in the last 30 days, with no other follow-up recorded on that listing after the viewing's time. Not a cancelled one, nor one with an outcome recorded on it (Phase 2a).                                    |
| Listings without activity          | Available listings not edited and with no follow-up recorded in the chosen period (14, 30, 60 or 90 days). Creation date alone never counts.                                                                                                            |
| Negotiating / reserved / sold      | Current listing status.                                                                                                                                                                                                                                 |
| Sold / rented in 30 days           | Listings whose status is now sold (rented) and whose change log records a change to that status in the last 30 days (`status_changed` for sales, `updated` with a new status for rentals). Imports and changes made outside the API are not in the log. |
| Value of available sale listings   | Sum of `total_price` of available sale listings.                                                                                                                                                                                                        |
| Monthly rental values              | Rent per month: annual ÷ 12, semi-annual ÷ 6, monthly as is; of available and of rented listings.                                                                                                                                                       |

**«يحتاج متابعتك»** (`utils/attentionQueue.ts`, November 2026, UX-02): one
list of what is waiting, from data the page already loads (no new endpoint).
Each line is one obligation with its tier, reason, date and one next action:

| Tier    | Lines                                                                                   | Action                                                                           |
| ------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| متأخر   | open tasks past their date; overdue lease instalments                                   | open the customer or listing; «تحصيل القسط» (rent receipt held for the landlord) |
| اليوم   | open tasks due today (the overview's appointments only if the tasks section is missing) | open the customer or listing                                                     |
| للتحصيل | the five oldest commissions not fully collected                                         | «تحصيل» (the same receipt preset as accounting)                                  |
| تواصل   | customers needing contact; customers whose requests have matches (one line per person)  | open the customer; «عرض الخيارات» (customer drawer)                              |
| متابعة  | viewings without an outcome; leases ending within 30 days; stalled deals                | «تسجيل النتيجة» (follow-up on the listing); open the lease or deal               |

No scores: tier order, then the oldest date first. A record that comes from
two sources is one line (a viewing that is also an overdue task; a customer
who needs a call and has matches). Tier counts are the server's totals, not
the five loaded rows. A source that fails to load is named in the list with
a retry, so a failure never reads as «لا شيء ينتظرك»; the empty state lists
what was checked. The «الكل» view starts with up to three lines per tier so
today's work and collections show even when overdue items pile up.

**Matching workspace**: one row per request with matches, showing the
request beside its best listing (most preferences met, then the most
recently updated listing, then the highest id) and "+N" for the others.
Requests are ordered by the share of their preferences the best listing
meets (a request with none counts as fully met), then by the request's last
update. Filters: all, sale, rental; search by customer name, code or phone,
or request code.

**Customers awaiting a decision**: those with matches are «تواصل» lines in
the queue; those without a match are the at-risk requests in `RiskPanel`.

## Permissions

`GET /dashboard/overview` and `GET /dashboard/matching` need only a signed-in
user. Each section follows its domain's read permission and is `null`
without it; its queries do not run:

| Section                                          | Needs                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Sale figures, sale listings without activity     | `properties.read`                                                                               |
| Rental figures, rental listings without activity | `rentals.read`                                                                                  |
| Appointments, viewings                           | `followups.read` + `properties.read` (sale), `rentals.followups.read` + `rentals.read` (rental) |
| Matching, customers, requests without a match    | `requests.read`, and per kind `properties.read` / `rentals.read`                                |

Recording a follow-up from the dashboard uses the existing follow-up routes
(`followups.create`, `rentals.followups.create`). The follow-up is saved on
the listing, with a suggested note naming the customer and request.

## Renderer

`pages/DashboardPage.vue` composes `components/dashboard/*`; state and
loading are in `composables/useOperationsDashboard.ts` (kept between visits,
so the last data shows at once while it refreshes; each request aborts the
one before). Overview and matching load independently, each with its own
skeleton, error and retry. Search waits 300 ms. Drawers are `SideSheet`
(a `v-dialog`: focus trapped, `Esc` closes, focus returns to the opener).

Layout (November 2026, UX-02; replaced phase 5's priority strip, business
panels, outstanding commissions and customers/appointments tabs):

1. `QuickActions`, then `SummaryStrip`: five figures that can be acted on,
   each a link to its full list — tasks past their date (`/tasks?due=overdue`),
   tasks and appointments today with the week's count (`/tasks?due=today`),
   overdue lease instalments with the amount per currency
   (`/leases?view=overdue`), commissions not collected
   (`/accounting?view=commissions&state=open`), and requests with matches
   (scrolls to the matching workspace). A figure without its permission is
   not shown.
2. Two columns (container query; one column below 980 px):
   - **Start** (min 340px): `AttentionQueue` («يحتاج متابعتك»), then
     `WorkSummary` (open deals by state; this month's money per currency with
     its dates, client funds excluded) and `PerformanceSummary` (listing
     status).
   - **Main**: the match work queue, then `RiskPanel` (requests without a
     match, listings without activity; viewings are in the queue).

At 1366×768 the first screen shows the five figures, eight queue lines
covering overdue, today, collection and contact, and the first match.

Lists in these panels share one ledger row (what and who at the start, one
time, amount or duration at the end); see `apps/renderer/DESIGN.md`. Match
rows state the met required criteria as one line and draw "preferences N of
M" as a small segmented meter beside the same text; it is the same two
numbers, not a score. With `deals.create`, a match row and its details
drawer offer «صفقة»: the deal dialog opens with the request's customer, the
listing and the request (as the request page does). Above everything,
`QuickActions` shows the daily «إضافة» items as one-click buttons.

Below 980 px of content width the columns stack (a container query, so a
collapsed or expanded sidebar both work), in DOM order: matches, business
panels, customers and appointments, risks, status. The business stacks
become one column below about 650 px. With the demo data (which now
includes the Phase 7b business summary) the page is 1,301 px tall at
1366×768 (from 1,632 before this change) and 1,283 px at 1920×1080, with
no horizontal overflow at 1100, 1366 or 1920 px.

There are no charts. The earlier Chart.js charts were removed with the
analytics dashboard (above), and no figure here reads better as a chart
than as a number linked to its list.

## Performance

`pnpm perf:dashboard` (`scripts/perf/dashboard.mjs`): the built API under
Node, a seeded throwaway database of 5,000 sale listings, 2,000 rentals,
1,500 people, 500 purchase and 500 rental requests. The shared seed's
requests state only a property type, so each matches every available
listing of its type: 125,001 sale and 120,000 rental request × listing pairs,
the most this many requests can produce. Development PC, PostgreSQL 18,
20 requests each after 3 warm-up requests, milliseconds:

| Request                                   |   Median |       p95 |
| ----------------------------------------- | -------: | --------: |
| `GET /dashboard/summary` (old dashboard)  |       41 |        45 |
| `GET /dashboard/overview`                 |       49 |        84 |
| `GET /dashboard/matching` (all)           |      162 |       184 |
| `GET /dashboard/matching` (sale)          |      155 |       165 |
| `GET /dashboard/matching` (search)        |      168 |       219 |
| Opening the old dashboard (summary)       |       34 |         – |
| Opening the new one (overview ∥ matching) |      187 |       197 |
| 4 clients opening the old / new dashboard | 43 / 262 | 125 / 357 |

The new dashboard computes every match, which the old one did not, so it
costs more API time; the matching section has its own skeleton and the
rest of the page does not wait for it. The first implementation took
436 ms for `matching`: one CTE of all pairs read twice, and a sort of
125,000 rows for each request's best listing that spilled to disk. Counting
matches and the best preference score in one grouped pass (no sort) and
looking up the best listing only for the 8 requests on the page took it to
162 ms with identical results (`test:dashboard:operations` checks both
against `evaluateMatch`). With realistic requests, which state a budget or
location, far fewer pairs qualify. No cache: at this cost a cache would
need invalidation on every request, listing and person change for little
gain.

**Formatters.** `formatMoney` and `formatDateTime` created an `Intl`
formatter per call. Cached formatters, same output for 200 dates and the
money cases (Node 22, 5,000 calls, median of 7): money 257 → 4.8 ms, dates
448 → 16 ms. That is the helper alone, not a measured table render, and
Chromium's costs may differ.

Not measured: the packaged app's startup and login-to-dashboard marks
(`pnpm perf` needs an `electron-builder --dir` build; the harness now waits
for overview and matching on builds that have them, and still for the
summary on older ones).

## Business summary and notification center (Phase 7b)

`GET /dashboard/business` and `GET /dashboard/alerts` need only a signed-in
user. Each section follows its domain's read permission and is `null`
without it. Each figure reuses an existing definition, so the dashboard
and the page it opens agree. Lists hold the first 5 records.

| Section                     | Figure                          | Definition                                                                                                                                                                                                         |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tasks (any follow-up read)  | today, this week, overdue       | The tasks list's `due=today`, `due=week` (today to 7 days on) and `due=overdue` (open, past due), over every task the user may read (`listTasksPage`)                                                              |
| deals (`deals.read`)        | negotiating                     | open deals in negotiation, agreed, contract preparation or contract issued; latest stage change first                                                                                                              |
|                             | stalled                         | open deals whose stage has not changed for 14 days; oldest first                                                                                                                                                   |
|                             | recently won                    | won in the last 30 days                                                                                                                                                                                            |
| customers (`people.read`)   | needing contact                 | the operational reports' uncontacted customers over the last 30 days (`uncontactedCustomers`); open requests count with `requests.read`                                                                            |
| leases (`leases.read`)      | expiring                        | leases in force whose last day is within 30 days                                                                                                                                                                   |
|                             | overdue                         | the installments of `leases/installments/overdue`, counted and summed per currency                                                                                                                                 |
| money (`reports.financial`) | per currency, the month to date | commissions collected (receipts allocated to commissions); commissions outstanding now (active commissions less what was collected on them); revenue, expenses and net from the income statement for the same days |

**Alerts.** `alerts` holds those counts with a severity, and only the ones
above zero:

- overdue tasks, error;
- overdue installments, error;
- tasks today, info;
- stalled deals, warning;
- expiring leases, warning;
- customers needing contact, info.
  The renderer turns each key into a title and a link.

**A contact.** For "needing contact" (and the operational reports), a
contact is an activity or follow-up naming the customer that took place:
marked done, dated by when it was done. A task still open is a plan, not a
contact.

**Load.** The summary runs two sections at a time, each section one query
at a time (`inParallel`, `QUERY_WIDTH`). Every running query holds a pool
connection.

**On screen.**

- The dashboard reads the summary in three places: the summary strip's
  figures, the attention queue's lines and `WorkSummary`. Every figure links
  to the list that holds it, filtered the same way:
  - `/tasks?due=…`;
  - `/deals?stalled=1`;
  - `/leases?view=overdue`;
  - `/accounting?view=commissions&state=open`;
  - the month's income statement.
- `NotificationBell.vue` in the command bar shows the alerts. Its badge
  counts the error and warning ones; it refreshes every two minutes and on
  moving between pages.

## Not done

The brief's other phases are not in this change: unified list/detail
layouts for sale and rental listings, the request form as a page, the
documents page split, locations, settings, users and roles, the
authentication and error pages, keyboard row navigation and `Ctrl+S`.
Customer interaction logging, rental contracts and payments, and
commissions were later built: tasks and activities (Phase 2), leases
(Phase 5) and accounting (Phase 4). The business summary above reads
them.
