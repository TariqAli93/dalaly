# Brand identity applied to the renderer, 2026-11-02

A frontend-only pass, done directly on `main` with no branch, commit or pull
request. The brief was to implement the Claude design artifact
`78b43a00-9096-4ff7-b478-b65e8135b33d` in Dalaly. Nothing under `server/` or
`server/drizzle/` was touched, and no business logic, calculation or API
contract changed.

## 1. What the reference is

The artifact is a Design canvas titled «هوية البُركاتي البصرية»: a seven-board
brand-identity guide for «البُركاتي للاستثمار والتطوير العقاري» (cover, logo
concept, logo versions, colours, typography, stationery, applications). It
contains no application screens, so there is no sidebar, table or dashboard
layout to copy. What it does specify exactly, and what this pass implements:

| Reference                                                              | Value                                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Tigris Night (primary, 40%)                                            | `#0E2A33`                                                                                     |
| Limestone (screen background) / paper (cards) / hairlines              | `#F4EFE6` / `#FBF8F2` / `#E3D8C4`, `#D9CDB8`                                                  |
| Baghdadi Brick (supporting) / tile                                     | `#D4BF9A` / `#EDE5D6`                                                                         |
| Brass (accent, 8%); dark brass for small text and links                | `#B8924F`; `#7E5F2B` (`a{color:#7E5F2B} a:hover{color:#0E2A33}`)                             |
| Charcoal (text) / Riverbank (secondary text, data, tables)             | `#1C2326` / `#4A6468`                                                                         |
| Heading face / body face                                               | Reem Kufi 400–700 / IBM Plex Sans Arabic 300–700                                              |
| Geometry                                                               | square corners everywhere (one rounded app icon), 1px hairlines, no shadows                   |
| Ornament                                                               | brass rules (1px under the letterhead header; 2px × 64/40/32px under names); ziggurat pattern |

The guide's logo, name and English lockups belong to the company. Dalaly
keeps its own name and icon.

## 2. Mapping

| Reference element                           | Dalaly                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Colour board                                | `plugins/theme.ts` (`dalalyLight`, `dalalyDark`, derived `link`, `sidebar-accent`, brand `muted`)      |
| Type board                                  | `assets/fonts/` (Reem Kufi, Plex 500/600 added), `--dal-display-font`, `--dalaly-font` in `styles.css` |
| Square boxes on limestone, warm hairlines   | `--dal-radius-*` = 0, Vuetify `rounded: "0"` defaults (`main.ts`), `.dal-panel` on paper               |
| Letterhead: name, brass rule under header   | `AppSidebar` brand header + `AppTopbar` command bar, one continuous 1px brass rule                      |
| Section numbers in brass                    | nav section headers in `sidebar-accent`; active item's 3px brass indicator                             |
| Links in dark brass, Tigris on hover        | `.record-link`, row names, parent link, `link` role                                                    |
| Headings in Tigris Night, Reem Kufi         | page title `h1`, dialog titles, login and first-run titles (`--dal-heading`)                           |
| Cover (Tigris field, rule, tagline, band)   | `AuthLayout` cover side, `SplashScreen`                                                                |
| Ziggurat pattern                            | `--dal-zig`: login band, splash band, nav foot band (windows ≥ 760px tall)                             |

Layout (command bar, 232px nav, panels, 40px rows, master-detail, forms) is
unchanged because the reference does not define one.

## 3. Files

- Theme and tokens: `apps/renderer/src/plugins/theme.ts`, `styles.css`,
  `main.ts`, `composables/useAppearance.ts`, `assets/fonts/fonts.css` plus
  `assets/fonts/reemkufi/` and two Plex weights (OFL, from google/fonts).
- Shell: `components/app/AppSidebar.vue`, `AppTopbar.vue`.
- Brand surfaces: `layouts/AuthLayout.vue`, `layouts/FirstRunLayout.vue`,
  `components/auth/LoginForm.vue`, `components/splash/SplashScreen.vue`,
  `splash.ts`.
- Local radii and colours: `components/settings/AppearanceSettings.vue`,
  `components/shared/FormSection.vue`, `components/shared/PropertyLocationMap.vue`,
  `components/dashboard/MatchRow.vue`, `pages/DealsPage.vue`, `pages/DealPage.vue`.
- Electron window background before first paint: `apps/desktop/src/main.js`
  (`#F4EFE6`).
- Build check: `scripts/assert-production-assets.mjs` now asserts the bundled
  Reem Kufi instead of the splash photo the splash no longer uses.
- Docs: `apps/renderer/DESIGN.md` (owner-decision summary, colours,
  typography, shapes, brand ornament, login/splash, do's and don'ts).

Saved appearance settings that equal the previous defaults (the teal palette,
Cairo) are treated as "not chosen", so existing machines get the new identity
while real customisations and the text size are kept. Checked with a stored
v1 object: font and colours moved to the brand, text size 1.125 and a custom
sidebar colour stayed.

## 4. Verification

- Rendered in the web demo (Playwright, 1366×768 light and dark, 1100×720,
  1920×1080): all 30 main routes, add dialogs, row menu, rail, search
  palette, login, splash. The reference boards were rendered at the same time
  for side-by-side comparison.
- Real Electron 39, isolated (own Vite on 5210, own API port, `dalaly_demo`,
  scratch profile): login, properties list and splash render identically;
  loaded faces: Plex 400/500/600/700, Reem Kufi.
- Navigation fit: at a 690px-tall window the band hides and all 14
  destinations fit without scrolling; at 768px the band shows and they still
  fit.
- Contrast: riverbank 5.1–6.0:1 and dark brass 4.7–5.6:1 on limestone, paper
  and tile; brass headers 5.2:1 on Tigris Night; dark-mode muted and link
  about 7:1 on panels. Brass is never small text on light surfaces.
- `pnpm lint` (ESLint + all typechecks), `pnpm test` (126/126) and
  `pnpm build` (with the offline asset assertions) pass.

Fixed on the way: the active-nav indicator had always been invisible because
Vuetify's own `.v-list-item::after` layer (opacity 0) overrode it; Vuetify's
reset sets `background-repeat: no-repeat` on every element, so each pattern
use states its repeat.

## 5. Screenshots

`screenshots/`: `reference-cover` / `login` / `login-dark`,
`reference-colors` / `dashboard` / `dashboard-dark`, `reference-typography` /
`property-details`, `properties`, `properties-dark`, `people-dialog`, `rail`,
`settings`, `dashboard-1100`, `properties-1920`, `splash`,
`electron-properties` (real Electron window). The state before this pass is
in `../ui-refinement/screenshots/after-*.png`.

## 6. Not reproduced, and open

- The logo, the company name, the English tracked labels and the Eastern
  Arabic digits of the guide: Dalaly keeps its name and icon, the interface
  is Arabic, and Latin digits are an owner rule. If this office is
  البُركاتي and wants its own lockup in the nav header, login cover and
  splash, that is a small follow-up.
- Print output (reports, vouchers, contracts) still uses its own document
  styling; the stationery board (letterhead rule, Tigris foot band) could be
  applied there separately.
- `src/assets/login-residence.webp` and `src/assets/images/splash-background.webp`
  are no longer referenced (left in place).
- `.impeccable/design.json` predates this `DESIGN.md` and can be regenerated.
