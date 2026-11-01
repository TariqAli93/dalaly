---
name: Dalaly
description: Arabic-first Windows desktop workbench for an Iraqi real-estate office; records on a quiet canvas, dark-teal navigation, one command bar.
colors:
  registry-teal: "#116466"
  registry-teal-night: "#74C8C0"
  seal-ochre: "#C27C3A"
  seal-ochre-night: "#E7AE77"
  waiting-ochre: "#8A5A1F"
  waiting-ochre-night: "#D8A15F"
  settled-sage: "#5B6F62"
  settled-sage-night: "#9DB5A7"
  matched-green: "#2F6D4F"
  matched-green-night: "#7FC9A3"
  error-red: "#B3261E"
  error-red-night: "#FFB4AB"
  nav-teal: "#193638"
  on-nav: "#FFFFFF"
  canvas: "#F3F5F6"
  surface: "#FFFFFF"
  surface-variant: "#E6ECEE"
  secondary-tint: "#E8EEF0"
  hairline: "#D9E2E5"
  ink: "#1B2B30"
  ink-muted: "#546064"
  night-canvas: "#1D3034"
  night-surface: "#192C30"
  night-surface-variant: "#213B40"
  night-hairline: "#355057"
  night-ink: "#EDF5F5"
  night-ink-muted: "#B8C3C4"
typography:
  title:
    fontFamily: "Cairo, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "normal"
  headline:
    fontFamily: "Cairo, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.65
    letterSpacing: "normal"
  kpi:
    fontFamily: "Cairo, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
  section:
    fontFamily: "Cairo, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Cairo, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-tajawal:
    fontFamily: "Tajawal, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-almarai:
    fontFamily: "Almarai, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-plex-arabic:
    fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Cairo, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Cairo, 'Segoe UI', Tahoma, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "4px"
  panel: "8px"
  pill: "9999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "20px"
  s6: "24px"
  gutter: "12px"
  gutter-wide: "16px"
  cell-x: "8px"
  bar: "48px"
  row: "40px"
  head: "36px"
components:
  button-primary:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-text:
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "32px"
  input-outlined:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "40px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  panel-header:
    typography: "{typography.section}"
    padding: "8px 12px"
    height: "40px"
  command-bar:
    backgroundColor: "{colors.canvas}"
    typography: "{typography.title}"
    padding: "0 12px 0 4px"
    height: "48px"
  nav-pane:
    backgroundColor: "{colors.nav-teal}"
    textColor: "{colors.on-nav}"
    width: "232px"
  nav-item-active:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.on-nav}"
    rounded: "{rounded.control}"
    height: "36px"
  grid-row:
    typography: "{typography.control}"
    padding: "0 8px"
    height: "40px"
  grid-header:
    backgroundColor: "{colors.surface-variant}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    height: "36px"
  row-thumbnail:
    backgroundColor: "{colors.surface-variant}"
    rounded: "{rounded.control}"
    width: "36px"
    height: "28px"
  status-chip:
    typography: "{typography.label}"
    rounded: "{rounded.control}"
  count-badge:
    backgroundColor: "{colors.surface-variant}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
---

# Design System: Dalaly

Recorded from the shipped renderer (2026-10-26, branch `feat/desktop-redesign-phases-3-7`). Sources: `src/styles.css`, `src/plugins/theme.ts`, `src/composables/useAppearance.ts`, `src/main.ts`, `src/assets/fonts/fonts.css`, `src/constants/domain.ts`, `src/components/shared/`, `src/components/app/`, `src/layouts/AppLayout.vue`. Where this file and the code disagree, the code wins and this file is regenerated.

## Overview

**Creative North Star: "The Dalaly Desk"**

Dalaly is a Windows program a broker works inside all day, not a website in Electron. The record (plot identity, owner, price, status) is the product; everything on screen serves finding it, reading it correctly, or changing it safely. The shell is one connected workspace: a dark-teal navigation pane on the right, one 48px command bar across the top, and white panels standing directly on a pale grey-teal canvas.

The world is quiet and dense. One Arabic sans (Cairo by default), teal for action, selection and location, ochre for "waiting on a human", neutrals for everything else. Depth comes from 1px hairlines and the canvas, never from shadows on resting content. RTL is the ground truth, and the only Latin on screen is data (codes, phones, prices) in Latin digits with bidi isolation.

