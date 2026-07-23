# Fast Property Discovery — UX

Goal: reach the right offer(s) in **one search, or 2–3 filters, or one quick
pick — under ~10s**, using only the existing search/filter/sort logic. No new
API, DB, fields, indexes, external services, maps, or AI. Frontend/UX only.

## Current architecture (used, never changed)

- `filters` is a **module-level singleton** (`useProperties`) → search + filter
  context persists across navigation for free.
- `listProperties(filters)` returns the full result set; the data grid does
  **client-side pagination and sorting**. So sort options and quick picks are
  applied on already-loaded data — no query-contract change.
- `applyQuickFilter(key,value)` and `clearFilters()` already exist.
- Search fields (backend): code, type, legal type, pricing method, governorate,
  city, district, neighborhood (+ text variants), address, owner name/phone,
  notes, nazal, plot number. (We only surface which fields are searched.)

## The five slowdowns fixed

1. Search wasn't live → **debounced live search** (300ms), no apply button.
2. Primary filters hidden behind a button → **5 primary filters always visible**.
3. 14 flat filters → rare ones moved to a **"فلاتر إضافية" drawer**.
4. No quick picks / sort → **quick picks + sort dropdown**.
5. No applied-filter summary → **removable chips + contextual result count**.

## Layout (properties list)

1. Command bar: title · primary action · export/import (existing).
2. **Search bar**: wide, live, `Ctrl+F` focuses it, `Esc` clears+blurs.
3. **Primary filters** (≤6, live): governorate → district → neighborhood
   (dependent), property type, status.
4. **فلاتر إضافية** (drawer, not a page): legal type, area unit, pricing method,
   plot number/letter, area from/to, price from/to, district text.
5. **Quick picks** (segmented, existing values only): المتاحة (status=available),
   المضافة حديثًا (sort=newest), المفضلة (client favorite filter).
6. **Applied-filter chips**: one per active non-default filter, removable; مسح الكل when >1.
7. **Sort** (client-side on loaded data): الأحدث · آخر تحديث · السعر ↑ · السعر ↓ · المساحة.
8. **Result count with context**: `N نتيجة` / `N نتيجة مطابقة لـ "…"` / `N نتيجة ضمن بغداد — الدورة`.
9. Data grid → Details pane (Master–Detail) → full details (existing events).

## Scenarios & clicks (target)

| Scenario | Steps | Clicks |
|---|---|---|
| By owner name | type part of name | 1 (type) |
| By phone | type digits | 1 |
| By plot number | type `321 أ` | 1 |
| By location | governorate → district → neighborhood | ≤3 |
| By budget + location | location + price from/to (extra) | ≤3 + 2 fields |
| By type | pick property type | 1 |
| Available only | quick pick المتاحة | 1 |
| Typical compound | location + type + price | ≤3 |

No routine scenario needs more than 3 filters or a filter dialog.

## Result row (planned, commit 2)

Primary: plot `321 / أ` · location `بغداد › الدورة › حي دجلة` · type · price
(total + per m²/دونم). Operational: area · owner · phone · status. Secondary:
last updated. Status is the only color.

## Empty / loading

- **Loading**: skeleton inside the grid area.
- **Empty with active search/filters**: "لا توجد عقارات مطابقة للبحث والفلاتر
  الحالية" + actions مسح الفلاتر / تعديل البحث / إضافة عقار (by permission).
  Never the generic "no data" when a search is typed.

## Keyboard (safe, additive)

`Ctrl+F` focus search · `Esc` clear/blur search or close pane · `Enter` search ·
(planned) row ↑/↓ select, `Enter` opens, double-click opens — additive to existing
events. Filters/pagination/permissions/CRUD/search contract unchanged.
