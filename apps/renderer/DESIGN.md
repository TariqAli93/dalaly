---
name: Dalaly
description: Arabic-first native desktop workspace for Iraqi brokerage offices — a Fluent (Windows 11) records workbench.
colors:
  registry-teal: "#116466"
  registry-teal-light: "#4db6ac"
  sage-ink: "#5b6f62"
  sage-ink-light: "#9db5a7"
  seal-ochre: "#c27c3a"
  seal-ochre-light: "#d8a15f"
  canvas: "#f3f3f3"
  surface: "#ffffff"
  nav: "#ebebeb"
  night-canvas: "#1c1c1c"
  night-surface: "#272727"
  error-red: "#b3261e"
  error-red-light: "#ffb4ab"
  warning: "#8a5a1f"
  success: "#2f6d4f"
typography:
  headline:
    fontFamily: "Tahoma, 'Segoe UI', Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 2rem
    letterSpacing: "normal"
  title:
    fontFamily: "Tahoma, 'Segoe UI', Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.75rem
    letterSpacing: "normal"
  body:
    fontFamily: "Tahoma, 'Segoe UI', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.425rem
    letterSpacing: "normal"
  label:
    fontFamily: "Tahoma, 'Segoe UI', Arial, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 400
    lineHeight: 1.25rem
    letterSpacing: "normal"
  data:
    fontFamily: "Tahoma, 'Segoe UI', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.425rem
    letterSpacing: "normal"
rounded:
  control: "4px"
  card: "8px"
  pill: "9999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "20px"
  s6: "24px"
components:
  button-primary:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-tonal:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.registry-teal}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  nav-item-active:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.registry-teal}"
    rounded: "6px"
    height: "40px"
  input-outlined:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.night-surface}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
---

# Design System: Dalaly

> **Redesign in progress (2026-07):** moving from the original flat "Land Registry Ledger" world to a native **Fluent 2 / Windows 11** desktop world. The token layer and application shell are implemented; pages adopt the shared components incrementally. Where this document and the code disagree, the code (`main.ts` themes, `styles.css` `--dal-*` tokens, `components/shared/*`) is the source of truth.

## Overview

**Creative North Star: "The Dalaly Desk"**

Dalaly is a program a broker opens on a Windows machine and works inside all day. It should feel like a native Windows 11 application — a quiet Fluent workbench — not a website rendered inside Electron. The heritage is still the land registry: the record (plot identity, owner, price, status) is the product, and everything on screen serves finding it, reading it correctly, or changing it safely. What changed is the material: instead of a flat paper ledger, records now sit on **layered neutral surfaces with just enough depth to feel physical** — a grey canvas, white panels lifted a hair above it, flyouts that float.

The system stays disciplined and calm: one Arabic sans, a scarce teal accent for action and location, neutral everything else, and motion only where it reports a state change. It is Arabic-native, not mirrored — RTL is the ground truth, the navigation pane sits on the right, and the only Latin on screen is data (codes, phone numbers, prices) held in explicit bidi isolation.

**Key Characteristics:**

- One connected workspace: 44px command bar + 240px navigation pane + borderless content — not a page of cards
- Desktop density: compact rows, small titles, tight spacing; more data visible without scrolling
- Depth from hairline borders and the neutral canvas, not from card shadows
- One type family; hierarchy by weight and size, never a second font
- Scarce teal identity — action, selection, and location only
- Latin numerals everywhere, bidi-isolated, without exception
- Two fully-supported themes (light for lit offices, dark for laptops in poor light)

## Colors

Neutral, layered, sober. A grey canvas carries white content surfaces; the teal identity and the semantic colors are the only saturation on screen. All theme colors live in `main.ts` (`dalalyLight` / `dalalyDark`); the layered-neutral texture (nav, strokes, hover/active fills, elevation) lives in `styles.css` as `--dal-*` variables scoped per theme.

### Primary

- **Registry Teal** `#116466` (light) / `#4db6ac` (dark): the identity. Primary buttons, active nav item, selection, focus, brand mark. AA on both surfaces (≥6.4:1 light).

### Secondary / Tertiary

- **Sage Ink** `#5b6f62`: settled states (مباع / مؤجر), lower-priority chips, `info`.
- **Seal Ochre** `#c27c3a` → mapped to `warning` `#8a5a1f` (light) for legibility: states awaiting a human decision (محجوز / قيد التفاوض). Ochre on white is 3.4:1 — fills and large text only.
- **Success** `#2f6d4f`: confirmations only.

### Neutral (the layers)

- **Canvas** `#f3f3f3` (light) / `#1c1c1c` (dark): the app background — the "desk".
- **Surface** `#ffffff` (light) / `#272727` (dark): cards, panels, dialogs, inputs — lifted off the canvas by a hairline stroke plus a very subtle shadow.
- **Nav** `#ebebeb` (light) / `#1c1c1c` (dark): the navigation pane, distinct from content.
- **`--dal-stroke` / `--dal-hover` / `--dal-active`**: hairline borders, neutral hover fills, and the teal selection fill — the interaction texture.

### Named Rules

