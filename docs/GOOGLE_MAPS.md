# Google Maps locations

Sales listings and rental listings retain their separate tables, APIs, permissions and forms. Both now store nullable `latitude numeric(10,8)`, `longitude numeric(11,8)` and `location_link text`. Coordinates use Drizzle's numeric `mode: "number"`, so API responses contain numbers rather than decimal strings. The migration preserves existing records with null location fields and adds range/pair constraints in PostgreSQL.

## Configure Google Cloud

1. Enable billing and the **Maps JavaScript API** in your Google Cloud project.
2. Create a JavaScript **Map ID** in Google Maps Platform → Map Management. Use your own Map ID, not `DEMO_MAP_ID`.
3. Create a dedicated browser API key, restricted to **Maps JavaScript API**. Apply website restrictions matching the renderer's real HTTP(S) origin where supported; keep development and release keys separate.
4. Copy `apps/renderer/.env.example` to `apps/renderer/.env.local` and set:

   ```dotenv
   VITE_GOOGLE_MAPS_API_KEY=your_restricted_browser_key
   VITE_GOOGLE_MAPS_MAP_ID=your_javascript_map_id
   ```

5. Restart Vite, or run `pnpm build` and rebuild the Electron package. Vite reads these values from the renderer directory at build time; editing the root backend `.env` does not configure the renderer.
6. Set billing alerts and appropriate quotas, monitor usage, and test your restrictions with the actual distributed build before releasing it.

These are **public client values**, visible in the renderer bundle and network requests. Electron packaging or ASAR does not make a browser key secret. Never put service-account credentials or a privileged/unrestricted server key in these variables.

### Packaged Electron origin

Development loads `http://127.0.0.1:5173`; the current packaged application uses `BrowserWindow.loadFile`, hence a `file://` origin. Google documents that local resources may omit the `Referer` header and website restrictions may fail. A key working on localhost therefore does not establish that the packaged version is usable or securely restricted. Do not solve an authorization failure by distributing an unrestricted key or spoofing a referrer.

For a release requiring robust website restrictions, serve the map surface from an authorized HTTPS origin you control, with a narrowly defined communication bridge, or adopt a reviewed hosted renderer architecture. A local HTTP origin is not proof of application identity: other programs can reuse it. This integration preserves Dalaly's current renderer origin; choosing/deploying a hosted map surface remains an infrastructure decision.

If server-side geocoding or Places web services are added later, run them behind an authenticated, rate-limited service you control, keep its API key on that server, and use suitable API/IP restrictions. A privileged key inside Dalaly's locally distributed Fastify server would still be extractable. This feature needs no geocoding credentials: short links use only validated redirects.

