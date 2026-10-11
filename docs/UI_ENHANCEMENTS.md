# Dalaly appearance, detail pages, contract form, and splash

Implemented in the existing Electron/Vue 3/Vuetify 3 application. Arabic RTL,
existing permissions, service methods, request payloads, contract calculations,
and issued snapshots are preserved. No database migration, API change, or new
runtime dependency is required.

## Appearance

`Settings → المظهر` now includes mode selection, independent light/dark palettes,
six color pickers, Dalaly/blue/olive presets, font and text-size selectors,
fluid/centered layout controls, a live preview, and resets. Changes apply immediately.
Validated preferences persist under `dalaly.appearance.v1` in localStorage;
the existing `dalaly.theme` preference still stores the active mode.

The latest brief's dark sidebar and white surfaces supersede the earlier request
for a matching sidebar/canvas. The 60/30/10 system controls visual emphasis:
large neutral canvas areas, distinct surface areas, then restrained brand accents.
It does not measure exact screen pixels. Status colors retain their meaning.

| Token      | Light default | Use                                           |
| ---------- | ------------- | --------------------------------------------- |
| background | `#F3F5F6`     | Main canvas, roughly 60%                      |
| surface    | `#FFFFFF`     | Cards and forms, roughly 30%                  |
| secondary  | `#E8EEF0`     | Supporting surfaces and secondary actions     |
| primary    | `#116466`     | Active links and primary actions, roughly 10% |
| accent     | `#C27C3A`     | Sparse highlights                             |
| sidebar    | `#193638`     | Compact navigation area                       |

Theme definitions live in `apps/renderer/src/plugins/theme.ts`. Custom colors
derive contrasting foregrounds, readable muted text, and a safe text-only primary
token. Both palettes update Vuetify theme colors and variables. For example:

```ts
import { createTheme } from "./plugins/theme";

const lightTheme = createTheme(
  {
    primary: "#116466",
    secondary: "#E8EEF0",
    accent: "#C27C3A",
    background: "#F3F5F6",
    surface: "#FFFFFF",
    sidebar: "#193638",
  },
  false,
);
// main.ts registers configuredThemes() so persisted colors are applied at startup.
```

`useAppearance.ts` supplies shared reactive preferences. `AppLayout.vue` applies
the same container behavior to every main page:

```vue
<v-container
  :fluid="appearance.fluid"
  class="dal-content"
  :style="{ maxWidth: appearance.fluid ? 'none' : `${appearance.maxWidth}px` }"
>
  <slot />
</v-container>
```

Cairo is the default. Cairo, Tajawal, Almarai, and IBM Plex Sans Arabic are local
font assets; Segoe UI and Tahoma use installed system fonts. Small/medium/large/
extra-large scale text by 0.9/1/1.125/1.25 through the root rem size and scoped
text styles. Navigation stays a flat, permission-filtered list without groups.
Cards use 12px corners, controls use 8px corners, and actions wrap on small screens.
Visible keyboard focus and reduced-motion behavior remain available.

