# Screenshots

Real Electron captures (development build, isolated profile, database
`dalaly_ux_impl` copied from the synthetic demo data). Outer window 1366×768
unless the name says otherwise. The PNG files are not committed, like the
audit's (`.gitignore`); this index is.

Prefixes: **B** before Phases 2–3 (after the Phase 1 copy fixes), **P1**
Phase 1, **A2–A7** after each phase, **F** final regression.

| Area                             | Before                      | After                                                                                                                                                                 |
| -------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard, first screen          | `B-dashboard-1366`          | `A2b-dashboard-1366`, `F-dashboard-1366`                                                                                                                              |
| Dashboard, lower part            | `B-dashboard-1366-lower`    | `A2-dashboard-1366-lower`                                                                                                                                             |
| Dashboard, wide                  | `B-dashboard-1920`          | `A2-dashboard-1440`, `A2-dashboard-1920`, `F-dashboard-1920`                                                                                                          |
| Dashboard, dark                  | —                           | `A2-dashboard-dark`, `F-dark-dashboard`                                                                                                                               |
| Queue actions                    | —                           | `A2-collect-installment`, `A2-collect-commission`, `A2-customer-options`, `A2-queue-today`, `A2-match-deal`                                                           |
| Queue with a failed source       | —                           | `A2-queue-business-failed`                                                                                                                                            |
| Sale form                        | `B-form-sale`               | `A3-sale-new`, `A3-sale-validation`, `A3-sale-new-125`, `F-sale-form-1440`, `F-sale-form-1920`, `F-dark-sale-form`                                                    |
| Server error in a closed section | —                           | `A3-sale-duplicate-revealed`                                                                                                                                          |
| Sale edit                        | —                           | `A3-sale-edit`                                                                                                                                                        |
| Rental form                      | `B-form-rental`             | `A3-rental-new`                                                                                                                                                       |
| Purchase request                 | `B-form-purchase-request`   | `A3-purchase-new`, `A3-purchase-saved-matches`                                                                                                                        |
| Rental request                   | —                           | `A3-rental-request-new`                                                                                                                                               |
| Client, quick add                | `B-form-client`             | `A3-client-compact`                                                                                                                                                   |
| Code search                      | —                           | `P1-search-H0001`                                                                                                                                                     |
| New task                         | —                           | `P1-task-new`, `P1-task-log`, `P1-task-saved-open-list`, `F-dark-tasks`                                                                                               |
| Accounting                       | —                           | `P1-accounting`, `P1-accounting-period-applied`, `P1-accounting-commissions`, `F-dark-accounting`                                                                     |
| Reports                          | —                           | `A4-report-deals`, `A4-report-receivables`, `A4-report-income-statement`, `A4-income-last-month`, `A4-overview-open`, `F-dark-reports`                                |
| Sidebar                          | `B-sidebar-accounting-1366` | `A5-sidebar-1366`, `A5-sidebar-accounting-1366`                                                                                                                       |
| Deals board                      | —                           | `A5-deals-board`, `A5-deals-jump-last`                                                                                                                                |
| Client record                    | —                           | `A5-client-2`, `A5-client-3`                                                                                                                                          |
| Listing gallery                  | —                           | `A6-property-followups`                                                                                                                                               |
| Labels and hints                 | —                           | `A6-sale-form-labels`                                                                                                                                                 |
| Import, backups, roles           | —                           | `A6-import-dialog`, `A6-backups-closed`, `A6-roles`                                                                                                                   |
| Contracts                        | —                           | `A7-prepare-dialog`, `A7-step-0`…`A7-step-2`, `A7-review-before-issue`, `A7-issued`, `A7-amend-draft`, `A7-content-scope`, `A7-studio-scope`, `A7-type-1`…`A7-type-4` |

For the audit's own "before" captures of screens not listed here, see
[`docs/ux-audit/screenshots`](../../ux-audit/screenshots/README.md).
