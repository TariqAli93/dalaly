# Dalaly UI/UX improvement roadmap

Planning only, 1 November 2026. Nothing in this roadmap is implemented by the audit. Findings and evidence are in the [main report](DALALY-UI-UX-AUDIT.md); safe traces and unverified contract behavior are in [workflow analysis](WORKFLOW-ANALYSIS.md).

Effort bands: S ≤1 engineering day, M 2–4 days, L 5–10 days for an engineer familiar with the application. These are rough per-change estimates, not additive delivery commitments. User validation, review and unexpected regressions are additional.

## Phase 1 — Critical usability issues

No P0 was verified. Address P1 accuracy/interpretation problems before visual restructuring.

| Small reviewable change | Finding | Dependencies | Risk | Acceptance criteria |
|---|---|---|---|---|
| Correct feature/contact-history descriptions | UX-05, S | Confirm descriptions against current CRM, accounting and leases | Low; misleading scope must not be replaced with a broader false promise | No dashboard statement denies an implemented capability; links lead to permitted records |
| Distinguish summary dates from transaction-list dates | UX-03, M | Agree on explicit independent scopes versus opt-in date synchronization | Medium if existing filters are silently changed | Selected period is unambiguous for every card/list; historical rows are clearly labelled; IQD/USD and custody treatment unchanged |
| Prioritize complete code matches | UX-01, M | Explicit search-behavior acceptance; review phone fallback | Medium; search is business-facing behavior | H-0001 prioritizes its exact record; phone/name/Arabic/digit queries retain supported behavior; keyboard opens the visibly selected result |
| Separate future task from recorded activity | UX-04, M | Product decision on undated tasks; review schema and history semantics | Medium; status defaults affect workflow | “New task” does not silently imply already done; explicit completion still supported; existing records retain meaning |

**Phase gate:** targeted tests for search/task/filter behavior plus actual Electron reproduction. No schema/API changes should be necessary for copy/scope labelling; if later design requires one, propose it separately. Do not fold these into a large styling PR.

## Phase 2 — Navigation and page consolidation

**Scope:** UX-10/11/14/17. Preserve existing consolidations: one accounting area, one report hub, favorites inside offer lists and unified tasks. Related sales/rentals can share a navigation entry without sharing database records or images. Deals, agreements and active leases retain their lifecycle distinctions.

Start with a small prototype of 8–9 useful destinations. Each opens a real default/last-used workspace. Keep deep links, contextual actions, permission filtering and direct specialist access. Add compact stage jumps/counts to the existing deal board while preserving the table alternative. Prototype a linked client “next action” summary instead of duplicating all nine tab contents.

**Dependencies:** approved Phase 1 vocabulary, a list of frequent tasks for owners/agents/accountants, representative role fixtures. **Effort:** L per substantive navigation/client-context change.

**Risks:** replacing destinations with nested menus can add clicks; grouping reports/admin can become incoherent; role-based access can hide a parent's permitted child; losing a selected row/filter can break return navigation.

**Acceptance criteria:**

- Dashboard-to-sale, match-to-deal and contextual collection stay at one entry click.
- Offer/request list-to-create stays at two clicks or fewer from another section.
- Lower navigation is discoverable at 1366×768; active context and breadcrumbs stay correct.
- All legacy redirects, query views, keyboard shortcuts and permission-specific children remain reachable.
- Table selection/search/filter/page survive appropriate back navigation.
- Office-user tasks justify the grouping. Reject a smaller sidebar if total effort rises.

## Phase 3 — Forms and workflow simplification

**Scope:** UX-06/07/08/09/12/13. Implement one form at a time: sale, rental, request, compact client create, then contract editing after verification.

Keep all existing required fields and validation. Collapse optional detail, retain its values when hidden, and reveal any group containing a validation error before focusing it. Align the order of shared concepts while retaining domain-specific pricing/period/legal fields. Reuse person selection, owner auto-fill and contextual presets already present.

**Dependencies:** exact frontend/backend required-field agreement; current new/edit fixtures; explicit contract test fixtures. **Effort:** M per primary form, L for contract ordinary-versus-specialist editing.

**Risks:** hidden validation errors; resetting values when sections close; confusing total/unit price; treating rental and sales as one backend domain; changing autosave/issued-document behavior without tests.