**The Scarce Ink Rule.** Teal covers ≤10% of a screen: what you can act on, what is selected, where you are. A teal surface doing none of those is decoration and gets removed.

**The Ochre Means Waiting Rule.** Ochre/`warning` never means "highlight." It means a human still has to decide — reserved, negotiating, scheduled.

**The Layered Neutral Rule.** Depth comes from three neutral planes (canvas → surface → flyout), not from color. Never place a surface panel directly on another surface panel; separate them with the canvas, a divider, or a tile.

## Typography

**Single family:** Tahoma, `"Segoe UI"`, Arial. No display font, by design. This is a legibility compromise for offline Windows and the most likely future upgrade (a bundled Arabic UI face — IBM Plex Sans Arabic, Cairo, Noto Sans Arabic). Vuetify's `text-*` classes are force-overridden to this family in `styles.css` because their Roboto default carries no Arabic glyphs.

### Hierarchy

- **Headline** (700, 1.5rem / `text-h5`): page titles, KPI numbers.
- **Title** (500, 1.25rem / `text-h6`): card and dialog titles.
- **Body** (400, 0.875rem): the default — prose, list items, table cells.
- **Label** (400, 0.82rem): field/detail labels, timestamps, breadcrumbs. The size floor for meaning.
- **Data** (700, 0.875rem): record values — prices, plot numbers. Bold at body size distinguishes value from label without a second font.

### Named Rules

**The One Family Rule.** No second typeface. Hierarchy from weight (400 / 500 / 700) and size.

**The Latin Numerals Rule.** Every number renders in Latin digits (`Intl.NumberFormat("en-US")`, `numberingSystem: "latn"`). Enforced in `utils/format.ts` (`formatMoney`, `formatNumber`, `pluralizeDays`).

**The Bidi Isolation Rule.** Latin data inside Arabic prose (prices, phones, codes, timestamps) is wrapped `direction: ltr; unicode-bidi: isolate` — the `.money` class. Any new numeric/code display gets it or it will flip.

## Layout

**Native desktop shell** (`AppLayout` + `AppSidebar` + `AppTopbar`):

- **Navigation pane** (right, RTL): 264px NavigationView with visual groups (main / الإدارة / النظام), a teal selection pill on the leading edge, collapse to a 64px icon rail with tooltips, brand header, and a user footer. Permission-filtered; items the user lacks are removed, not disabled.
- **Command bar** (top): compact 56px — nav toggle, rounded global search, theme toggle, refresh, user menu. Sits on the surface with a hairline bottom stroke.
- **Content**: fluid container at 24px padding, breadcrumbs above the page header (title + subtitle + actions slot), then the page. Named CSS grid regions in `styles.css` (`.kpi-grid`, `.form-grid`, `.detail-grid`, …) are reused by class, responsive at 1100px and 760px.

Responsive behavior is structural (rail collapse, grid reflow), never fluid typography — fixed-distance desktop.

### Named Rules

**The Named Region Rule.** Layout grids are declared once in `styles.css` and referenced by class; a new page reuses a region or adds one there.

## Elevation & Depth

**Depth comes from borders, not shadows.** (Native Desktop Correction, 2026-07: the brief screenshots read as "cards floating on a canvas" — a web tell — so the rest shadow on content surfaces was removed.) Two planes only carry shadow:

- **Content** (panels, the data grid, inputs, the summary strip): flat, on the canvas, separated by a **1px `--dal-stroke` hairline** — no shadow, no elevation. Panels are bordered regions (`.dal-panel`), not cards.
- **Flyout** (menus, dialogs, tooltips): the only shadow in the system — `--dal-shadow-pop` — because these genuinely float and will disappear.

### Named Rules

**The Borders-Not-Shadows Rule.** Content is separated by hairline strokes and the neutral canvas, never by drop shadows. A shadow on a resting content surface is a web tell — remove it.

**The No-Card-By-Default Rule.** If content can be shown without a card, it is. Reach for a `.dal-panel` (bordered region with a small section header) or a plain bordered container. A `v-card` is only for a genuinely independent, liftable object — and even then it wears no shadow. Never stack surfaces (no card-in-card).

## Native Desktop

Dalaly must read as a Windows 11 desktop program (Explorer / Outlook / VS Code / Access density), not a responsive admin site inside Electron. Adding Fluent colors or Windows corners does not make it native — **layout, density, and the absence of card chrome** do.

### Desktop density (implemented)

| Element                       | Metric                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| Command bar (topbar)          | 44px, flat, hairline bottom stroke, page title + actions inline       |
| Sidebar                       | 240px, rail 56px; nav item ≈ 40px, 4px radius, thin leading indicator |
| Data-grid rows                | ≈ 36px, compact                                                       |
| Fields (search/filters/forms) | Vuetify `density="compact"` globally (≈ 40px)                         |
| Section headers               | 13px bold; page title 15px in the command bar (no hero titles)        |
| Content padding               | 12–16px (no large gutters)                                            |

### Signature desktop patterns