Fonts and their SIL Open Font Licenses are in `src/assets/fonts`, sourced from
[Google Fonts Cairo](https://github.com/google/fonts/tree/main/ofl/cairo),
[Tajawal](https://github.com/google/fonts/tree/main/ofl/tajawal),
[Almarai](https://github.com/google/fonts/tree/main/ofl/almarai), and
[IBM Plex Sans Arabic](https://github.com/google/fonts/tree/main/ofl/ibmplexsansarabic).

## Detail pages and navigation

| Route                                | Permission         | Behavior                                                                                        |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| `/clients/:id` (alias `/people/:id`) | `people.read`      | Basic information, owned properties, contracts, and notes                                       |
| `/properties/:id`                    | `properties.read`  | Basic information, related properties, map, notes, contracts, images, follow-ups, and audit log |
| `/contracts/create`                  | `contracts.manage` | Full-page contract creation                                                                     |
| `/contracts/:id/edit`                | `contracts.manage` | Full-page editing of draft contracts                                                            |

Client names open the client page. Property names, table rows, favorites,
dashboard references, and sales matches open the property page. Archived
dashboard references are also resolved. Existing selection events are retained.
Existing contract snapshots open through `/contracts?view=<id>` and retain exports.

Client/property editors, archive/restore/delete, image upload/primary selection,
follow-ups, audit log, and export actions retain their original services and
permissions. Read-only details are full pages; compact editing and confirmation
dialogs remain where appropriate. `PersonEditor`, `RecordNotes`, `LinkedContracts`,
and `usePropertyActions` reuse the existing implementation across the new pages.

Only `owner_person_id` establishes client/property ownership. Contracts use the
existing `person_id` and `property_id` server filters, including asset snapshots.
The related-contract table uses stored party/asset snapshots and existing payment
helpers, with Arabic contract/status labels.

## Full-page contract form

The existing `ContractWizard` now renders in a page rather than an outer modal.
Five presentation stages are information, assets, parties/documents, payments,
and review. Rental and sale remain the only renderer choices; legacy purchase
support stays in the backend.

Existing `contract-form.ts`, selectors, document uploads, inline person creation,
office information, review/preview, validation endpoints, and payload construction
are reused. Sales total `properties.total_price`; rentals total `rentals.rent_price`.
Remaining amount continues to use the existing helper. Asset and document gates,
bounded paid amounts, backend validation, and draft-only editing are retained.
Save and Next lock before asynchronous work to prevent repeat submissions.
Initial loading has a retry state; saved contracts navigate to their existing snapshot.

## Supported-data limits

- The current property model has no coordinates, floor count, or property-to-property
  relationship. The map tab shows the actual address, a missing-coordinate state,
  and an address-search action in Google Maps. It does not invent a marker or location.
- Related-property tabs show an appropriate empty state when that relation is unavailable.
- Notes are existing record fields, not an append-only note history. The timeline shows
  current notes and the record's actual update time. Editing uses the existing record
  editor; no unsupported note API or per-note delete operation was introduced.
- User-entered names and existing stored document content remain intact.

## Offline Vue splash

`apps/renderer/splash.html` and `src/splash.ts` are a separate Vite entry with real
Vue/Vuetify text, sheets, icons, an image, progress, and error controls. The skyline
is the only bitmap. The main router/auth stack is not loaded by the splash.

Electron creates a centered 465×300 frameless, transparent, non-resizable window.
The main window stays hidden until API/database checks and `ready-to-show` complete.
The splash then closes immediately; no minimum duration, hold, or fade delays remain.
Real startup messages/progress, slow-start feedback, retry, logs, quit, and version
use the existing limited preload bridge. A renderer readiness timeout reports failure
rather than opening an unready window. Failed retries destroy the prior hidden main window.

The background, Cairo, and MDI assets are bundled locally. Vite emits both HTML
entries and a manifest; `scripts/assert-production-assets.mjs` checks all manifest
files plus the skyline and Cairo. Electron packaging copies the renderer build.
The development toolbar attaches only to the main entry so it does not cover the splash.
Intentional splash closure during a pending development load is ignored; genuine
load failures still report an error.

Saved skyline: `apps/renderer/src/assets/images/splash-background.png`.
Generated using the built-in `image_gen.imagegen` tool in edit mode, using the
supplied splash screenshot as the reference. Opaque output, 1536×1024.
Exact final prompt:

> Use case: precise-object-edit. Asset type: locally bundled background for a 465 by 300 Electron startup window. Edit target: the supplied Dalaly splash screenshot. Recreate ONLY its soft gray and white architectural city skyline background as a clean high-resolution landscape bitmap, approximately 1536x1024. Preserve the reference's skyline composition: varied modern towers, one very tall slim tower near the right-center, shorter buildings near the base, pale cloudy white sky and gentle atmospheric haze. Remove and seamlessly reconstruct everything covered by the Arabic branding, all feature icons, all rounded white tiles, labels, and the entire dark bottom information panel. The result must contain only the pale monochrome skyline and cloudy sky, with a softly faded lower edge into near-white mist. Maintain low contrast so real UI text can be overlaid. No people, no text, no logos, no icons, no buttons, no panels, no borders, no watermark. Opaque background, not transparent.

## Validation

- `pnpm lint`: server TypeScript and renderer Vue TypeScript passed.
- `pnpm build`: server/renderer builds and offline production-asset assertions passed.
- `node --check apps/desktop/src/main.js` and `git diff --check` passed.
- Windows unpacked package: `pnpm --filter @dalaly/desktop exec electron-builder --win --dir --publish never`.
- Browser checks used the existing local API and actual stored records: appearance
  presets, font/text-size persistence after reload, dark/light mode, fluid/centered
  width, client/property navigation, linked contract snapshots, gallery, missing
  coordinates, and contract asset/document gates. No test contract was submitted.
- Extra-large typography was checked at 375px and 768px; the default desktop theme
  was checked at 1440px. Controls wrap and document width stays within the viewport.
- Windows development and unpacked-package launches reached the main window and
  logged `mainReady: true, splashClosed: true`. The final packaged manifest contains
  100 verified local renderer assets. Only agent-created test processes were stopped.
- Native launches used the already-running, healthy local API on port 34567. This
  does not verify standalone bundled-server startup, installer behavior, Windows DPI,
  or interactive native failure/retry screens. Native lifecycle verification used
  process logs; visual composition was checked in the browser at 465×300.