These are owner decisions and are binding: dark-teal navigation pane, white surfaces, teal and ochre, Cairo as default font, the appearance settings, one command bar, expanded navigation with a remembered rail, 28px thumbnails in 40px rows, panels on the canvas, two radii, colour for state only, Latin digits, four data states, and the keyboard map.

**Key Characteristics:**

- One 48px command bar holds the page title, record context, count, status and page actions; there is no in-content page header.
- Navigation pane expanded with labels (232px) by default; the 56px icon rail is a remembered per-machine choice.
- Desktop density: 40px rows, 36px table header, 40px fields, 32px command-bar buttons, 12px canvas gutter.
- Panels (white, 1px hairline, 8px radius, no shadow) sit directly on the canvas; nothing white sits on white.
- Two radii: 4px controls, 8px containers. Pills only for numeric counts.
- Colour carries state, not decoration.
- Every size scales with the user's text-size setting (`--dal-font-scale`).

## Colors

A pale, cool neutral field with one saturated identity (teal) and one waiting colour (ochre); all other hue is semantic state. Colours are Vuetify theme roles (`dalalyLight` / `dalalyDark` in `plugins/theme.ts`), exposed to CSS as `--dal-*` aliases in `styles.css`.

### Primary

- **Registry Teal** (light `{colors.registry-teal}`, dark `{colors.registry-teal-night}`): primary buttons, links (`primary-text`), the active nav item, selected rows (teal at 12% fill), the focus ring, available status, KPI values.

### Secondary

- **Seal Ochre** (`accent`; `{colors.seal-ochre}` / `{colors.seal-ochre-night}`): fills and large text only. On screen ochre is normally carried by **Waiting Ochre** (`warning`; `{colors.waiting-ochre}` / `{colors.waiting-ochre-night}`), which passes 4.5:1: reserved, negotiating, the unsaved-changes dot.

### Tertiary (state)

- **Settled Sage** (`info`): sold, rented.
- **Matched Green** (`success`): matched, confirmations.
- **Error Red** (`error`): destructive actions, errors, overdue KPI values above zero.

### Neutral

- **Nav Teal** (`sidebar`, same in both modes) with white `on-sidebar`: the navigation pane.
- **Canvas** (`background`): behind panels and under the command bar.
- **Surface**: panels, dialogs, menus, fields, the sticky save bar.
- **Surface Variant**: table header, hover fill, count badges, empty thumbnails.
- **Hairline** (`border`): panel, divider, toolbar and cell strokes.
- **Ink** / **Ink Muted**: text and secondary text. `muted` and `primary-text` are derived, not set: `muted` is on-surface at the medium-emphasis opacity, `primary-text` is primary nudged toward ink until it reaches 4.5:1 on every reading surface.
- Dark mode: `night-canvas` is the canvas and `night-surface` the panels (the canvas is the lighter of the two in dark).
- Field outlines are on-surface at 50% (light) / 40% (dark) opacity, 100% when focused, for 3:1 against the surface.

### Appearance settings (owner decision)

Settings > Appearance lets the user set primary, secondary, accent, background, surface and sidebar per mode, pick a preset (دلالي teal, أزرق هادئ, زيتوني), choose the font and text size, and choose fluid width or a max width (960 to 1920px, default fluid). `createTheme()` derives every other role from the six choices: ink from the surface (tinted ink when it reaches 7:1, else pure black or white), muted opacity raised until 4.5:1 on every reading surface, the hairline as ink at 15% on the surface, and on-colours for every fill. Theme defaults to the Windows light/dark preference until the user picks one.

### Named Rules

**The State-Not-Decoration Rule.** Teal means action, selection or location; ochre means a human still has to decide; sage means settled; red means destructive or error. A coloured surface doing none of these is removed.

**The Status Map Rule.** Record status colour comes from `statusColor()` in `constants/domain.ts` and nowhere else: available = primary, reserved and negotiating = warning, sold and rented = info, matched = success, archived and closed = neutral.

**The Derived Contrast Rule.** Never hard-code text colours over theme roles; use `muted`, `primary-text` and the `on-*` roles so custom themes stay legible.

