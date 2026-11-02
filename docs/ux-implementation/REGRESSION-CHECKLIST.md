# Regression checklist

Status on 2 November 2026 for branch `feat/ux-audit-implementation`.
**Pass** means exercised and observed; **Not tested** says why. "Electron"
means the real application (`apps/desktop/src/main.js`) through Playwright,
on the isolated database `dalaly_ux_impl`.

## Automated

| Check                                                                   | Result                                        |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| `pnpm lint` (ESLint, server tsc, renderer vue-tsc, Electron syntax)     | Pass                                          |
| `pnpm test` (fast suites)                                               | Pass, 125/125                                 |
| `pnpm build` and production asset check                                 | Pass (font chunk-size warning existed before) |
| `api-contract.test.ts` (responses vs renderer types)                    | Pass, 149/149                                 |
| `search-text`, `list-paging`, `crm-paging`, `list-queries`, `crm-tasks` | Pass, 44/44                                   |
| `search-text` exact-code test without the UX-01 fix                     | Fails, as intended                            |
| `agreements.test.ts` (contract lifecycle)                               | Pass, 11/11                                   |

## Electron, by area

| Check                                                                                                              | Result                                                        | Evidence                                         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------ |
| App launches, login, dashboard                                                                                     | Pass                                                          | `A2b-dashboard-1366`                             |
| Window sizes 1366×768, 1440×900, 1920×1080                                                                         | Pass; no horizontal overflow                                  | `A2-dashboard-*`, `F-sale-form-*`                |
| 125% zoom on the sale form, Save visible                                                                           | Pass                                                          | `A3-sale-new-125`                                |
| Light and dark themes                                                                                              | Pass                                                          | `F-dark-*`, `A2-dashboard-dark`                  |
| Ctrl+F, ArrowDown/Enter, Alt+← keeps the query                                                                     | Pass                                                          | regression run                                   |
| Ctrl+K / Escape, F1                                                                                                | Pass                                                          | regression run                                   |
| Ctrl+S / empty save focuses the first invalid field                                                                | Pass (`area_value`)                                           | `A3-sale-validation`                             |
| `H-0001` opens H-0001                                                                                              | Pass                                                          | `P1-search-H0001`                                |
| Undated new task stored open                                                                                       | Pass (database checked)                                       | `P1-task-saved-open-list`                        |
| Accounting scopes and explicit period action                                                                       | Pass                                                          | `P1-accounting*`                                 |
| Queue actions: instalment and commission receipts, customer drawer, open record, viewing                           | Pass (dialogs opened, then cancelled)                         | `A2-collect-*`, `A2-customer-options`            |
| Match → deal with prefill                                                                                          | Pass                                                          | `A2-match-deal`                                  |
| Figures open their lists                                                                                           | Pass (`/tasks?due=overdue`, 9 rows)                           | —                                                |
| One source failing (503 injected), retry                                                                           | Pass                                                          | `A2-queue-business-failed`                       |
| Collapsed sections keep values                                                                                     | Pass                                                          | —                                                |
| Server error inside a closed section opens it and focuses the field                                                | Pass (duplicate plot 409)                                     | `A3-sale-duplicate-revealed`                     |
| Save with optional sections closed                                                                                 | Pass (sale L-0005, client P-9005, request PR-9003)            | —                                                |
| Edit mode shows sections with data                                                                                 | Pass                                                          | `A3-sale-edit`                                   |
| Inline compact client from a request, «حفظ ومطابقة»                                                                | Pass (4 matches)                                              | `A3-client-compact`, `A3-purchase-saved-matches` |
| All 13 reports render with heading and exports                                                                     | Pass                                                          | `A4-report-*`                                    |
| Empty report recovery and «تغيير الفترة» focus                                                                     | Pass                                                          | `A4-report-income-statement`                     |
| Report overview on request (4 requests only then)                                                                  | Pass                                                          | `A4-overview-open`                               |
| Sidebar: 14 of 14 visible at 1366×768                                                                              | Pass                                                          | `A5-sidebar-1366`                                |
| Deal stage jump and table link (persisted view)                                                                    | Pass                                                          | `A5-deals-*`                                     |
| Client «مفتوح الآن مع الزبون»                                                                                      | Pass                                                          | `A5-client-2`, `A5-client-3`                     |
| Gallery folds and reopens; paste/upload still mounted                                                              | Pass (fold/reopen); upload not exercised                      | `A6-property-followups`                          |
| Import dialog: Escape, «إلغاء», close; outside click keeps it                                                      | Pass                                                          | `A6-import-dialog`                               |
| Email backup folded when off; warning and save visible                                                             | Pass                                                          | `A6-backups-closed`                              |
| Permission keys secondary and copyable                                                                             | Pass (rendering); copy action listed, clipboard not read back | `A6-roles`                                       |
| Label size and disabled hint contrast                                                                              | Pass (11.05px, 5.91:1)                                        | `A6-sale-form-labels`                            |
| Contract: deal prefill, autosave, reload, issue, read-only, PDF, Word, print, new revision, four types             | Pass                                                          | `A7-*`                                           |
| Date, time and number fields: Latin digits, typed Arabic-Indic digits, invalid entry, picker path, saved task time | Pass (stored 14:30 Baghdad as 11:30Z)                         | `D-*` (follow-up)                                |

## Not tested, and why

| Item                                                                   | Reason                                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Timed tasks with office staff, five-second comprehension               | No participants; no time claim is made                                                                                          |
| Printer output                                                         | The native print call was stubbed; the HTML is the one the PDF used (3 pages)                                                   |
| Native save dialogs                                                    | Stubbed to a scratch folder; the written files were checked (`%PDF`, zip)                                                       |
| Image upload and paste on the folded gallery                           | No file chooser automation; the component stays mounted (`v-show`)                                                              |
| Other roles' permission views                                          | No role fixtures were created; permission checks in code are unchanged and the queue builder's permission paths are unit-tested |
| Windows display scaling, 200% zoom, high-contrast mode, screen readers | Out of scope of this pass                                                                                                       |
| Packaged installer                                                     | Development Electron only; `pnpm build` passed                                                                                  |

## Data safety

- Writes went only to `dalaly_ux_impl` (a template copy of `dalaly_demo`).
  It holds the test task, listing L-0005, client P-9005, request PR-9003,
  contracts CT-0001…CT-0005 and their exports. It can be dropped.
- `dalaly_demo` and `dalaly` were not written by this work. The database
  test suites create and drop their own `dalaly_*` databases.
