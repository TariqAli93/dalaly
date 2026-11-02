# Changelog — audit implementation

Branch `feat/ux-audit-implementation`, 2 November 2026, oldest first. Each
commit is one finding or one coherent group and can be reviewed alone.

| Commit      | Finding   | Change                                                                                                                                         |
| ----------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `4b42c7d`   | UX-01     | Search: a whole listing code orders its listing first; same results. DB regression test.                                                       |
| `1bbff07`   | UX-04     | Task dialog: «مهمة يجب إنجازها» / «تسجيل أمر حدث» for new records; tasks page and instalment follow-up start as a task. Unit test.             |
| `fc06f68`   | UX-05     | Dashboard drawers and performance note point to contact history, accounting and leases.                                                        |
| `bebf55d`   | UX-03     | Accounting summary titled with its dates; list scope line with explicit actions; «تحصيل عمولة»; shared `periodText`.                           |
| `5e55864`   | UX-02     | Dashboard: figures strip, «يحتاج متابعتك» queue, matching with risks, work summary. Four panels retired. Unit test; `OPERATIONS_DASHBOARD.md`. |
| `cbbb4d1`   | UX-06–09  | Collapsible `FormSection`, `useFormSections`; sale, rental, request and client forms. Unit test.                                               |
| `49bbfca`   | UX-14, 15 | Reports: name and period first, overview on request, empty-period recovery.                                                                    |
| `65dffbc`   | UX-10     | Sidebar density: all 14 destinations at 1366×768.                                                                                              |
| `24b9931`   | UX-11     | Deal board stage chips with counts and jump; narrower empty stages; table link.                                                                |
| `de5e6b2`   | UX-17     | Client activity tab: «مفتوح الآن مع الزبون».                                                                                                   |
| `9d04930`   | UX-21     | Excel import: named close, «إلغاء», safe Escape.                                                                                               |
| `3ea06c4`   | UX-18     | Scheduled email backup fields folded while off.                                                                                                |
| `90ee7fe`   | UX-20     | Permissions: Arabic name and description first, copyable key.                                                                                  |
| `d290009`   | UX-16     | Listing gallery folds on non-detail tabs.                                                                                                      |
| `87de0b4`   | UX-19     | Floating labels 0.85em; disabled-field hints readable.                                                                                         |
| `f6d9052`   | UX-12     | Template studio and contract content step state their scope (after full lifecycle verification).                                               |
| (follow-up) | —         | Native date, time, month and number fields show Latin digits (`DateField`, `NumberField`); task date and time as two fields. Unit test.        |

UX-13 (choosing a contract type creates a draft) was verified and not
changed; see the summary.

## Not changed

- Database schema, migrations, API shapes, permissions and their keys.
- Financial postings, commission formulas, currency handling, ledgers.
- Matching rules, deal stages and their confirmation, contract issuing and
  issued revisions.
- Routes and deep links. Retired dashboard components were internal; their
  rows and figures moved into the new regions.
