---
name: Dalaly
description: Arabic-first desktop workspace for Iraqi brokerage offices — a land-registry ledger you can search.
colors:
  registry-teal: "#116466"
  registry-teal-light: "#4db6ac"
  sage-ink: "#5b6f62"
  sage-ink-light: "#9db5a7"
  seal-ochre: "#c27c3a"
  seal-ochre-light: "#d8a15f"
  paper: "#ffffff"
  paper-field: "#f6f7f5"
  night-surface: "#17211d"
  night-field: "#0f1513"
  error-red: "#b3261e"
  error-red-light: "#ffb4ab"
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
  sm: "4px"
  lg: "8px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-tonal:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.registry-teal}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "40px"
  button-text:
    textColor: "{colors.registry-teal}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input-outlined:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night-surface}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
  chip-tonal:
    backgroundColor: "{colors.registry-teal}"
    textColor: "{colors.registry-teal}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "24px"
---

# Design System: Dalaly

## Overview

**Creative North Star: "The Land Registry Ledger"**

دائرة الطابو keeps the truth about who owns what. Its ledgers are ruled, columned, stamped, and boring on purpose — nothing on the page is there to impress you, and every mark on it can be cited. Dalaly is that ledger made searchable. The visual system's whole job is to make a record readable at a glance and safe to change, for a broker who will look at it for six hours and an owner who will glance at it for thirty seconds.

That produces a deliberately quiet surface: a single Arabic sans doing all the work, flat panels separated by hairline rules rather than shadows, and one deep teal that appears only where the user can act or where the system is telling them where they are. Color is scarce because scarcity is what makes the status of a record legible. The ochre is the seal — the one warm mark on an otherwise cool page, reserved for things that are pending, reserved, or awaiting a human decision.

It is Arabic-native, not mirrored: RTL is the layout's ground truth, Arabic is the interface language, and the only Latin on screen is data that must stay Latin (codes, phone numbers, prices), explicitly isolated so it never flips direction mid-sentence.

**Key Characteristics:**
- Flat surfaces, hairline borders, zero decorative elevation
- One type family; hierarchy carried by weight and size, never by a second font
- Committed teal identity used sparingly — action, selection, and state only
- Latin numerals everywhere, in every locale, without exception
- Two full themes (light for lit offices, dark for laptops in poor light), both first-class

## Colors

A cool, sober palette — registry green-teal and sage against near-white paper — with a single warm ochre reserved for pending states. Both themes are defined in `main.ts` as Vuetify themes (`dalalyLight`, `dalalyDark`); those definitions are the source of truth.

### Primary
- **Registry Teal** (light theme): the identity color. Carries primary buttons, the active nav item, the brand mark, focus and selection. Passes AA comfortably on both paper surfaces (6.9:1 on white, 6.4:1 on the field) so it is safe for text as well as fills.
- **Registry Teal Light** (dark theme): the same role, lifted for dark surfaces (6.8:1 on night surface, 7.6:1 on the night field). Never use the light-theme teal on a dark surface; it drops below AA.

### Secondary
- **Sage Ink**: a desaturated green-gray for secondary actions and lower-priority chips — "sold" and other terminal states that should read as settled, not active. 5.4:1 on white; acceptable for text, but do not put it on the tinted field surface at small sizes.
- **Sage Ink Light**: the dark-theme counterpart.

### Tertiary
- **Seal Ochre**: the one warm color in the system. Reserved for *pending human decision* — reserved listings, scheduled followups, anything awaiting a person. At 3.4:1 on white it is a **large-text and fill color only**; never body text, never a small label on white.
- **Seal Ochre Light**: the dark-theme counterpart (7.2:1 on night surface — safe for text there).

### Neutral
- **Paper**: the content surface. Cards, dialogs, tables, and inputs sit on it in light theme.
- **Paper Field**: the app background — a faintly cool near-white that the paper surfaces sit *on*. The two-layer split (field behind, paper in front) is what gives the flat system its structure.
- **Night Surface** / **Night Field**: the same two-layer relationship inverted for dark theme. Note the field is *darker* than the surface, matching the light theme's logic rather than inverting it.
- **Error Red** / **Error Red Light**: destructive actions and validation failures only.

### Named Rules

**The Scarce Ink Rule.** Teal covers ≤10% of any screen. It marks what the user can act on, what is selected, and where they are. A teal surface that does none of those three is decoration and gets removed.

**The Ochre Means Waiting Rule.** Seal ochre never means "highlight." It means a human still has to decide something — reserved, scheduled, pending. If a state doesn't wait on a person, it doesn't get ochre.