## Typography

**Body Font:** Cairo (bundled variable font, weights 200 to 1000), with `"Segoe UI", Tahoma, sans-serif` fallback.
**Selectable in Settings:** Tajawal, Almarai, IBM Plex Sans Arabic (bundled, regular and bold; the `body-tajawal`, `body-almarai`, `body-plex-arabic` variants), Segoe UI, Tahoma (system). The choice replaces the first family in `--dalaly-font` for every role; sizes and weights do not change.

**Character:** one Arabic UI sans for everything; hierarchy from size and weight (400 / 600 / 700) only. Vuetify's Roboto `text-*` classes are forced back to `--dalaly-font`, and Latin letter-spacing and uppercase are removed from buttons and titles.

### Hierarchy

Every size is `calc(Npx * var(--dal-font-scale))`; scale 0.9 / 1 / 1.125 / 1.25 from the text-size setting.

- **Title** (700, 16px, 1.4): the page title `h1` in the command bar.
- **Headline** (600, 17px, 1.65): dialog titles. The brand name in the nav header is 17px / 700.
- **KPI** (700, 20px, 1.2, tabular): the emphasised fact (price) in record facts and the dashboard's risk counts. The dashboard summary strip, the top tier of that page, sets its values at 22px; figures inside dashboard panels are 18px.
- **Section** (700, 14px): panel headers, form-section legends, detail-list titles.
- **Body** (400, 14px): application base, detail values (600), side-pane values.
- **Control** (13px): table cells, fields, field labels, buttons (600), tabs, nav items, list items.
- **Label** (12px): table headers (600, muted), detail labels, hints, chips (600), counts, timestamps.

### Named Rules

**The One Family Rule.** One family at a time, the user's choice. No display face, no second family for numbers.

**The Latin Digits Rule.** Every number renders in Latin digits through `utils/format.ts` (`numberingSystem: "latn"`, `en-US` grouping). Latin data (money, phones, codes, ISO-style contract dates) is isolated with `direction: ltr; unicode-bidi: isolate` (`.money`, `<bdi>`, tel/email/date inputs) and uses tabular figures. Dates and times from `formatDate` / `formatDateTime` / `formatTime` carry Arabic «م/ص», «،» and RLM marks, so they are isolated as `<bdi dir="rtl">`; forcing them LTR scrambles them. Only a `<bdi>` without `dir` is forced LTR.

## Layout

- **Shell** (`AppLayout`): skip link first ("تخطَّ إلى المحتوى"), then the nav pane (right), the command bar, and `main#dal-main` directly on the canvas. On route change focus moves to the page `h1`.
- **Navigation pane:** 232px expanded, 56px rail, permanent at md and up, temporary drawer below. Expanded is the default; the rail state is stored in `dalaly.sidebar.rail.v1`. The brand header matches the 48px bar height. Sections carry 12px headers; the list is one tab stop with arrow keys and Home/End.
- **Command bar:** 48px, canvas-coloured, hairline below. Leading edge: nav toggle, parent-list link with chevron (record pages), the `h1` (truncates at min(24em, 30vw), full title in its tooltip), the count badge, the status slot, then page actions after a hairline separator. Trailing edge: quick add, global search (260px field), notifications, theme toggle, refresh, user menu. Pages fill it through `AppPage` (`title`, `parent`, `count`, `#status`, `#header-actions`).
- **Command bar collapse:** the bar is a size container (`dal-commandbar`), so collapse follows the bar's own width (nav expanded or rail), not the window. Nothing in the bar may overlap; the title group has no box of its own (`display: contents`) so the `h1` is the item that gives way, down to 4em. In order:
  - The search field shrinks first (it hides Ctrl+K, then its label).
  - Bar under 1200px: user name and the quick-add label hide (both stay in tooltips); with 3+ page actions the search starts as its 32px icon.
  - Bar under 1000px (1366px at 125% with the nav expanded): the parent link hides, the search is always its icon, and with 3+ page actions the non-primary actions that have an icon show the icon only. Their label stays as the accessible name and is mirrored into `title` by `AppTopbar`.
