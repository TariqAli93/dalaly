# Implementation progress

The phases of [`BUSINESS_SYSTEM_PLAN.md`](BUSINESS_SYSTEM_PLAN.md), one
branch and one PR each, merged into `main` in order. A phase counts as
**Completed** only when its PR is merged and its checks passed. Before
resuming work, check this file against `git log main`, `gh pr list` and CI.
Do not rely on this file alone.

## Phases

| Phase | Branch | Pull request | Tests | Status |
| --- | --- | --- | --- | --- |
| 0 — audit and plan | `docs/phase-00-audit` | — | docs only; baseline checks pass | In review |
| 1a — file integrity | `fix/phase-01a-file-integrity` | — | — | Pending |
| 1b — media tokens | `fix/phase-01b-media-tokens` | — | — | Pending |
| 1c — hardening | `fix/phase-01c-hardening` | — | — | Pending |
| 2a — activities and tasks | `feat/phase-02a-activities` | — | — | Pending |
| 2b — customer CRM | `feat/phase-02b-customer-crm` | — | — | Pending |
| 2c — CRM UI | `feat/phase-02c-crm-ui` | — | — | Pending |
| 3a — deals core | `feat/phase-03a-deals-core` | — | — | Pending |
| 3b — deals UI | `feat/phase-03b-deals-ui` | — | — | Pending |
| 3c — deal integration | `feat/phase-03c-deal-integration` | — | — | Pending |
| 4a — chart of accounts | `feat/phase-04a-chart-of-accounts` | — | — | Pending |
| 4b — general ledger | `feat/phase-04b-general-ledger` | — | — | Pending |
| 4c — receipts and payments | `feat/phase-04c-receipts-payments` | — | — | Pending |
| 4d — commissions | `feat/phase-04d-commissions` | — | — | Pending |
| 4e — expenses and cash | `feat/phase-04e-expenses-cash` | — | — | Pending |
| 4f — financial integration | `feat/phase-04f-financial-integration` | — | — | Pending |
| 5a — leases | `feat/phase-05a-leases` | — | — | Pending |
| 5b — lease payments | `feat/phase-05b-lease-payments` | — | — | Pending |
| 6a — financial reports | `feat/phase-06a-financial-reports` | — | — | Pending |
| 6b — operational reports | `feat/phase-06b-operational-reports` | — | — | Pending |
| 7a — navigation | `feat/phase-07a-navigation` | — | — | Pending |
| 7b — dashboard | `feat/phase-07b-dashboard` | — | — | Pending |
| 8 — refactoring and performance | `refactor/phase-08-*` | — | — | Pending |
| 9 — final verification | `test/phase-09-*` | — | — | Pending |

## Baseline evidence (Phase 0, `main` at `3e01f9f`)

- `pnpm typecheck`, `pnpm exec eslint .`, `pnpm build`: pass.
- `pnpm test`: 52 / 52 pass.
- Database suites run locally against PostgreSQL 18: `test:permissions` 3,
  `test:thumbnails` 11, `test:contract` 80, `test:agreements` 11,
  `test:backup:compat` 5, `test:backup:safety` 4, `test:transactions` 1,
  `test:paging` 17, `test:dashboard:operations` 9 — all pass.

## Database migrations

| Migration | Phase | What it adds |
| --- | --- | --- |
| `0000`–`0004` | before this plan | baseline schema, document types, property indexes, search text, agreements |

## Decisions that need the owner

None open yet. The plan follows the owner decisions already recorded in
`AUDIT_AND_ROADMAP.md` (section 2) and `CONTRACT_SYSTEM_REMOVAL_MAP.md`. If
a phase reaches a choice that changes history, deletes data or changes how
money is accounted for beyond the plan, it is listed here, and the phase
stops at that point.

## Known issues

- `/api/dashboard/summary` and `/api/stats/summary` have no renderer caller
  (kept for now; `test:dashboard` reads the first). Revisit in Phase 8.
- The renderer has no unit tests of its own. Its pure helpers are tested
  from `server/scripts/renderer-utils.test.ts`.

## Performance measurements

Baseline: `PERFORMANCE.md`, "Baseline, October 2026" and later sections.
Targets for new modules: `BUSINESS_SYSTEM_PLAN.md`, section 7.