**Acceptance criteria:**

- Default sale/rental/request exposure targets are approximately 12/11/7 labelled controls, with remaining controls discoverable by meaning.
- Sale retains nine default-branch required controls and four blank required values; rental retains eight/four. Conditional pricing is correct.
- Existing records round-trip all hidden optional values unchanged.
- Invalid submission expands and focuses the correct group/field; Save/Cancel remains reachable at native laptop size and 125% zoom.
- New client can be entered with the required name without completing a dossier; later identity/contract needs remain enforceable.
- Before contract changes, visually test all four types with draft/review/issued records, deal prefill, autosave success/conflict/recovery, issue/amend/cancel and exported PDF/Word artifacts in an isolated dataset.
- No change to immutable issued content or financial posting semantics is accepted as incidental UI cleanup.

## Phase 4 — Dashboard and information hierarchy

**Scope:** UX-02 plus the dashboard proposal in the [audit](DALALY-UI-UX-AUDIT.md#7-dashboard-redesign-proposal).

Build compact urgent counts, one attention queue, matching and one financial/business summary. Reuse existing alerts/task/lease/commission sources, record links and contextual dialogs. Show categories, due dates, reasons and one primary next action. Preserve specialized pages and all meaningful alerts; deduplicate repeated presentation, not distinct obligations.

**Dependencies:** task-intent and accounting-scope decisions; stable typed alert data and permission rules. **Effort:** L, split into queue presentation, integrations and summary pruning.

**Risks:** totals counted twice, confusing people with obligations, dropping terminated/renewed-lease arrears, mixing currencies, hiding alerts during partial API failure, or prioritizing items by an unexplained score.

**Acceptance criteria:**

- At 1366×768, the first viewport exposes contact priorities, matches, today's schedule and urgent obligations.
- The tested seven overdue tasks and eight overdue instalments are represented in the attention mechanism, with proper scopes and no fabricated person count.
- Each queue action reaches the correct record or prefilled dialog; collection still takes one entry click.
- Loading/failure in one source does not masquerade as “nothing needs attention”.
- IQD/USD, custody/office income and period/current balances remain separated.
- A five-second office-user comprehension test and repeated task traces support the final hierarchy. Panel-count reduction alone does not prove an effort reduction.

## Phase 5 — Visual consistency and polish

**Scope:** UX-15/16/18/19/20/21 and component recommendations. Tackle empty-report recovery, floating labels/dependency hints, gallery compression, disabled backup-setup disclosure, a named import exit and human-first permission descriptions as separate changes.

**Dependencies:** shared tokens and Phase 3 form structure. **Effort:** S–M per item.

**Risks:** larger typography can clip rows; collapsed backup setup can hide essential privacy/encryption explanations; gallery changes can remove keyboard image controls; technical permission identifiers remain important for specialist support.

**Acceptance criteria:**

- Representative dashboard, forms, lists, deals and studio checked in actual Electron at 1366×768, 1440×900 and 1920×1080.
- Relevant 125%/higher text settings, light/dark and Arabic/Latin mixed data stay usable; no document-wide horizontal overflow except deliberate contained workspaces.
- Active normal text meets the 4.5:1 contrast benchmark; essential dependency guidance remains readable even beside disabled controls.
- Ctrl+F, row keys, Alt+Left, Ctrl+K/Escape, F1, focus visibility and dialog keyboard behavior remain intact.
- Empty states distinguish no data, filters and failed loading, with a relevant recovery action.
- Gallery upload/paste/order/primary/export remain accessible; no missing features hidden by a visual simplification.

## Validation and change boundaries

For each future implementation, report changed files, actual tested scope, unresolved limitations, and migration/breaking-change flags. Use targeted tests where behavior changes; do not use broad tests as a substitute for real Electron checks. No global lint/build result is claimed by this documentation-only audit.

Measure the same user task before/after with the same fixture. Record manual values, interaction types, transitions, duration and correct outcome. A 50% claim requires a measured denominator and repeated successful outcomes; the current 52–64% field-exposure estimates do not establish that claim.

Keep backend/API payloads, events, validation, permissions, routes, search/filter/pagination behavior and database domains stable unless an individually reviewed proposal explicitly changes them. All estimates above describe future work, not authorization to implement during this audit.
