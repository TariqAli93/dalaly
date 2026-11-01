# Dalaly UI/UX quick wins

Planning only. No changes implemented. See the [audit](DALALY-UI-UX-AUDIT.md) for evidence and the [roadmap](UI-UX-IMPROVEMENT-ROADMAP.md) for behavior-sensitive work.

| Order | Improvement | Finding / evidence | Why relatively low risk | Estimated effort / acceptance |
|---|---|---|---|---|
| 1 | Replace dashboard statements denying existing commissions/leases/contact history | UX-05; [footer](screenshots/E55-dashboard-lower.png), [drawer](screenshots/W02-match-drawer.png) | Copy-only after confirming current feature scope | ≤1 day; every statement agrees with current screens |
| 2 | Label accounting cards “ملخص الفترة” and list “كل الحركات” with its own dates | UX-03; [accounting](screenshots/E27-accounting-summary.png) | Can clarify existing scopes without changing queries | ≤1 day for labels; no implicit filter synchronization |
| 3 | Use consistent customer-commission collection language | Contextual [receipt](screenshots/E31-commission-collection.png) versus “تسديد عمولة” | Wording can distinguish collection from employee payout | ≤1 day; labels describe who pays whom; actions/payloads unchanged |
| 4 | Add period recovery beside an empty report | UX-15; [empty income](screenshots/R05-income-statement.png) | Reuses existing preset/filter actions | ≤1 day; no assertion that other periods contain data |
| 5 | State report period/as-of date immediately beside the report title | UX-03/14; [receivables](screenshots/R09-receivables.png) | Clearer presentation of existing scope | ≤1 day; all 13 report types use correct semantics |
| 6 | Explain the deal table as the compact view and keep last selection | UX-11; [board](screenshots/E18-deals.png), [table](screenshots/E54-deals-table.png) | Table and persistence already exist | ≤1 day for cue; no stage or drag behavior change |
| 7 | Put location prerequisite guidance outside the disabled field opacity | UX-19; [form](screenshots/E05-sale-form.png) | Readability adjustment without changing dependencies | 1–2 days; active/disabled behavior and layout unchanged |
| 8 | Disclose disabled scheduled-email configuration | UX-18; [backups](screenshots/E51-settings-backups.png) | Local presentation can be shortened | 1–2 days; preserve enabling warning, encryption explanation, values and validation |
| 9 | Make technical permission keys secondary/copyable | UX-20; [roles](screenshots/E45-roles.png) | Display-only in specialist catalog | ≤1 day; no permission, key or assignment change |
| 10 | Add a short template-versus-contract scope explanation to studio entry | UX-12; [studio](screenshots/E26-template-studio.png) | Clarifies existing separate edit scopes | ≤1 day; no lifecycle/template behavior change |
| 11 | Give the initial import dialog a named Close/Cancel action | UX-21; [import](screenshots/F12-import-dialog.png) | Accessible name and idle dismissal can be isolated from import processing | ≤1 day; no change to mapping, validation or committing safeguards |

These are small candidate changes, not verified outcome improvements. Review them individually; “low risk” still requires checking their affected runtime state.

## Keep the existing wins

- One-click dashboard sale/rental/request entry and contextual match-to-deal prefill.
- Prefilled commission collection, cash/date defaults and explicit immutable-issued-voucher wording.
- First-invalid-field focus, fixed form actions, search/filter recovery and table keyboard support.
- One accounting workspace, one reports hub, favorites inside lists, contextual specialist navigation.
- Separate sales/rentals, currencies and office-income/custody-money semantics.

## Do not label these quick styling fixes

Exact-code search (UX-01), undated-task status (UX-04), shared accounting date filtering, contract creation/autosave rules (UX-13), navigation consolidation and unified urgency require behavior acceptance and focused verification. Required-field removal and database/domain merging are not recommendations of this audit.

No percentage time saving was measured. The field-disclosure targets in the [metrics table](DALALY-UI-UX-AUDIT.md#13-beforeafter-metrics) are estimates of exposed controls only.
