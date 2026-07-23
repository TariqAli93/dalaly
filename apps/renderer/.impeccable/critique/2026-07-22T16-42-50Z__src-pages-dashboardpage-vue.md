---
target: dashboard
total_score: 17
max_score: 40
na_heuristics:
p0_count: 2
p1_count: 3
timestamp: 2026-07-22T16-42-50Z
slug: src-pages-dashboardpage-vue
---

Method: dual-agent (A: design review, isolated · B: detector + live browser evidence)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                                                                                                                                          |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Visibility of System Status     | 1         | Nothing states when data was loaded; topbar refresh has no `:loading`, no confirmation, no `aria-live` — a re-fetch is indistinguishable from a dead button.                                                                                                       |
| 2         | Match System / Real World       | 2         | `منذ ${n} يوم` is ungrammatical for every value the code can produce (N is always ≥30); `ACTION_LABELS[a.action] \|\| a.action` leaks raw English audit verbs into Arabic prose.                                                                                   |
| 3         | User Control and Freedom        | 2         | The only clickable row routes to bare `/properties` with no filter; reminders — the most actionable content — aren't clickable at all; nothing can be dismissed or snoozed.                                                                                        |
| 4         | Consistency and Standards       | 2         | Two font stacks resolve on one screen (measured: card titles Tahoma, KPI label+number Roboto); `warning`/`info` colors undefined in both themes; `.kpi-grid` inlined in scoped CSS against the Named Region Rule at a 600px breakpoint the contract says is 760px. |
| 5         | Error Prevention                | 3         | Little to get wrong here, but `إنشاء نسخة احتياطية` fires immediately with no confirm and no statement of what it will do.                                                                                                                                         |
| 6         | Recognition Rather Than Recall  | 2         | Click a review row → land on an unfiltered table holding the code in your head; `slice(0, 8)` hides rows the server sent with no trace.                                                                                                                            |
| 7         | Flexibility and Efficiency      | 1         | For a user PRODUCT.md says "types faster than they point": zero shortcuts, no KPI→filtered-list click-through, no per-card "عرض الكل". The efficient path is to never open this page.                                                                              |
| 8         | Aesthetic and Minimalist Design | 2         | Thirteen blocks, none dominant; the two lowest-value cards (governorate/district chips) get the same frame, width, and title weight as overdue follow-ups.                                                                                                         |
| 9         | Error Recovery                  | 1         | If `fetchDashboard()` throws, `data` stays `null`, both template branches are false, and the page renders nothing below the header — blank screen, snackbar times out, no retry.                                                                                   |
| 10        | Help and Documentation          | 1         | No explanation anywhere of what "تحتاج مراجعة" means or why 30 days; the low-tech-staff persona has no way to find out.                                                                                                                                            |
| **Total** |                                 | **17/40** | **Poor — major UX overhaul required**                                                                                                                                                                                                                              |

## Design Specificity Verdict

**Generic. Could ship unchanged in any CRUD product.**

Swap six Arabic strings for "Total / Active / Pending / In Review / Closed / Archived" and this is a stock admin template: a six-tile avatar-icon KPI strip, a quick-actions button bar, and a 2×3 grid of identical bordered cards each containing a list. Nothing in the composition knows it is about land. The specificity that exists is entirely lexical, which is the cheapest kind. PRODUCT.md demands Iraqi brokerage vocabulary (نزال، مقاطعة، محلة، طابو); none of those four words appear. `formatPlot()` — which DESIGN.md calls a signature component — is not imported here at all. The screen that summarizes the office's inventory never once shows a plot identity.

The page trips two anti-references by name. PRODUCT.md names "icon-avatar-in-a-card as the answer to every block" as the closest failure mode; lines 116–129 are that pattern six times. DESIGN.md already conceded "the dashboard's KPI row is already at the limit of that pattern." It is past the limit.

