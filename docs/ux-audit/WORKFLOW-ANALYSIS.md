# Dalaly workflow analysis

Date: 1 November 2026. Inspection: actual development Electron, existing synthetic `dalaly_demo` data. See the [audit](DALALY-UI-UX-AUDIT.md) for priorities and [runtime evidence](RUNTIME-EVIDENCE.json) for measurements.

**Coverage: six workflows examined, five exercised through safe pre-submit interactions, zero business records saved. Contract creation/issue/export is partial.** These traces are not six successful end-to-end transactions.

## Counting convention

- An entry click is an actual UI click from the specified start to its form/drawer. Inventory navigation by URL/reload does not count as a user workflow.
- A labelled control is one `.v-field`/field label, not every underlying DOM input. Counts include expanded controls below the fold and exclude the global search, switches and individual amenity checkboxes. They are not counts of simultaneously visible fields.
- Required counts are the displayed starred/default branch and source validation, not a recommendation to weaken backend rules. Blank required values measure what the operator must supply with current defaults.
- Selecting a record can involve opening a selector, typing and selecting a result; these are different interactions and are not compressed into a fictional one-click end-to-end total.
- No duration was measured with office staff. Recommendations and future click counts are estimates.

## A. Add a sale or rental property

**Start:** dashboard. **Safe endpoint:** creation form with defaults inspected; sale empty-form validation exercised.

| Step | Sale | Rental |
|---|---|---|
| Open the form | Click “عرض بيع” (1) | Click “عرض إيجار” (1) |
| Alternative route | Sidebar offer list + Add (2 clicks) | Sidebar rental list + Add (2 clicks) |
| Expanded labelled controls | 33 | 23 |
| Starred required controls | 9 | 8 |
| Required values already defaulted | Type, legal category, status, unit, pricing method (5) | Type, status, payment period, area unit (4) |
| Required blank values | Area, applicable price, owner name, owner phone (4) | Rent, area, owner name, owner phone (4) |
| Default document height / client height | 1630 / 729px | 1368 / 729px |
| Save behavior checked | Empty Save → four errors, focus on area; no POST | No successful save attempted |

The sale pricing branch changes the applicable price input; both alternative price fields must not be counted as simultaneous requirements. Location/parcel data is present but not all starred. Existing owner selection can fill empty name/phone fields; this is already implemented. Calculated totals and fixed Save/Cancel are strengths.

**Waste:** optional location refinements, building measurements, map coordinates and notes are expanded before their relevance is known. Sale and rental group order differs. **Recovery:** first-invalid-field focus worked. No success notification, post-save routing, image-upload completion, duplicate-property handling or persisted draft recovery was tested.

