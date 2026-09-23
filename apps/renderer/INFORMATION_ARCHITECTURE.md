# Information Architecture — Dalaly Desktop

How information is _organized and revealed_ per screen. Visual/layout only — no
business logic, API, stores, events, validation, permissions, routes, search,
filters, or pagination change. Pairs with `DESIGN.md` (the visual system).

## The three-layer principle

Every screen separates information into three layers; never show all at once:

1. **Primary** — what the user needs to decide/act fast. Always visible.
2. **Operational** — what they use while working. One click / same screen.
3. **Detailed / rare** — hidden in tabs, a side pane, or collapsible sections.

## Layout type per page

| Page              | Layout                             | Primary layer                                                       | Secondary/hidden                                                                   |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Properties list   | **List Workspace + Master–Detail** | command bar (title, count, actions) · filter bar · data grid        | Details pane on row select (row data only); full details via existing open event   |
| Property details  | **Details Workspace**              | header (code, type, status, location, price, actions) · summary row | tabs (overview / property / owner / images / followups / audit) · owner side panel |
| Property add/edit | **Form Workspace**                 | sticky action bar (save/cancel) · section nav                       | collapsible sections; side summary; validation summary                             |
| Dashboard         | **Task-oriented**                  | alerts → today's followups → expiring → latest                      | summary strip · top areas                                                          |
| Followups         | **Master–Detail (Inbox)**          | list + detail; overdue emphasized                                   | filters by date/status/property                                                    |
| Users             | **List Workspace**                 | table + command bar                                                 | details pane                                                                       |
| Roles/permissions | **Permission matrix**              | permissions × roles by module                                       | search, expand/collapse per module                                                 |
| Locations         | **Hierarchical (tree + detail)**   | governorate → district → neighborhood                               | edit selected, show parent                                                         |
| Audit log         | **Log viewer**                     | filters + central table                                             | details drawer; JSON in expandable block                                           |
| Backup            | **Workflow sections**              | status · actions · history                                          | —                                                                                  |

## Per-page hierarchy (fixed order)

1. Page title → 2. Primary action → 3. Context/count → 4. Search/filters →
2. Main content → 6. Secondary info → 7. Status/pagination.

## Action placement

Actions sit next to the data they affect: page-wide actions in the command bar;
row actions in a per-row overflow/icon group; record actions in the details
header/pane; form save in a sticky bar; status change next to status.

## Reduce navigation

Prefer a **Details pane / drawer / split view** over opening a new page or dialog
for quick reading. Preserve the current open event and route. Back navigation keeps
filters + pagination. No inline editing where it would change validation/save flow.

## Shared layout components (create only when really used)

| Component                                                                         | Status                                    | Used by                               |
| --------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------- |
| `MasterDetailLayout`                                                              | **built**                                 | properties list                       |
| `PropertySummary` (details pane body)                                             | **built**                                 | properties list (later: details page) |
| `CommandBar`                                                                      | exists as `AppTopbar` + `#header-actions` | all                                   |
| `FilterBar`                                                                       | exists as `PropertyFilters`               | properties                            |
| `DataWorkspace` / `ResultsStatusBar`                                              | inline for now                            | properties                            |
| `DetailsHeader`, `SectionNav`, `StickyActionBar`, `ActivityPanel`, `FilterDrawer` | pending                                   | details / form pages                  |

## Responsive desktop

- **1366×768**: hide secondary columns, pane collapses to an overlay drawer, horizontal grid scroll if needed.
- **1440×900**: full layout, medium pane.
- **1920×1080**: more detail; extra space feeds panes, not larger components. Never a mobile layout.

## Logic-preservation checklist (run per page, before/after)

API calls · payloads · route params · events · emits · permission checks ·
validation · search · filters · pagination · selected-item state · loading ·
error handling · save/delete behavior — all identical.