- **Content:** gutter 12px, 16px at 1440px and up; max width 1920px, or the user's max width when fluid is off.
- **List pages:** a panel that fills the viewport height (`100dvh - bar - 2 gutters`), toolbar on top, table body scrolling alone with a sticky header and visible footer.
- **Master-detail:** list plus a 340px sticky summary pane separated by the gutter; at 1100px and below the pane becomes a 360px overlay from the far edge with a scrim, Esc closes.
- **Record pages:** facts strip, then tabs in a panel beside an always-visible media column (`minmax(280px, 380px)`), stacking at 1100px.
- **Forms:** sections in a 3 / 2 / 1-column grid (12px row, 16px column gap), reflowing at 1100px and 760px.
- Responsive change is structural (column priority, pane overlay, reflow), never fluid type.

### Named Rules

**The Command Bar Owns the Page Rule.** Title, context, count, status and page actions go in the 48px bar. No in-content page header, subtitle block or breadcrumbs.

**The Data First Rule.** Table columns carry a priority: priority 2 hides under 70rem of grid width, priority 3 under 54rem, so a narrow pane drops columns before it scrolls sideways.

## Elevation & Depth

Flat at rest. Depth comes from three planes: canvas, hairline-bordered surface, and floating overlays. Only things that float carry a shadow.

### Shadow Vocabulary

- **Pop** (`--dal-shadow-pop`; light `0 8px 24px rgba(0,0,0,0.16)`, dark `0 10px 28px rgba(0,0,0,0.55)`): menus, dialogs, the search palette, the overlay summary pane.
- **Rest** (`--dal-shadow-rest`) is defined but resting content does not use it; flat bordered cards have their shadow removed.

### Named Rules

**The Borders-Not-Shadows Rule.** Resting content is separated by 1px hairlines and the canvas. A shadow on a resting panel is a defect.

**The No Surface-on-Surface Rule.** Panels sit on the canvas. Inside a panel, divide with hairlines (toolbar, form sections, facts, detail rows), never with a nested card. `v-card` is for dialogs.

## Shapes

Two radii: 4px (`--dal-radius-control`) for buttons, icon buttons, fields, chips, nav items, thumbnails, keycaps; 8px (`--dal-radius-card`, Vuetify `rounded="lg"`) for panels, dialogs, menus, the summary pane, alerts and snackbars. The 9999px pill is only for numeric count badges. The overlay summary pane is square-edged against the window edge. Borders are 1px hairlines. Scrollbars are thin (12px track, 8px-radius thumb inset 3px).

### Named Rules

**The Two Radii Rule.** 4px controls, 8px containers. Any other radius is a bug.

## Components

### Buttons