**Deterministic scan.** The CLI detector returned `[]`, exit 0, across `DashboardPage.vue`, `AppLayout.vue`, `src/components/app`, and `styles.css`. That is a null result, not a clean bill of health — the static rules are HTML/CSS-oriented and have little purchase on Vuetify SFCs. The in-page runtime detector reported 38 anti-patterns on the same UI, but on verification roughly 2 point at project-authored code: 2 hits are the Vite DevTools overlay (dev-only), 2 are Vuetify's global skeleton shimmer attributed to `body`, 3 "nested cards" hits matched `v-list` containers (an independent DOM query confirmed **0** actual `.v-card` inside `.v-card`), 20 `layout-transition` hits are Vuetify framework internals, and 9 of the 13 "cyan neon" hits are sub-elements of a single active nav item inheriting one `color`. The measured primary is `rgb(17,100,102)` — dark desaturated teal, not neon cyan. Treat the overlay count as noise; the real findings below came from reading the code and measuring the live page.

**Live browser evidence.** The dashboard was inspected logged-in with the seeded data (13 offers) in both themes. Viewport resize was blocked by the harness, so 1100px/760px could not be exercised live; the responsive contract was instead extracted deterministically from the live CSSOM.

## Overall Impression

The visual _system_ is real and disciplined — flat, hairline, 8px, no elevation anywhere. The _composition_ on this page is not authored at all; it is the default answer to "make a dashboard." The single biggest opportunity: this page currently answers "how many of each status do we have," a question nobody asked. The server already computes the total value of the office's entire inventory (`financial.total_value / avg_price / max_price / min_price`) and this component throws all four away — the fossil is still in the file as dead `.financial-grid` CSS.

## What's Working

1. **The surface discipline holds literally.** All 13 cards are ` variant="flat" border` with zero `elevation` — measured live, no outliers. The page reads as quiet and paper-like rather than a Material demo with drop shadows. This is the part of the design system that is real rather than aspirational.
2. **The `آخر العروض` row is the right idea in miniature.** `${code} — ${property_type}` over `${governorate} ${district} · ${formatMoney(total_price)} دينار` with a status chip: identity → place → value → state, money through the shared helper. It is the only line on the screen that couldn't have been written for a generic CRUD app.
3. **Permission-aware composition done the right way.** Quick actions and nav items are _removed_ when unavailable, not disabled — correct for the low-tech-staff persona: never show a door that won't open.
4. **Contrast is genuinely fine.** Measured `.text-medium-emphasis`: 5.62:1 on app bg and 5.74:1 on card (light), 8.67:1 and 9.35:1 (dark). All pass AA. The suspicion that muted labels were too light is refuted by measurement.

## Priority Issues

**[P0] Fetch failure renders a blank page with no recovery.**

- **Why it matters:** `load()` catches, notifies, and leaves `data === null`, so `v-if="loading && !data"` and `v-else-if="data"` are both false and everything below the page header renders as nothing. This is the app's landing route. For the low-tech-staff persona this is not "an error," it is "the program is broken," and PRODUCT.md principle 4 promises errors say what to do next in plain Arabic. Nothing is said.
- **Fix:** Add an `error` ref and a third template branch — a bordered panel with a plain-Arabic cause and an `إعادة المحاولة` button calling `load()`. On a _refresh_ failure keep the last-good data and surface an inline banner instead of blanking.
- **Suggested command:** `/impeccable harden`

**[P0] The KPI row renders Vuetify's stock Material palette.**

- **Why it matters:** `statusCards` requests `color="warning"` and `color="info"`. Neither exists in `dalalyLight`/`dalalyDark`, so Vuetify falls back to Material amber `#FB8C00` and blue `#2196F3` — two colors from outside the design system, on the largest, first-seen element of the product. This is the literal anti-reference on the front page, and it breaks two named rules at once: five hues where teal is meant to be scarce, and Material amber applied to `قيد التفاوض`, which DESIGN.md defines as an _ochre_ state. The same `statusColor()` map is shared with the properties table, so the defect is systemic, not local.
- **Fix:** `negotiating → accent` (ochre, per the rule), `rented → secondary`, `sold → secondary`, `total → neutral ink`. Better: delete the avatars entirely and let weight and number size carry the tiles.
- **Suggested command:** `/impeccable colorize`

**[P1] Arabic text on the dashboard is rendering in a Latin-first font stack.**