**Proposed:** retain the existing 1-click shortcut and all required values; initially expose about 12 sale/11 rental controls and disclose the rest. Projected reductions are 64%/52% in exposed controls, not in mandatory typing. See UX-06/07 and [form plan](DALALY-UI-UX-AUDIT.md#8-forms-simplification-plan).

Evidence: [sale](screenshots/E05-sale-form.png), [validation](screenshots/E06-sale-validation.png), [rental](screenshots/E09-rental-form.png), [edit sale](screenshots/E47-sale-edit.png), [edit rental](screenshots/E48-rental-edit.png).

## B. Create a client request and act on matches

**Start:** dashboard purchase-request shortcut or request list. **Safe endpoints:** new-request dialog and existing matched/unmatched request records.

1. Dashboard “طلب شراء” opens the dialog in one entry click. List route requires opening requests then Add (two clicks).
2. Purchase dialog presents 16 labelled controls. Client and type are starred; type is prefilled, client is blank. Rental adds the rental-period criterion.
3. Existing client selector supports server search and code/phone disambiguation. “زبون جديد” provides inline client creation, inspected without submission.
4. Save button reads “حفظ ومطابقة”. It was not clicked with a valid payload; new-request save/matching is unverified.
5. Existing `/purchase-requests/2` visibly shows one full match and one partial candidate, reasons, property links and per-candidate deal actions.
6. Existing `/rental-requests/1` shows `0 / 0`, an explanation and “إعادة المطابقة”. No broadened-search or edit was saved.

**Repeated entry:** no duplicate client record was necessary for the existing-client case. **Confusion:** the form exposes advanced preferences and notes before a basic request is established. Full matches and partial candidates are distinguished correctly; preserve this.

**Proposed:** client/type, budget and location first; optional specifications afterwards. About 7 initial purchase controls is a 56% exposure reduction. For unmatched requests, put actionable edit/search links beside the explanation without silently relaxing constraints. Do not claim that new-request matching was tested. See UX-08.

Evidence: [dialog](screenshots/E14-purchase-request-form.png), [matched request](screenshots/E15-purchase-request-details.png), [unmatched request](screenshots/E17-rental-request-details.png).

## C. Create a deal and reach contract/accounting context

**Start:** dashboard match. **Safe endpoint:** populated deal dialog; existing deal record reviewed.

- One click on the match's “صفقة” opens a sale deal with property, buyer/request and owner context already supplied. No need to reselect those records. This existing efficiency should be preserved.
- Standalone “صفقة جديدة” opens the same dialog without that context. Property/client selection is additional work; agreed price and expected commission are available, with amount/% choice.
- Title/priority/employee/currency/notes already use an advanced section. Do not propose progressive disclosure here as a missing feature.
- Existing `/deals/1` exposes stage, offers, commissions, custody/office money, receipts, activities and contract preparation. “إعداد العقد” leads to preparation; creating the draft would persist data and was not executed.
- The board has nine stages and a 2280px content span within 1092px at the laptop baseline. The table alternative is usable and persists selection.

**No save or stage transition occurred.** Commission creation, deal close/reopen and automatic accounting transitions are source-reviewed, not transaction-tested. Existing contextual collection was separately exercised in E.

**Proposed:** make the contextual route the recommended daily path, improve later-stage discovery and clarify contract handoff. No measured total input or time saving is claimed. See UX-11/12/13.

Evidence: [blank deal](screenshots/E19-deal-dialog.png), [contextual prefill](screenshots/W01-context-deal.png), [deal record](screenshots/E20-deal-details.png), [table](screenshots/E54-deals-table.png).

## D. Create and export a contract — partial

**Start:** Contracts. **Safe endpoint:** new-type chooser and actual template studio. Existing agreements: **zero**.

- Contracts list → “عقد جديد”: one click to four type choices.
- Types: sale, instalment sale, residential rent and commercial rent.
- Selecting a type calls `createAgreement` and creates a persisted draft. This was not performed.
- Source declares five steps: parties, property, details, content, preview/issue. Autosave, conflict handling, local recovery, revisions, issuance and PDF/Word/print are implemented in source, but were not visually exercised on a real contract record.
- Four template entries and the sale template studio were opened; editor controls, placeholder preview and page properties were visually reviewed. A missing-contract response was captured separately and is not counted as populated workspace inspection.

**Unverified:** client/asset selection inside a contract, editable contract fields, validation between steps, autosave success/recovery, preview of a populated contract, issue/amend/cancel, native save dialogs, saved PDF/Word output and printing. No end-to-end click count can honestly be supplied.

**Proposed next validation:** use an authorized isolated dataset containing draft/review/issued examples for each type; check prefill from deals, immutable issued content, correction flow and exported artifact pagination. Only then change persistence boundaries or simplify ordinary editing. See UX-12/13. No legal validity assessment was performed.

Evidence: [empty list](screenshots/E23-contracts-empty.png), [chooser](screenshots/E24-contract-new.png), [templates](screenshots/E25-contract-templates.png), [studio](screenshots/E26-template-studio.png), [missing record](screenshots/E58-contract-missing.png).

## E. Manage accounting and collect a commission

**Start:** existing commission detail. **Safe endpoint:** prefilled receipt dialog, cancelled without issue.

1. Click “تحصيل” (one entry click).
2. Receipt supplies outstanding balance, payer/commission context, today, IQD cash account, purpose and description. Two starred fields (amount/description) are already filled in the displayed preset; zero manual values are needed to accept the full balance.
3. “تغيير” exposes date/cash/currency options. “إصدار” is the persistence boundary and was not clicked.
4. Issued voucher, journal, account statement, cash boxes, employee shares and lease money views were read. Transfer, reconciliation, expense and manual-journal forms were opened but not submitted.

**Strength:** this is already a short contextual flow, not a candidate for a new multi-step wizard. **Confusion:** period summaries and all-time lists coexist; “تسديد عمولة” and “تحصيل” use different perspectives. Preserve office-income/custody distinctions and separate currencies.

**Proposed:** keep the 1-click prefilled collection, standardize the collection/payout language and make period boundaries explicit. Receipt issuance, postings, cancellation/reversal and printed output remain unverified. See UX-03 and component recommendations.

Evidence: [commission](screenshots/E30-commission-details.png), [collection](screenshots/E31-commission-collection.png), [voucher](screenshots/E32-voucher-details.png), [cash](screenshots/E33-cash.png), [lease](screenshots/E39-lease-details.png).

## F. Daily office management

**Start:** dashboard at 1366×768. **Safe endpoints:** match drawer, appointment/customer/task/lease views.

| Office question | What the runtime provides | Effort/limitation |
|---|---|---|
| Who should I contact? | Decision/customer cards, contact-needed business panel, client activity | Contact-needed panel begins around y=958, below the initial viewport; overlapping groups require interpretation |
| Which listings match? | Prominent matching workspace with reasons, partial/full distinction and direct actions | Match details opens in one click; contextual deal opens in one click |
| What is scheduled today? | KPI/priority link and appointments view | Direct action exists; tasks and appointment subsets have different coverage |
| What is urgent? | Task/lease panels, commission collection and global alert count | Priority strip omits task/lease business summaries; global notification mechanism should be reused, not recreated |

No call, WhatsApp message, task completion, payment or appointment update was sent. The 15-alert badge is visible; it is not 15 distinct people and should not be interpreted that way.

**Proposed:** unified attention queue, then matching and a concise period summary. Deduplicate presentation by record/action while retaining alerts for different obligations. Establish five-second comprehension and task-time baselines with office users before claiming 50% less effort. See UX-02/05/17.

## Error recovery and keyboard checks

Sale loading was captured by holding a real read request, then released. An audit-injected 503 showed the real list error UI; removing the interception and Retry restored data. A deliberately unmatched query showed a clear-filter action, which restored 11 rows. These are controlled tests, not reported production outages.

Ctrl+F focused page search. ArrowDown/Enter opened the selected first result; with `H-0001`, that was the phone-based alternative, demonstrating UX-01. Alt+Left retained the query and two-result list. Ctrl+K/Escape and F1 worked. Initial automation assumptions about debounce/one exact result failed; the final report uses the settled two-result observation, not those premature assertions.