- **Shape:** 4px, flat, no ripple, no uppercase or letter-spacing; 13px / 600.
- **Primary:** solid teal with white text, one per area (the form save button, the page's main command). Light-mode hover darkens it slightly.
- **Secondary / tertiary:** tonal for recovery actions (retry, clear filters), text for everything else. Destructive actions use the error colour as text inside menus, last, after a divider.
- **Command bar:** 32px buttons (10px side padding) and 32px icon buttons, the nav toggle included.
- **Focus:** 2px primary outline, 2px offset, on every focusable element; `on-sidebar` colour inside the nav pane.

### Chips

- **Status chip:** tonal, squared (`label`), small, colour from the status map.
- **Filter chips:** tonal, squared, closable, with "مسح الكل" after them.
- **Count badge:** pill on the surface-variant fill, muted 12px / 600.

### Panels / Containers

- **Panel** (`.dal-panel`): surface, 1px hairline, 8px, no shadow, clips its content. Header 40px min, 8px 12px padding, section-weight title. Tabs that switch the whole panel (settings, leases, cash transfers) are its first row (`.dal-panel__tabs`, hairline below), never on the canvas above it.
- **Summary strip:** one panel of equal cells (150px basis, labels wrap rather than truncate) divided by vertical hairlines. The value (22px / 700, tabular) leads at the start in a fixed 2.4em column, with the label 13px / 600 and note 12px muted beside it, so the eye never crosses the cell. Value colour is state: `primary-text` for opportunity, `warning` when a human must decide, `error` for overdue work, muted at zero. Each cell is a button that opens its section.
- **Money strip** (`MoneyStrip`, accounting and reports): the same panel of equal cells (170px basis), but the label sits above the value because amounts are long: one 20px / 700 tabular line per currency (dinars and dollars are never added), a 12px muted note under it saying what the figure covers ("حتى اليوم", "هذا الشهر"). A count cell shows one number instead. `warning` marks money still owed; zero is muted. Cells that open a list are buttons.
- **Panel figures:** inside a dashboard panel, a band of equal cells under the header, divided by hairlines, number (18px / 700) above a 12px muted label; each cell links to its filtered list. Same state colours as the summary strip.
- **Ledger rows:** dashboard lists (tasks, rentals, deals, customers, risks, customers awaiting a decision) share one row anatomy: what and who at the start (13px / 600 over a 12px muted line, both truncating), and one scannable value at the end (time, amount, days; 12px / 600, tabular, with an optional 12px muted caption). Rows are full-bleed with hairlines between them, hover fill, and an inset focus ring. Colour marks only that end value, and only when it carries state the row doesn't already imply.
- **Record facts:** the same strip form for a record's identity, price, status and owner.
- **Detail list:** `dl` grid of auto-fill 180px columns, 12px muted label over a 14px / 600 value, hairline under each row.

### Inputs / Fields

- **Style:** outlined, compact (40px), 4px, surface fill, 13px text and label, placeholder at 72% opacity.
- **Focus:** outline reaches full opacity.
- **Error:** the field's error state with a plain-Arabic message under it.
- File inputs keep their icon inside the field.

### Navigation

- **Pane:** nav-teal with white text, items 36px with 4px radius and 18px icons, 13px labels. Hover is white at 8%. Active is a teal fill with white text at 600 plus a 3px leading indicator. In the rail, items centre their icon and show tooltips.
- **Sub-items:** an item's rare pages (cash boxes, journal and chart under الحسابات; templates under العقود; users, roles and locations under الإعدادات) show beneath it, indented 28px and 32px high, only while the user is inside that area. The parent then keeps 600 weight without the fill; the page itself carries the fill.
- **Footer:** «المساعدة وحول التطبيق» is pinned below the list, under a hairline, so it is one click from every page without taking a navigation slot.

### Data Grid (signature)

`DataGrid` wraps `v-data-table(-server)`: 36px header on surface-variant with muted 12px / 600 titles, 40px rows, 8px cell padding, hover fill, nowrap cells, hairline row borders. Rows are the keyboard unit (roving tabindex). Selection is a teal fill at 12% with `aria-selected`, not a stripe. Listing rows lead with a 36 x 28px thumbnail (4px radius, 6px vertical margin) inside the 40px row; a missing image shows a teal-tinted placeholder icon. Name cells stack a 600 link over a 12px muted code; long text truncates with the full text in `title`. Footer: page sizes 10 / 25 / 50 / 100 with 32px controls.

**Row actions:** up to two inline icon buttons (out of tab order, native `title`), the rest in one shared "⋯" menu with text labels; Shift+F10 or the Menu key opens every action. Inline icons rest in `muted` (still 4.5:1) and take full ink on the hovered, focused or selected row; an action with its own colour (favourite, danger) keeps it.

**Four data states:** a skeleton of 8 rows on first load (a progress bar while rows are present); empty with an icon, a title and the next step; no-match with "مسح الفلاتر"; error with "إعادة المحاولة" (inline alert when stale rows remain). All are compact and sit inside the data area. `EmptyState` shows a 24px muted icon on a 48px surface-variant tile (8px), a 14px / 700 title and a 12px muted line capped at 44ch.

The footer's page-size select is 32px like its buttons (the compact density's extra 8px top padding is removed).

### Filter Bar

Inside the list panel above the grid, hairline below: search field (Ctrl+F, ↓ to the first row), inline primary filters, then a sub-row of quick views (`aria-pressed` toggles), active-filter chips, and "فلاتر إضافية" with a count opening a 340px end drawer.

### Forms

Page forms are one panel (`.dal-form`) of `FormSection` fieldsets (14px / 700 legend, hairline between sections) ending in a sticky `FormActionsBar`: unsaved-changes dot in waiting ochre, then Save (primary, Ctrl+S) and Cancel (text).

### Menus, Tooltips and Dialogs