**The Ochre Contrast Rule.** Seal ochre on paper is 3.4:1. It is legal on fills, icons ≥24px, and text ≥18px. It is never legal on body text or small labels. In dark theme this restriction lifts.

## Typography

**Single Family:** Tahoma, with `"Segoe UI"` and Arial as fallbacks.
**Display Font:** none, by design.
**Label/Mono Font:** none — data uses the same family at bold weight.

**Character:** Utilitarian and unglamorous. Tahoma is chosen for one reason: it renders Arabic legibly at small sizes on the Windows machines this app actually ships to, without a webfont download in an offline app. It is not a beautiful Arabic face and the system does not pretend otherwise — it compensates with weight contrast and generous line-height rather than typographic flourish. **This is the system's weakest link and the most likely thing to upgrade** (a real Arabic UI face — IBM Plex Sans Arabic, Noto Sans Arabic, Cairo — bundled locally would be a genuine improvement).

### Hierarchy
- **Headline** (700, 1.5rem / `text-h5`): page titles in the layout header, and the KPI numbers on the dashboard. The largest type in the product; there is nothing above it.
- **Title** (500, 1.25rem / `text-h6`): card titles, dialog titles, the login heading.
- **Body** (400, 0.875rem / `text-body-2`): the default. All prose, list items, table cells, subtitles.
- **Label** (400, 0.82rem): field labels, detail labels, timestamps, shortcut hints. The floor — nothing carrying meaning goes smaller.
- **Data** (700, 0.875rem): record values in the details grid, prices, plot numbers. Bold at body size is how a *value* is distinguished from its *label*, since there is no second font to do it.

### Named Rules

**The One Family Rule.** There is no second typeface. Hierarchy comes from weight (400 / 500 / 700) and size, in that order. A display font in this product would be a costume.

**The Latin Numerals Rule.** Every number in the interface renders in Latin digits (`Intl.NumberFormat("en-US")`, `numberingSystem: "latn"` on dates). Mixing Arabic-Indic and Latin numerals on one screen is the single most common way an Arabic UI reads as unfinished. This is not negotiable and is already enforced in `utils/format.ts`.

**The Bidi Isolation Rule.** Latin-origin data inside Arabic prose (prices, phone numbers, property codes) is wrapped with `direction: ltr; unicode-bidi: isolate` — the existing `.money` class. Any new numeric or code display gets the same treatment or it will flip.

## Layout

Two-layer app shell: a permanent right-hand navigation drawer (260px, collapsing to a 72px icon rail on desktop, temporary overlay below `md`), a 74px top bar carrying brand, global search, theme toggle, and refresh, and a fluid content container at 24px padding (14px below 760px).

Content is composed of CSS Grid regions declared once in `styles.css` and reused by name — `.kpi-grid`, `.form-grid`, `.detail-grid`, `.settings-grid`, `.list-toolbar`, `.advanced-grid`. They share one responsive contract: full column count on desktop, **two** columns at ≤1100px, **one** at ≤760px. Spacing runs on a 6/10/14/16/24px rhythm; cards use 16px internal padding and 14px gutters.

Responsive behavior is structural, never typographic — nothing in this system uses `clamp()`, and it shouldn't. Users sit at a fixed distance from a fixed monitor.

### Named Rules

**The Named Region Rule.** Layout grids are declared once in `styles.css` and referenced by class. A new page reuses an existing region or adds one there — it does not inline a bespoke `grid-template-columns` in a scoped block.

**The Field-Behind-Paper Rule.** Content surfaces are Paper; the app background is Paper Field. Never place a Paper card directly on another Paper card — without shadows there is nothing to separate them.

## Elevation & Depth

**This system is flat and does not use shadows for structure.** Every one of the 42 surfaces in the app is `variant="flat"` with `border`; there is not a single `elevation` prop in the codebase. Depth is expressed entirely through the two-tone surface split (Paper on Paper Field) and 1px hairline borders at Vuetify's `--v-border-color` / `--v-border-opacity`.

Shadows exist only where the platform owns them: menus, dropdowns, dialogs, and the snackbar — surfaces that genuinely float above the page and need to read as temporary. Those keep Vuetify's defaults.

### Named Rules

**The Flat-At-Rest Rule.** A surface never has a shadow because it is important. Importance is communicated by position, border, and teal. Shadow is reserved for overlays that will disappear.

## Shapes

One radius does almost all the work: **8px** (`rounded="lg"`) on every card, panel, dialog, avatar, and detail tile — applied 42 times, with zero deviations. Controls (buttons, inputs, chips) keep Vuetify's tighter 4px so they read as *inside* the surfaces that contain them. Chips in filter contexts may go pill-shaped when they represent a removable token rather than a status.