- **Command bar** — `AppTopbar`: page title on the leading edge, one primary action + subtle/icon actions (forwarded from the page's `#header-actions`), spacer, compact search, tools, user menu.
- **Summary strip** — `.dal-summary`: KPIs in one bordered row separated by vertical strokes (label + value + tiny icon). Replaces KPI cards. No card, no shadow, minimal color.
- **Panel** — `.dal-panel`: hairline-bordered region with a 36px `.dal-panel__header` (`.dal-section-title`) and a compact body. The workspace unit instead of a card.
- **Data grid** — the table fills the width inside a `.dal-grid` panel, compact rows, header, inline pagination, small icon actions per row — no wrapping card.

### Native heuristics checklist (run per page)

A page is **not** native until every answer is right:

- Does it look like a website? → must be **no**.
- Any unnecessary card / independent background per element? → **no**.
- Title larger than a desktop app's? → **no**.
- Spacing larger than a desktop app's? → **no**.
- Enough data visible without scrolling? → **yes**.
- Actions near the data they affect / in the command bar? → **yes**.
- More than one primary action per area? → **no**.
- Toolbar reads as a command bar (not a navbar)? → **yes**.
- Grid occupies the workspace? → **yes**.
- Fast with mouse + keyboard? → **yes**.
- Works at 1366×768 and at 100% / 125% Windows scaling? → **yes**.
- RTL is real (icon side, arrows, order), not just flipped? → **yes**.

## Shapes

Two radii: **8px** (``/`--dal-radius-card`) for containers — cards, panels, dialogs, tiles; **4px** (`--dal-radius-control`) for controls — buttons, inputs, chips. Nav items use 6px. Borders are always 1px hairlines, never colored accent stripes. Rectangular, calm, no clipping.

### Named Rules

**The Two Radii Rule.** 8px containers, 4px controls (6px nav items). A stray third radius is a bug.

## Components

Shared presentational components live in `components/shared/` — no business logic, adopted where the pattern is identical.

### Application shell

- **AppSidebar** — NavigationView: grouped, permission-filtered, teal selection pill, rail + tooltips, brand + user footer.
- **AppTopbar** — command bar: search (`runSearch`), theme toggle, refresh, user menu.
- **AppLayout** — breadcrumbs + page header + content; owns drawer/rail state.

### Shared primitives (`components/shared/`)

- **StatusChip** `:status` → tonal, squared (`label`) chip via `statusColor`/`statusLabel`. One source for record status everywhere.
- **EmptyState** `:icon :title :text` + `#actions` slot — compact (`.dal-empty`), inside the data area, teaches the next step.
- _(Removed: StatCard — KPI cards replaced by the `.dal-summary` strip. Growing per page: FormSection, DetailItem, PageToolbar land with their page redesigns.)_

### Buttons

4px, 40px height. **Primary**: solid teal, one per view. **Tonal**: the workhorse. **Text**: icon/low-weight actions. Destructive: `base-color="error"`, never a solid red primary. Real `:focus-visible` ring (global, teal) — never suppressed.

### Inputs / Fields

Outlined by default (`createVuetify({ defaults })` → `variant: "outlined"` on all field types), hairline stroke matching surfaces. `compact` in tables/filters/dialogs, `comfortable` in the property form. Error: `error` stroke + plain-Arabic message beneath.

### Cards / Containers

8px, surface on canvas, hairline stroke + subtle rest shadow, 16px padding. Never nested.

### Chips

Tonal, 4px, status color from `statusColor`. Reserved/negotiating = ochre, sold/rented = sage, available = teal, archived = neutral.

## Do's and Don'ts

### Do:

- **Do** build content as a `.dal-panel` (bordered region + small section header), not a `v-card`. Reserve cards for genuinely independent objects.
- **Do** put page actions in the command bar (`#header-actions`), one primary + subtle/icon rest.
- **Do** keep desktop density — compact fields, ~36px rows, small titles, tight spacing.
- **Do** use the shared components (`StatusChip`, `EmptyState`) instead of re-inlining the pattern.
- **Do** route every number through `formatMoney`/`formatNumber`/`pluralizeDays` and wrap Latin data in `.money`.
- **Do** reuse a named grid region from `styles.css`, or add the new one there.
- **Do** give every control a real `:focus-visible` state — full keyboard operation is required.
- **Do** verify both themes before shipping; dark is a supported mode.
- **Do** test components visually in RTL (icon side, arrow direction, dialog button order, nav position).

### Don't:

- **Don't** wrap a page or section in a big card, or give each element its own background. One workspace, borders between regions.
- **Don't** add a shadow to a resting content surface; shadow is for flyouts (menus/dialogs) only.
- **Don't** use hero page titles or web-sized spacing — this is a desktop program.
- **Don't** stack surfaces — no card inside a card. Use the canvas, a divider, or a tile.
- **Don't** introduce a second typeface or a display font in labels/buttons/data.
- **Don't** use ochre/`warning` for body text or small labels on light surfaces (3.4:1 — fails AA).
- **Don't** use `clamp()` for type — fixed-distance desktop.
- **Don't** reach for Material defaults (`color="warning"/"info"/"amber"`) assuming a hue — the theme defines these; verify the resolved color.
- **Don't** add motion that doesn't report a state change; 150–250ms, with a `prefers-reduced-motion` alternative.