- **Why it matters:** Measured on the live page: the card title resolves to `Tahoma, "Segoe UI", Arial` — but the KPI label and the KPI number both resolve to **`Roboto, sans-serif`**. `styles.css` sets the Tahoma stack on `body`, and Vuetify's `.text-body-2` / `.text-h5` classes override it with Roboto. Roboto carries no Arabic glyphs, so every Arabic string in a `text-*` class is being rendered by an unpredictable browser fallback rather than the chosen face. Two font stacks on one screen breaks The One Family Rule, and "Arabic as an afterthought" is PRODUCT.md's third anti-reference. Neither A's review nor the static detector caught this; only measuring the rendered page did.
- **Fix:** Set the family globally through Vuetify's SASS variable or a `:root`-level override on `.v-application` so `text-*` classes inherit the Arabic stack, rather than relying on `body`.
- **Suggested command:** `/impeccable typeset`

**[P1] No hierarchy between "chase this" and trivia — and the actionable content is below the fold.**

- **Why it matters:** `تنبيهات المتابعات` (overdue, actionable, the owner's entire reason for opening the app) and `أكثر المحافظات نشاطاً` (a chip cloud nobody acts on) are the same card, same width, same title weight, in the same `v-row`. Equal weight is an active editorial claim that these things matter equally. On the owner's 1366×768 panel, the 74px topbar + container padding + page header + KPI row + quick-actions card consume the entire fold — the follow-up alerts are below it every single day. The owner has 30 seconds and the page refuses to tell him where to spend them.
- **Fix:** Promote the two actionable panels into a full-width region directly under the KPIs, _before_ the quick-actions card (which currently puts actions above information), with per-row actions (تم / تأجيل / فتح العرض). Collapse governorates and districts into one card or a footer line.
- **Suggested command:** `/impeccable layout`

**[P1] The page has no heading structure, no focus rings, and unnamed controls.**

- **Why it matters:** Measured live: **0** `h1`–`h6` elements and **0** `[role="heading"]` on the entire dashboard — every `v-card-title` is a `div`, and the page title is a `text-h5` div. A screen-reader user has no structural navigation across 13 blocks. All 10 first-tab-stops are `DIV`s with `outline-style: none`, transparent `::before` overlay, and no box-shadow: `:focus-visible` matches but resolves to **no visible focus indicator at all**. The three topbar icon buttons have `aria-label: null` and no text. There are also **two `<main>` elements** in one document. PRODUCT.md commits to WCAG 2.2 AA and "full keyboard operation"; this fails both.
- **Fix:** Real heading elements for page and card titles; a global `:focus-visible` outline using the teal token; `aria-label` on every icon-only button; remove the duplicate `<main>` (`AppLayout` wraps `v-main` in its own `<main>`).
- **Suggested command:** `/impeccable audit` then `/impeccable harden`

**[P2] Silent truncation and a click-through that loses the user.**

- **Why it matters:** `slice(0, 8)` drops rows with no count and no "عرض الكل"; clicking a row calls `router.push('/properties')` with no query, so the user who clicked a _specific_ property arrives at an unfiltered table holding the code in their head. Breaks both "nothing is lost silently" and recognition-over-recall.
- **Fix:** Show `8 من 15` in the card title with a `عرض الكل` button; push `/properties?q=<code>` and have the table select the row.
- **Suggested command:** `/impeccable clarify`

**[P2] Arabic number grammar and unisolated Latin data.**

- **Why it matters:** `منذ ${daysSince(...)} يوم` — the server only returns properties older than 30 days, so N is always ≥30 and the phrase is wrong in Arabic for every value the code can produce (needs `يوماً` for 11+). `when()` emits a full `ar-IQ` datetime with embedded RLM marks, concatenated raw into subtitles alongside `·` and usernames with no `.money` isolation — exactly what the Bidi Isolation Rule exists to prevent. KPI counts bypass `formatNumber`, so an office with 1,200 listings sees `1200` while every other number in the app is grouped.
- **Fix:** A shared `pluralizeDays(n)` in `utils/format.ts`; route KPI counts through `formatNumber`; wrap `when()` output and chip counts in `.money`; replace absolute timestamps with relative forms (`غداً 10:00`, `متأخر 3 أيام`).
- **Suggested command:** `/impeccable clarify`

## Persona Red Flags

**Alex (power user — PRODUCT.md's agent, "types faster than they point"):** The six KPI tiles are plain `v-card`s, not links — the six most obvious targets on the page are inert. `إضافة عرض`, the highest-frequency action in the product, is a mouse-only target with no shortcut. Refresh exists only as an unlabeled icon button with no key binding. The single clickable list drops him at an unfiltered `/properties`, so the fast path is always to skip the dashboard: the page costs him time and returns none. Measured tab order: 23 focusable elements, the first 10 of which are sidebar list items.

**Sam (accessibility-dependent):** Zero headings across 13 blocks (measured). No visible focus ring on any of the first 10 tab stops (measured). Refresh replaces the entire page content with no `aria-live` or `role="status"`. Clickable `needs_review` rows carry `@click` but no `role` and are visually identical to three adjacent non-clickable lists — indistinguishable by sight or by AT. `v-empty-state` conveys a state change with no `role="status"`. KPI number and label are sibling `div`s with no programmatic association. Two `<main>` landmarks.

**"أبو محمد" — 55, office owner, 1366×768 TN panel (derived from PRODUCT.md):** At 1366px `.kpi-grid` is still six columns — its first breakpoint is 1100px — so each tile gets ~200px minus gutters with a 40px avatar inside; `قيد التفاوض` and `إجمالي العروض` wrap or collide while `مباع` sits alone in identical space. The one thing he opens the app for is below the fold. Ochre at 3.4:1 plus Material amber on a washed-out TN panel means the two "attention" colors on his screen are the two least visible ones. And if he's a viewer-only account, `إجراءات سريعة` renders as a titled card with a completely empty body — all four buttons are `v-if`'d away with nothing replacing them.

## Minor Observations

- `.financial-grid` is dead CSS; the API still returns the data it was built for.
- The responsive ladders don't line up: `.kpi-grid` drops to 2 columns at **600px** while the documented contract says 760px, and the global search disappears at 760px — so between 601–760px the grid is 3 columns with no search. (Extracted from the live CSSOM.)
- `counts.archived` is fetched and never displayed, so the five state tiles don't sum to `إجمالي العروض` — someone will notice and ask.
- `آخر العروض` is the only card without `v-card-text`, so its rows sit flush to the border while its neighbour's are inset 16px — visible misalignment side by side. Its `v-list` also has no `v-else`, so on empty data the empty-state and an empty list wrapper both render.
- Two layout systems on one page: a CSS-grid KPI row followed by Vuetify's negative-margin `v-row`, bridged with `mb-4`.
- The governorate/district `v-chip`s look exactly like removable filter tokens and are not clickable — an affordance lie.
- `v-skeleton-loader type="card, card, card"` models three stacked cards for a layout of 6 tiles + 7 panels: guaranteed layout shift on every cold load.
- The subtitle "نظرة شاملة على نشاط المكتب." carries zero information and occupies the slot where "آخر تحديث: …" belongs.
- `daysSince` returns `0` on clock skew and has no `NaN` guard.
- `runBackup` is the only irreversible-feeling action on the page and looks identical to three navigation buttons — for an offline product this button is the entire disaster-recovery story, and it gives a spinner and a six-word snackbar with no file path, size, or "your last backup was 12 days ago."

## Questions to Consider

1. If you deleted this page tomorrow and made `/properties` the landing route, what would the broker actually lose? Name the thing. If you can't, the page's job hasn't been defined yet.
2. The subtitle promises **نشاط** — activity, movement. Every number on the screen is a _stock_. Where is "this week"? Where is a single delta or comparison on a page whose stated purpose is "what moved"?
3. The server computes the total value of the office's entire inventory and hands it to this component, which discards it. Is that a design decision you'd defend to the owner paying for the software, or an unfinished feature whose CSS is still lying in the file?
4. If a reminder is genuinely a **تنبيه**, why is it the one list on the page you can't click, and why can't you mark it done from the place that alerted you?
5. Six identical KPI tiles is what you build when you don't yet know which number matters. If you could keep exactly one, which one — and what does that say about the other five?
6. What does this screen look like on day one in a new office with zero listings: six zeros and five variations of "لا يوجد," none of which tell you to add a property. Is that the first impression you want to sell the product on?
7. DESIGN.md says novelty is spent on "plot identity, duplicate detection, followups." Two of those three are supposed to live on this page. Where are they?
