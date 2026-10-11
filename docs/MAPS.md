# Dalaly locations: Leaflet + OpenStreetMap

The renderer uses the stable Leaflet 1.9.4 library directly with Vue 3 Composition API. There is no Google JavaScript SDK, API loader, Google dependency, API key, Map ID or map environment configuration. Leaflet, its CSS and marker images are bundled locally by Vite and work with Electron's `file://` renderer. No Vue wrapper is necessary.

## Behavior

- Sale and rental create/edit forms share `PropertyLocationEditor` and `PropertyLocationMap.vue`. Opening the map initializes it once; click or drag the marker to update numeric coordinates and an OpenStreetMap link. Manual fields and pasted OpenStreetMap/legacy Google links also update the marker. Reset removes coordinates, link and marker. Baghdad is an unsaved default center.
- Details use the same map in readonly mode: map panning, zoom and marker popups remain available, while coordinates cannot change. Popups show the listing name/code and address using safe DOM text. The map is initialized on first tab visit and resized when tabs/dialogs become visible. Empty locations show an Arabic empty state and an edit action where permitted.
- Controls and messages are Arabic, popups follow RTL, coordinate fields and geographic controls use LTR. Dark theme adjusts tiles, controls and popups without hiding attribution. Theme changes preserve the same map instance and selected point.
- Loading, unavailable tiles, retry and offline states keep manual entry and saving available. Maps are online maps; saved coordinates remain usable without tile access.
- External coordinate links now use OpenStreetMap. Existing legacy links remain accepted and are not rewritten in the database. Address search opens the external OpenStreetMap website; there is no background geocoding or Places request.

## Data compatibility

No new migration or backfill is required for this replacement. Existing separate `properties` and `rentals` tables retain `latitude numeric(10,8)`, `longitude numeric(11,8)` and optional `location_link text`, introduced by `0018_listing_locations.sql`. PostgreSQL range/pair constraints and numeric response types are unchanged.

Create/update accept both coordinates together within latitude ±90 and longitude ±180. Blank strings normalize to null; explicit null pairs clear a point. Omitted fields in older clients preserve saved values. Link validation now accepts HTTPS OpenStreetMap map/search/directions URLs and previously supported Google map URLs; credentials, custom ports, executable schemes and spoofed domains are rejected.

`server/src/shared/utils/map-location.ts` shares coordinate validation, parsing and canonical URL creation with the renderer. OpenStreetMap `mlat`/`mlon` pins take priority over `#map=zoom/lat/lng` centers. Legacy Google links support coordinate queries, `@lat,lng`, place/search coordinate paths and `!3dLAT!4dLNG` pins. Parsing uses no Google API. The authenticated `/api/locations/resolve-map-link` route remains compatible: embedded coordinates require no network; old short Google URLs may follow validated HTTPS redirects only, with the existing timeout/concurrency/hop limits. Coordinate-free/unresolved links require manual selection and never invent a location.

## Electron and tile policy

`dalalyConfig.openMapLink` exposes only the narrow `maps:open-external` IPC. Main verifies the sender window/frame and allowed mapping URL before `shell.openExternal`. Node APIs remain disabled in the renderer. Existing general external-navigation guards are preserved.

The tile URL is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Visible OpenStreetMap attribution stays on the map. Packaged Electron identifies tile requests as `Dalaly/<version> (Electron desktop; codel.dalaly.desktop)`; native clients do not fabricate a Referer. Browser tiles use `strict-origin-when-cross-origin` so the actual web origin is sent. Chromium's normal persistent HTTP cache honours server cache headers; no cache-busting, custom tile proxy, bulk download, prefetch or offline map download is added. Leaflet requests the visible viewport (`keepBuffer: 0`, `updateWhenIdle: true`, retina tile multiplication disabled).

The public tile service has limited capacity and no availability guarantee. For substantial distribution/traffic, use a suitable OSM-derived provider or self-hosted tiles and update its URL/attribution accordingly. The current default works without credentials. See the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [stable Leaflet release](https://leafletjs.com/download.html) and [Leaflet 1.9.4 API](https://leafletjs.com/reference-1.9.4.html).

## Build and verification

```powershell
pnpm lint
pnpm --filter @dalaly/server test:maps
$env:MAPS_UI_TEST='true'
pnpm --filter @dalaly/server test:maps:runtime
Remove-Item Env:MAPS_UI_TEST
pnpm build
pnpm --filter @dalaly/desktop exec electron-builder --win --dir --publish never --config.directories.output=release/leaflet-verification
$env:MAPS_ELECTRON_TEST='true'
pnpm --filter @dalaly/server test:maps:runtime
Remove-Item Env:MAPS_ELECTRON_TEST
```

Tests create and remove their own uniquely named PostgreSQL database and temporary profile, never migrate the working database. Browser tests use real Leaflet and pointer events; tile responses are local fixtures to avoid automated traffic to the community servers. Packaged tests launch the real Windows executable, verify local CSS/icon loading and the actual preload/main external-link bridge. Tile fixtures establish integration and error behavior, not live provider availability.

## Main changes

| Files | Change |
|---|---|
| `apps/renderer/src/components/shared/PropertyLocationMap.vue` | Reusable editable/readonly Leaflet map, icons, popup, themes, resize and cleanup |
| `PropertyLocationEditor.vue`, `PropertyLocationView.vue` | Shared forms/details and OpenStreetMap actions |
| `PropertyDetailsPanel.vue`, `RentalDetailsDialog.vue` | Listing name/address popup inputs |
| `apps/renderer/src/utils/mapLocation.ts`, `server/src/shared/utils/map-location.ts` | Shared coordinate and link handling, including legacy paste compatibility |
| `server/src/shared/validation/location.ts`, `modules/locations/*` | OpenStreetMap URL acceptance without database changes |
| `apps/desktop/src/main.js`, `external-links.js`, `preload.cjs`, renderer `env.d.ts` | Generic secure map bridge and native tile client identification |
| Renderer `package.json`, `pnpm-lock.yaml`, `.env.example`, local `.env.local` | Leaflet/types installed, Google types and variables removed |
| `server/scripts/location*.ts` | URL/API compatibility, real Leaflet browser flows and packaged Electron checks |

Removed `GoogleMapPicker.vue`, `google-maps.service.ts` and the obsolete Google configuration guide. Google-named utilities were replaced by generic location utilities; remaining Google URL handling is only backward-compatible link parsing/redirect/open support, not a Maps API integration.