Official references: [loading the API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview), [key security and webview restrictions](https://developers.google.com/maps/api-security-best-practices), [CSP guidance](https://developers.google.com/maps/documentation/javascript/content-security-policy). If a CSP is introduced or tightened, allow the documented Google script, image, style, font, worker and connection sources; retain the local Dalaly API origin. Dalaly currently has no restrictive renderer CSP.

## Database rollout and API behavior

Run `pnpm db:migrate` on the intended installation after your normal backup procedure, or let Dalaly's existing startup migration runner apply `0018_listing_locations`. It also runs through the existing first-run setup and is included in Electron's migration resources. No records are backfilled with Baghdad coordinates.

Existing `/api/properties` and `/api/rentals` create/update/details/list operations include the location fields. Range validation rejects latitude outside `[-90,90]` and longitude outside `[-180,180]`, nonnumeric values and partially supplied coordinate pairs. Empty strings normalize to null. Both coordinates must be present or both empty. Omitting both fields in an old client's update preserves the saved coordinates; omitting `location_link` preserves that field. To remove a location, send all three fields as null.

`POST /api/locations/resolve-map-link`, authenticated through the existing global hook, accepts `{ "url": "https://maps.app.goo.gl/..." }` and returns `{ "latitude": 33.3152, "longitude": 44.3661 }`. Embedded coordinates are parsed without network requests. Only short Google URLs are resolved, with an HTTPS/exact-host/path allowlist checked on every redirect, a six-second deadline, at most five hops, and no returned remote HTML. Unsupported/coordinate-free links return Arabic instructions with HTTP 422; unsafe URLs return HTTP 400. Coordinate-free place names are not automatically geocoded. Supported hosts are `google.com/maps`, `www.google.com/maps`, `maps.google.com`, `maps.app.goo.gl` and `goo.gl/maps`; regional Google domains can be normalized manually to google.com.

The parser supports `q`, `query`, `ll`, `center`, numeric `destination`, `@lat,lng`, coordinate place/search paths and `!3dLAT!4dLNG` place data. A place pin takes precedence over viewport coordinates. An `@`-only link denotes its map center; verify that center is the intended property position.

## UI behavior

Both create/edit forms use `PropertyLocationEditor`. Manual entry moves the marker once both values are valid; map clicks and marker dragging update coordinates and a canonical Google Maps URL. The map loads only when explicitly opened. Baghdad is the unsaved default center. Invalid/partial coordinates block form submission; network or Maps configuration failures do not block CRUD.

The existing property location tab now uses `PropertyLocationView`; the rental details dialog has a matching location tab. These maps are read-only and first load on tab entry, stay mounted across tab changes, and resize when shown. Existing address search remains available for sales properties without a pin. Empty states expose “إضافة موقع العقار” only with the domain's update permission.

`GoogleMapPicker` uses the official JavaScript API's maps/marker libraries and `AdvancedMarkerElement` with the configured Map ID. A shared promise avoids duplicate script initialization. Maps use Arabic labels, a quarterly API channel and the current light/dark theme. Listeners and resize/offline subscriptions are removed on unmount. Manual fields provide a keyboard alternative to map interaction; advanced marker dragging also supports keyboard controls.

Google links use the restricted preload IPC `maps:open-external`. Main checks the sender window/frame and URL, then uses `shell.openExternal`. The general new-window handler also rejects executable/file/data schemes, and external navigation does not replace the app window. The web demo uses a new browser tab. Copy failures leave a selectable URL field.

## Verification

```powershell
pnpm --filter @dalaly/server test:maps
pnpm --filter @dalaly/server test:maps:runtime
$env:MAPS_UI_TEST='true'
pnpm --filter @dalaly/server test:maps:runtime
Remove-Item Env:MAPS_UI_TEST
pnpm lint
pnpm build
git diff --check
```

The runtime test requires a PostgreSQL account allowed to create/drop test databases; it reads normal connection settings and creates a uniquely named `dalaly_maps_test_*` database. It migrates older rows, tests real Fastify/Drizzle CRUD and constraints, then removes that test database and its temporary files. It never applies migrations to your working database. The optional browser test needs Playwright Chromium and starts a temporary renderer on port 5189. It uses an intercepted Maps API test double to verify click/drag events and lifecycle without Google billing; it is not a live-service test.

To verify the real packaged Windows app with an isolated profile/database:

```powershell
pnpm --filter @dalaly/desktop exec electron-builder --win --dir --publish never --config.directories.output=release/maps-verification-checked
$env:MAPS_ELECTRON_TEST='true'
pnpm --filter @dalaly/server test:maps:runtime
Remove-Item Env:MAPS_ELECTRON_TEST
```

The test launches that executable with `--user-data-dir` pointing at its temporary profile, checks `app.isPackaged` and the `file://` renderer, exercises the actual preload/main IPC, and captures `shell.openExternal` without opening a browser. The packaged backend starts on a separate free port against the test database; the test routes renderer API requests to the isolated Fastify instance. Both preloads are explicitly CommonJS `.cjs` files so the bridge loads correctly inside the ESM desktop package.

Verified on 2026-10-11: nine unit tests; migration compatibility and real sale/rental API CRUD; browser click/drag, manual/pasted coordinates, invalid-input blocking, persistence, tab reuse, listener cleanup, readonly mode, external-link bridge, clipboard, offline messaging, default-center behavior, both themes and load/authentication failure handling; packaged Windows startup/preload/IPC and missing-key fallback; TypeScript checks and production build/assets. The build retains the existing large-chunk warning. Live Google tiles, real short-link redirects and production key authorization remain dependent on your Cloud configuration.

Before release, with a valid restricted key/Map ID, test real tiles, marker click/drag and keyboard interaction, pasted real short links, tab switches, clipboard, external browser opening, offline recovery and both themes in the packaged Windows app. Verify the actual requests' origin/referrer and Google authorization. Missing-key and offline states intentionally retain editable saved coordinates. No live Google Cloud configuration is created by this change.

## Files changed by this feature

| Files | Purpose |
|---|---|
| `server/drizzle/0018_listing_locations.sql`, `server/drizzle/meta/_journal.json` | Nullable columns, constraints, migration registration |
| `server/src/infrastructure/database/schema.ts` | Drizzle numeric location columns and constraints |
| `server/src/shared/utils/google-maps-url.ts` | Shared pure parsing, URL allowlist, numeric validation and URL generation |
| `server/src/shared/validation/location.ts` | Shared Zod location fields and pair validation |
| `server/src/modules/properties/properties.schema.ts`, `properties.repository.ts` | Sale validation and persistence |
| `server/src/modules/rentals/rentals.schema.ts`, `rentals.repository.ts` | Rental validation and persistence |
| `server/src/modules/locations/map-link.service.ts`, `locations.routes.ts` | Safe authenticated short-link resolution |
| `apps/renderer/src/components/shared/GoogleMapPicker.vue` | Interactive/read-only map and resource lifecycle |
| `apps/renderer/src/components/shared/PropertyLocationEditor.vue`, `PropertyLocationView.vue` | Reusable Arabic editor/details UI |
| `apps/renderer/src/components/properties/PropertyForm.vue`, `PropertyDetailsPanel.vue` | Sale form and existing map tab integration |
| `apps/renderer/src/components/rentals/RentalForm.vue`, `RentalDetailsDialog.vue` | Rental form and location tab integration |
| `apps/renderer/src/pages/PropertyFormPage.vue`, `RentalFormPage.vue` | Empty/edit form location values |
| `apps/renderer/src/types/property.types.ts`, `rental.types.ts` | Location record/form types |
| `apps/renderer/src/services/google-maps.service.ts`, `external-links.service.ts` | Shared lazy loader and secure link bridge |
| `apps/renderer/src/utils/googleMapsUrl.ts`, `apps/renderer/src/env.d.ts` | Shared parser export and public configuration/bridge typing |
| `apps/desktop/src/external-links.js`, `main.js`, `preload.cjs`, `splash-preload.cjs` | URL validation, main IPC, isolated profile support and reliable preload exposure; preloads renamed from `.js` |
| `apps/renderer/.env.example` | Public configuration template |
| `server/scripts/location.test.ts`, `location-smoke.ts`, `location-ui.ts`, `location-electron.ts` | Unit, migration/API, browser and packaged Electron tests |
| `server/package.json`, `apps/renderer/package.json`, `pnpm-lock.yaml` | Test commands and Google Maps development types |
| `docs/GOOGLE_MAPS.md` | Configuration, origin/security limits, rollout and verification |

Existing unrelated working-tree changes are preserved. This migration is additive; no existing API fields, routes or permissions are removed. New clients must deploy with the migration, while older clients can omit all new fields.
