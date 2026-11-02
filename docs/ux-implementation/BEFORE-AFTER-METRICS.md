# Before and after metrics

All figures were **measured** in the real Electron application with the same
scripts before and after, on the same isolated copy of the demo data
(`dalaly_ux_impl`), at an outer window of 1366×768 (client area 1350×729)
unless stated. Nothing here is a projection. None of these numbers is a task
time: no timed study with office staff was run, so no time saving is claimed.

Counting follows the audit: one labelled `.v-field` is one control, switches
and amenity chips excluded; "exposed" means rendered at a non-zero size,
including below the fold.

## Forms (UX-06, 07, 08, 09)

| Form                  | Exposed before | Exposed after | Change | Total controls | Required | Blank required |
| --------------------- | -------------: | ------------: | -----: | -------------: | -------: | -------------: |
| Sale offer, new       |             33 |            13 |   −61% |        33 → 33 |    9 → 9 |          4 → 4 |
| Rental offer, new     |             23 |            12 |   −48% |        23 → 23 |    8 → 8 |          4 → 4 |
| Purchase request, new |             16 |             7 |   −56% |        16 → 16 |    2 → 2 |          1 → 1 |
| Rental request, new   |             17 |             8 |   −53% |        17 → 17 |    3 → 3 |          1 → 1 |
| Client, new           |             17 |             3 |   −82% |        17 → 17 |    1 → 1 |          1 → 1 |

| Form              |         Page height before |                 after |
| ----------------- | -------------------------: | --------------------: |
| Sale offer, new   |                     1630px |                 943px |
| Rental offer, new |                     1368px |                 888px |
| Request dialogs   | scrolled inside the dialog | fit without scrolling |

- Every field is still in the form: the bound model fields are identical
  (sale 38, rental 27, request 21, client 18 bindings before and after).
- Editing an existing sale listing (H-0001) exposes 30 of 33 controls: the
  sections that hold data open by themselves; only the empty map stays closed.
- Manually entered values for a new sale are unchanged (4 blank required);
  only what must be scanned changed.
- Sale form at 125% zoom: 13 exposed, Save visible in the viewport.

## Dashboard (UX-02)

| Measure                                     | Before                                                                                   | After                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Regions below the quick actions             | figures strip, priority strip, 10 panels                                                 | figures strip + 4 regions (queue, matching with risks, work summary, listing status) |
| Containers measured by the script           | 14                                                                                       | 7                                                                                    |
| Overdue tasks in the first viewport         | listed from y≈640 in the tasks panel                                                     | in the figures strip and the queue                                                   |
| Overdue instalments in the first viewport   | lease panel from y≈597                                                                   | in the figures strip and the queue                                                   |
| Customers needing contact                   | panel from y=957 (below the 729px viewport)                                              | queue «تواصل» lines in the first viewport                                            |
| Collectable commissions                     | side panel                                                                               | figures strip and queue «للتحصيل» lines                                              |
| Queue lines visible at 1366×768             | —                                                                                        | 8 (overdue ×3, today ×1, collect ×2, contact ×2)                                     |
| Dashboard → sale form                       | 1 click                                                                                  | 1 click                                                                              |
| Match → contextual deal (prefilled)         | 1 click                                                                                  | 1 click                                                                              |
| Commission → prefilled receipt              | 1 click                                                                                  | 1 click (from the queue line)                                                        |
| Overdue instalment → prefilled rent receipt | at least 2 clicks (the row opened the lease; collecting is on the lease or overdue list) | 1 click (from the queue line)                                                        |
| Document height at 1366×768                 | 1523px                                                                                   | 1497px                                                                               |
| Horizontal overflow (1366 / 1440 / 1920)    | none                                                                                     | none                                                                                 |

## Accounting and reports (UX-03, 14, 15)

| Measure                                                       | Before                   | After                                          |
| ------------------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| Summary period stated with dates                              | label of the toggle only | «ملخّص هذا الشهر من 1/11/2026 إلى 2/11/2026»   |
| List date scope stated                                        | inside «فلاتر إضافية»    | one line above the list, with explicit actions |
| Unrelated KPI cards above each of the 13 reports              | 5                        | 0 (on request)                                 |
| API requests for those cards per report load or period change | 4                        | 0 while closed                                 |
| Empty period recovery                                         | message only             | «تغيير الفترة» + 3 presets beside it           |

## Navigation and workspaces (UX-10, 11, 16, 17)

| Measure                                        | Before                                      | After                       |
| ---------------------------------------------- | ------------------------------------------- | --------------------------- |
| Primary destinations fully visible, 1366×768   | 12 of 14                                    | 14 of 14                    |
| Primary destinations visible, 1366×768 at 125% | 9 of 14                                     | 11 of 14                    |
| Nav row height                                 | 36px (40px when Vuetify's rule loaded last) | 32px, fixed                 |
| Deal board content width (pane 1092px)         | 2280px (audit)                              | 1636px                      |
| Later deal stages reachable                    | horizontal scrolling                        | one click on the stage chip |
| Property follow-ups tab width, 1366×768        | 687px                                       | 882px                       |
| Client with a deal but no activity: first tab  | «لا يوجد نشاط مسجل بعد» only                | open deal listed and linked |

## Readability and dismissal (UX-19, UX-21)

| Measure                                        | Before          | After                                              |
| ---------------------------------------------- | --------------- | -------------------------------------------------- |
| Floating label size (13px field font)          | 9.75px          | 11.05px                                            |
| Hint under a disabled field, contrast on white | ≈2.24:1 (audit) | 5.91:1                                             |
| Excel import: ways to close                    | unnamed icon    | named icon, «إلغاء», Escape (not while committing) |

## Correctness (UX-01, UX-04)

| Measure                                             | Before               | After        |
| --------------------------------------------------- | -------------------- | ------------ |
| `H-0001` search, first row                          | F-0001 (phone match) | H-0001       |
| Rows returned for `H-0001`                          | 2                    | 2 (same set) |
| Undated new task from the tasks page, stored status | done                 | open         |