Borders are always 1px hairlines, never colored accents. The form language is rectangular and calm: no angled cuts, no asymmetric corners, no clipping.

### Named Rules

**The Two Radii Rule.** 8px for containers, 4px for controls. A third radius is a bug.

## Components

### Buttons
- **Shape:** 4px corners, 40px default height.
- **Primary:** solid Registry Teal with Paper text — reserved for the single most important action on a screen (save, log in, confirm). One per view.
- **Tonal** (`variant="tonal"`, 47 uses): the workhorse. Teal at low opacity on Paper — quick actions, secondary operations, toolbar actions.
- **Text** (`variant="text"`, 49 uses): icon buttons and low-weight actions in toolbars and list rows.
- **Hover / Focus:** Vuetify's overlay ramp, 150–250ms. Focus-visible must remain a real ring — never removed for aesthetics.
- **Destructive:** `base-color="error"` on a text or tonal button. Never a solid red primary; destructive actions should not be the most attractive thing on screen.

### Chips
- **Style:** tonal fill, 4px radius, 24px height, `size="x-small"` in tables.
- **State:** status chips carry the record's state (متاح / محجوز / قيد التفاوض / مباع / مؤجر / مؤرشف) in the state's own color — teal for available, ochre for reserved and negotiating, sage for sold and rented, muted neutral for archived.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** Paper on the Paper Field app background.
- **Shadow Strategy:** none — see Elevation & Depth.
- **Border:** 1px hairline, always present. The border *is* the card.
- **Internal Padding:** 16px.

### Inputs / Fields
- **Style:** outlined — 1px hairline, 4px radius, transparent fill, so fields speak the same language as the surfaces around them. *(Current state: the 81 fields in the codebase pass no `variant`, so they render as Vuetify's default filled. Setting `VTextField` / `VSelect` / `VAutocomplete` / `VTextarea` defaults to `outlined` in `createVuetify({ defaults })` is the confirmed target and a known open gap.)*
- **Density:** `compact` in tables, filters, and dialogs; `comfortable` in the main property form.
- **Focus:** teal border shift plus Vuetify's focus ring. Never suppressed.
- **Error:** error-red border with the message in plain Arabic beneath the field — what went wrong *and* what to do.

### Navigation
- **Right-hand drawer** (RTL): 260px, permanent at `md` and up, collapsing to a 72px icon rail via the top-bar nav icon; temporary overlay below `md`.
- **Items:** icon + Arabic label, `density="comfortable"`, active item in teal. Items the user lacks permission for are removed, not disabled.
- **Footer:** current user and session, with logout in error color at the bottom.

### Data Table (signature component)
The properties table is the product's center of gravity. Compact density, Latin numerals right-isolated, status as a chip in its own column, actions as text-variant icon buttons at the row end, and the plot identity (رقم القطعة + الحرف) rendered through `formatPlot()` so it is identical everywhere it appears — table, details dialog, export, and print.

### Detail Tile (signature component)
The `.detail-item` in the property dialog: an 8px bordered tile, 76px minimum height, label at 0.82rem in muted ink above a bold value at body size. It is the ledger cell, and it is the reason the system needs no second font — label and value are separated by weight alone.

## Do's and Don'ts

### Do:
- **Do** use `rounded="lg"` + `variant="flat"` + `border` for every new surface. That trio is the system.
- **Do** render every number through `formatMoney` / `formatNumber` and every date with `numberingSystem: "latn"`.
- **Do** wrap Latin-origin data in Arabic prose with the `.money` bidi-isolation treatment.
- **Do** reuse a named grid region from `styles.css`, or add the new one there.
- **Do** give every interactive element a real focus-visible state — this app must be fully operable from the keyboard.
- **Do** write empty states that say what to do next, not just that there's nothing here.
- **Do** verify new colors in *both* themes before shipping; dark mode is a supported mode, not a toggle.

### Don't:
- **Don't** add `elevation` to a card or panel. Flat at rest is the rule.
- **Don't** introduce a second typeface, or a display font in labels, buttons, or data.
- **Don't** use Seal Ochre for body text or small labels on light surfaces (3.4:1 — it fails AA).
- **Don't** use `clamp()` for type. This is a fixed-distance desktop product.
- **Don't** nest a card inside a card. Use a divider, a tile, or nothing.
- **Don't** put a decorative icon avatar on a block just to fill space — the dashboard's KPI row is already at the limit of that pattern.
- **Don't** hide functionality at small breakpoints (the global search currently `display: none`s below 760px — that's a bug, not a pattern to copy).
- **Don't** add motion that doesn't report a state change. 150–250ms, and every transition needs a `prefers-reduced-motion` alternative.
