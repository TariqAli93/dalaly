# Dalaly desktop presentation redesign

This document records the earlier presentation pass. The current appearance,
detail-page routes and splash implementation are documented
in [UI_ENHANCEMENTS.md](UI_ENHANCEMENTS.md), which supersedes the corresponding
palette and workflow descriptions below. Both are history now: the desktop
redesign of 2026-10-26 ([UI_AUDIT_AND_REDESIGN_PLAN.md](UI_AUDIT_AND_REDESIGN_PLAN.md))
replaced the shell and list pages, and that plan and the code are current.

The renderer uses a compact application bar, page-level commands, and bordered
surfaces with a 4px spacing scale. Screen composition follows the supplied
reference and [Fluent 2 layout guidance](https://fluent2.microsoft.design/layout).
The latest global appearance request replaces the reference's dark sidebar with
a matching app/sidebar canvas and applies a 60/30/10 neutral/teal color system.

## Shared design system

- Typography: bundled variable Cairo, then Segoe UI and Tahoma. The font is
  licensed under the included SIL Open Font License in `src/assets/fonts/OFL.txt`.
- Colors: light/dark palettes are defined in `src/plugins/theme.ts`, registered
  in `src/main.ts`, and consumed through semantic CSS variables in `src/styles.css`.
  The 60/30/10 proportions describe visual emphasis rather than exact pixel counts.
  In light mode the canvas/sidebar is `#F8FAFB`, workspace `#EDF1F3`, cards
  `#F6F8F9`, and primary accent `#116466`. In dark mode they are `#1D3034`,
  `#142428`, `#192C30`, and `#74C8C0` respectively. Status colors retain their
  meaning and are used sparingly.
- Controls use an 8px radius; cards and dialogs use 12px. Page content uses
  20–24px padding. Tables keep their existing pagination and all original columns.
- Sidebar/workspace use 16px corners and a subtle shadow. The workspace is inset
  inside `v-main` so Vuetify's responsive drawer/app-bar offsets remain intact.
  Hover transitions take 180ms and respect reduced-motion preferences.
- Arabic RTL, tabular numbers, isolated phone/identifier text, visible keyboard
  focus, reduced-motion preferences, and teleported overlays share the same style.
- Shared presentation components: PageHeader, ListingImage, StatusChip, and
  EmptyState. (MetricCard, OfferTrendChart, DistributionChart and
  RankedBarList went with the old dashboard; see
  [OPERATIONS_DASHBOARD.md](OPERATIONS_DASHBOARD.md).)

## Screen composition

- Login: split form/photo layout, local photograph, version from setup status,
  password visibility, existing credential submission, and inline error feedback.
- Dashboard: existing metrics, sales/rental chart tabs, financial totals, recent
  offers, recent activity, follow-ups, review queue, and location rankings.
- Sales/rental workspaces: compact filters, original quick picks, sorting and
  pagination, thumbnail fallbacks, and the existing master/detail selection.
- Details: gallery beside specifications, a clear price/location header, and
  existing image management, follow-ups, audit history, and export actions.
  Thumbnail navigation selects a local preview; the existing star button still
  sets the primary image.
- People: avatar/name cells and a read-only profile using fields already loaded
  for the directory. Existing create/edit/archive/restore actions remain.
- Settings: appearance previews, office information, security, backups, and
  system/connection tabs retain the original controls and permissions.
- Other routed screens inherit the same shell, typography, controls and surfaces.

The layout polish aligns card headings and content to a shared 20px inset,
uses 16px filter padding and 36px page commands, fixes sidebar icon
spacing, and keeps chart tabs beside their heading when space permits. Selected
table rows use a teal tint with an accent edge; appearance previews consume the
actual theme colors. The reduced-motion drawer keeps Vuetify's open/closed
transform so temporary navigation remains hidden when closed.
The polish was checked in light/dark mode, with selected rows, detail dialogs,
and appearance previews. At 375px, headers and previews wrap without page
overflow; the temporary drawer opens and closes with reduced motion enabled.
Sidebar links form a flat list without group headings or expandable sections,
retaining their existing order, permission filters, and rail tooltips.

No backend, service, schema, route, permission, domain type, or state-composable
files changed. Sales and rentals remain separate. No migration or new runtime
dependency is required.

The current application has no separate reports route, general notification API,
remember-me preference, or linked-client property endpoint. Analytics
remain in the dashboard, and unsupported controls or statistics are not invented.
User-provided names and backend-generated document text remain intact.

## Login photograph

Saved asset: `apps/renderer/src/assets/login-residence.png`.
Generated with the built-in imagegen tool, for the login brand panel only.
It is never substituted for an actual listing photograph.

Prompt: Create one photorealistic architectural real estate photograph, portrait
format 1024x1536, for a premium Iraqi real estate desktop application login side
panel. Contemporary two storey residence in Baghdad with pale warm limestone,
dark charcoal architectural frames, expansive glass windows softly glowing amber
at blue hour, restrained palms and landscaped forecourt, refined clean modern
Iraqi urban residential architecture. Framed from the street with the whole house
visible in the middle upper area, dark dusk sky in top quarter, calm foreground.
Editorial high end architectural photography, realistic textures, subtle warm
lighting, deep teal blue sky. No people, no logos, no text, no watermarks, no UI or
borders. Output a single photograph.

## Verification

- Root lint and production build, including production asset verification.
- Browser verification of login, dashboard sales/rental analytics, availability
  filtering, pagination, property detail/gallery navigation, and light/dark selection.
- Global shell checked at 1366×768, 1440×900, 1920×1080, and 375×812. Matching
  sidebar/canvas colors, darker workspace, primary active links, responsive
  drawer, and no horizontal page overflow were verified from rendered styles.
  Sales pagination also advanced from 1–10 to 11–12 of 12 existing offers.
- Existing listing files that cannot be loaded show a themed image fallback.
- Windows installer packaging and native Electron window execution are separate
  from the renderer/browser checks.