- **Menus** (row "⋯" menus and select dropdowns): 8px container with the pop shadow, 4px padding inside, and the hovered or active item highlighted as a 4px-radius inset. The keyboard focus ring sits inside the item so the scroll edge never clips it.
- **Tooltips:** 12px text, 4px 8px padding, a hairline border and a light shadow on the theme's surface-variant, so they don't dissolve into white panels.
- **Dialogs:** a scrollable dialog's actions row gets a top hairline unless the template already puts a divider there.
- **Buttons:** the solid primary darkens slightly on hover and further while pressed (light theme).
- Text selection uses primary at 22%.

### Global Search

Ctrl+K or a click opens a command palette 680px wide: 8px panel with pop shadow, results grouped by type with muted 12px / 700 group labels, active option on the selection fill, ↑ / ↓ / Enter to open.

### Phone

`PhoneLink` shows the isolated number plus call and WhatsApp icon links (16px icons, 4px hover fill, `primary-text`).

### Keyboard Map (owner decision)

Shortcuts match `event.code`, so they work on the Arabic layout; none fire while a dialog is open. The Help page (F1) lists them.

| Keys              | Action                                             | Scope                                  |
| ----------------- | -------------------------------------------------- | -------------------------------------- |
| Ctrl+K            | Global search across listings, customers, requests | Everywhere                             |
| Ctrl+F            | Focus the page search                              | Lists                                  |
| Ctrl+N            | New record of the page's type                      | Sale, rentals, people, requests, users |
| Ctrl+S            | Save                                               | Forms and form dialogs                 |
| Esc               | Close dialog or pane, or clear search              | Everywhere                             |
| ↑ / ↓, Home / End | Previous / next, first / last row                  | Tables                                 |
| PgUp / PgDn       | Previous / next page                               | Tables                                 |
| Enter             | Open the focused row                               | Tables                                 |
| Space             | Select the row and open its summary                | Tables                                 |
| Shift+F10 / Menu  | All row actions                                    | Tables                                 |
| ↓                 | From the search field to the first row             | List search                            |
| Alt+←             | Back, with the same row focused                    | Everywhere                             |
| F1                | Help and shortcuts                                 | Everywhere                             |
| Ctrl+→ / Ctrl+←   | Move an image in the order                         | Listing images                         |

### Motion

Colour and background transitions only, 150 to 180ms ease (nav items, buttons, summary cells). No ripple. Under `prefers-reduced-motion`, skeleton shimmer and progress animation stop, dialogs and expansions fade (120ms) without movement, and the nav drawer stops sliding.

## Do's and Don'ts

### Do:

- **Do** put the page title, record context, count, status and actions in the command bar through `AppPage`.
- **Do** build content as `.dal-panel` regions on the canvas, divided inside by hairlines.
- **Do** use `DataGrid`, `RowActions`, `FilterBar`, `StatusChip`, `RecordFacts`, `DetailList`, `FormSection`, `FormActionsBar`, `PhoneLink` and `ListingImages` instead of rebuilding them.
- **Do** give every data surface its four states: loading, empty, no-match, error with retry.
- **Do** keep 40px rows with 28px-high thumbnails, a 36px header and 8px cell padding.
- **Do** size type as `calc(Npx * var(--dal-font-scale))` so the text-size setting works.
- **Do** route numbers through `utils/format.ts` and isolate Latin data.
- **Do** use theme roles (`primary-text`, `muted`, `on-*`, `--dal-stroke`) so custom themes and dark mode stay legible; check both modes.
- **Do** keep the 2px focus outline visible on everything focusable, and show each shortcut in its control's tooltip and on the Help page.

### Don't:

- **Don't** add an in-content page header, subtitle block or breadcrumbs.
- **Don't** put a card or white surface on a panel, or a shadow on resting content.
- **Don't** use a radius other than 4px or 8px (pills only for counts).
- **Don't** use colour for decoration: no coloured stripes on content, no gradients, no decorative badges. Grid and list selection is a fill, not an edge stripe.
- **Don't** use waiting ochre or seal ochre for small text on light surfaces unless it is the `warning` role.
- **Don't** add a second typeface, display face, fluid `clamp()` type, uppercase or letter-spacing.
- **Don't** add motion that moves layout or doesn't report a state change.
- **Don't** render Eastern Arabic digits.
