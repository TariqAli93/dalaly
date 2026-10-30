# Reports

Every report figure comes from stored records and has one definition,
written below. The financial reports are in Phase 6a, and the operational
reports (deals, customers, listings, leases) in Phase 6b. The financial reports (Phase 6a) read the **posted journal**.
Commissions and employees' shares also read the documents behind the
journal (commissions, splits, vouchers). So a report always agrees with the
trial balance, and a correction (a reversal, a voided voucher) shows on the
date it was made.

Code: `server/src/modules/reports/`. The rules (period defaults, aging) are
in `reports.rules.ts`; the queries are in `reports.repository.ts`.

## Common rules

- **Currencies are never mixed.** Every report has one section per currency
  (IQD, USD), in that order. A section appears when that currency has
  figures, or when `currency` asks for it.
- **Exact money.** SQL sums `numeric(18,2)`; TypeScript adds bigint minor
  units (`shared/money.ts`). The API sends decimal strings.
- **Posted only.** Draft entries are left out. A reversal is a posted entry
  dated when it was made, so it nets out in the period that holds both
  entries.
- **Periods include both ends.** `from` defaults to 1 January of `to`'s
  year, and `to` to the office's today in Baghdad (`officeToday`). A day
  report (`as_of`) also defaults to that today. `from` after `to` is a 400.
- **Headings.** Each account falls under the nearest account at or above it
  whose system key is a heading (`cash`, `bank`, `receivables`,
  `client_funds`, `payables`, `commissions_payable`, `capital`,
  `retained_earnings`, `brokerage_income`, `other_income`,
  `commission_expense`, `operating_expenses`, or a top heading). An account
  an office adds under "bank" is therefore a bank account in every report.
- **Not income.** Client funds (a buyer's deposit, a tenant's rent for the
  landlord) are a liability. A listing's price never enters the ledger.
- **Permission.** All financial reports need `reports.financial`, which only
  Super Admin has by default. It does not grant `accounting.read`:
  drill-down links to the journal and accounts show only to users who have
  it.

## Trial balance — `GET /api/reports/financial/trial-balance?from&to&currency`

For every account with posted lines up to `to`:

| Column    | Formula                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------ |
| `opening` | Σ (debit − credit) of lines dated before `from`                                                  |
| `debit`   | Σ debit of lines from `from` to `to`                                                             |
| `credit`  | Σ credit of lines from `from` to `to`                                                            |
| closing   | opening + debit − credit, shown as `closing_debit` when positive, `closing_credit` when negative |

`balanced` holds when Σ debit = Σ credit and Σ closing_debit =
Σ closing_credit. Every posted entry balances in its one currency, so
Σ opening is always 0.

## Income and expenses — `GET /api/reports/financial/income-statement?from&to&currency&group`

- Revenue account: Σ (credit − debit) of its lines in the period.
- Expense account: Σ (debit − credit) of its lines in the period.
- `net` = revenue − expenses.
- With `group=month`, the same sums are given per calendar month, for every
  month the period touches (`months`).
- `expense_categories`: the expense lines of entries made by a payment
  voucher (or by the reversal of a voided one), summed by the voucher's
  category. Expense lines from other entries (commission shares, manual
  entries) are in the account rows but not in this split.

## Balance sheet — `GET /api/reports/financial/balance-sheet?as_of&currency`

- Lines dated up to `as_of`.
- Asset: Σ (debit − credit).
- Liability and equity: Σ (credit − debit).
- `earnings` = all revenue − all expenses up to `as_of`. These are the
  earnings not yet closed into retained earnings: the office posts no
  year-end closing entry.
- `liabilities_and_equity` = liabilities + equity + earnings.
- `balanced` holds when assets equal `liabilities_and_equity`, which is true
  whenever every entry balances.

Accounts with a zero balance are left out.

## Cash flow — `GET /api/reports/financial/cash-flow?from&to&currency`

The money accounts are the postable accounts under the `cash` and `bank`
headings.

- **Categories.** Take every posted entry in the period that touches a
  money account, and look at its _other_ lines.
  - A credit on such a line is money in: Σ max(credit − debit, 0).
  - A debit on it is money out: Σ max(debit − credit, 0).
  - They are summed by that line's heading (`receivables`, `client_funds`,
    `operating_expenses`, `capital`, …).
  - A transfer between cash and bank has no other line, so it is no flow.
  - A manual entry that mixes cash and non-cash lines is split by line.
- **Accounts.** Each money account's `opening` (debits less credits before
  `from`), `money_in` (Σ debits in the period), `money_out` (Σ credits in
  the period) and `closing`. Here a transfer shows on both accounts.
- `balanced` holds when Σ openings + Σ category nets = Σ closings. This
  always holds, because an entry's other lines balance its money lines.

## Commissions — `GET /api/reports/financial/commissions?from&to&currency&user_id`

Commissions whose `commission_date` is in the period. Cancelled ones are
listed (`status`) but left out of every total.

| Figure        | Formula                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| `recorded`    | Σ amount                                                                             |
| `collected`   | Σ posted (not voided) receipt vouchers allocated to the commission, dated up to `to` |
| `outstanding` | recorded − collected                                                                 |
| `shares`      | Σ commission split amounts                                                           |
| `shares_paid` | Σ posted payment vouchers allocated to those splits, dated up to `to`                |
| `shares_owed` | shares − shares_paid                                                                 |
| `office_net`  | recorded − shares                                                                    |

- `by_deal_type` splits recorded and collected between sale and rent deals.
- `employees` sums the shares by user.
- With `user_id`, only commissions that user has a share in are listed, and
  only that user's row appears.
- At most 2000 rows are listed (`truncated`). The totals cover the rows
  returned.
- Recorded commissions post brokerage income on their date. With no direct
  "commission" receipts (income without a commission document) and no
  manual entries, `recorded` equals the period's brokerage income.

## Receivables — `GET /api/reports/financial/receivables?as_of&currency`

What each customer owes the office: the posted lines on accounts under
`receivables` dated up to `as_of`, grouped by the customer each line names
(lines naming nobody form one row).

- **Aging (FIFO).** Each debit is a charge, dated by its entry. Credits
  settle the oldest charges first. What is left of each charge goes into a
  bucket by its age in days on `as_of`:
  - `current`: up to 30;
  - `days_31_60`;
  - `days_61_90`;
  - `over_90`.
- Credits beyond every charge (an overpayment) are a negative amount in
  `current`, so the buckets always add up to `total`.
- Rows with a zero total are left out.
- Σ totals equals the receivable accounts' balance in the trial balance at
  `as_of`.

## Payables — `GET /api/reports/financial/payables?as_of&currency`

What the office owes on `as_of`:

- `client_funds`: Σ (credit − debit) on accounts under `client_funds`, by
  the customer each line names. This is money held for landlords and
  sellers, and tenants' deposits.
- `payables`: the same over accounts under `payables`.
- `employees`: per user, Σ splits of active commissions dated up to `as_of`,
  less posted payment vouchers allocated to them dated up to `as_of`. Only
  users with something owed are listed.
- `employee_shares_ledger`: the commissions-payable accounts' balance.
  `employee_shares` equals it unless manual entries moved those accounts.

## Account ledger — `GET /api/reports/financial/ledger/:id?from&to`

One account's posted lines in the period with a running balance on its
normal side, after its opening balance. This is the cash and bank ledgers.
It is the same statement as `/api/accounting/accounts/:id/statement` (at
most 2000 lines), behind `reports.financial`.

## Operational reports (Phase 6b)

They are under `/api/reports/operations/`.

- **Permission.** Each needs `reports.operations` **and** its area's read
  permission: `deals.read`, `people.read`, `properties.read` or
  `rentals.read` by kind, and `leases.read`. Figures built on requests are
  null without `requests.read`, the way the dashboard leaves them out.
- **Dates.** Timestamps are read as dates in Baghdad. Periods default to
  the year to date, as in the financial reports.
- **Rates.** A rate is a percentage to one decimal, null when there is
  nothing to divide by. A money rate (collection) is computed from exact
  hundredths.

### Deals — `GET /api/reports/operations/deals?from&to&user_id&deal_type`

`user_id` keeps the deals assigned to that employee; `deal_type` keeps sale
or rent deals.

| Figure                       | Definition                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created`                    | deals created in the period                                                                                                                                            |
| `won` / `lost` / `cancelled` | deals in that stage whose `closed_at` is in the period                                                                                                                 |
| `open_now`                   | deals now in any stage but won, lost, cancelled (the active negotiations)                                                                                              |
| `win_rate`                   | won ÷ (won + lost) of those closed in the period; a cancelled deal (withdrawn) is neither                                                                              |
| `cohort_conversion`          | of the deals created in the period, the share won by now                                                                                                               |
| cycle                        | days from `created_at` to `closed_at` of the deals won in the period: average and median                                                                               |
| `stages`                     | open deals per stage, with the average days since they entered it                                                                                                      |
| `pipeline`                   | open deals and their expected commission, per currency                                                                                                                 |
| `lost_reasons`               | deals lost in the period by their reason (trimmed; empty is «بلا سبب»), with its share of the losses                                                                   |
| `employees`                  | per assigned employee: open now, created, won, lost, win rate, average cycle, and the active commissions dated in the period on their deals (dinars and dollars apart) |
| `commissions`                | active commissions dated in the period, per currency and deal type                                                                                                     |
| `closed`                     | the deals closed in the period, newest first (at most 1000)                                                                                                            |

### Customers — `GET /api/reports/operations/customers?from&to&user_id&days`

**A contact** is an activity, or a sale or rental follow-up, that names the
customer.

`user_id` keeps:

- the customers assigned to that employee (active, new, uncontacted,
  repeat);
- the contacts made by that employee (contacted, by type, by employee).

| Figure                                 | Definition                                                                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`                               | customers whose status is active                                                                                                                                                                                                                     |
| `new`                                  | customers added in the period                                                                                                                                                                                                                        |
| `contacted`                            | customers with a contact in the period                                                                                                                                                                                                               |
| `uncontacted`                          | active customers with something open (an open deal as client or owner, or an open request), whose last contact is more than `days` (default 30) days before the period's end, or who were never contacted. Never contacted first, at most 500 listed |
| `repeat`                               | customers on two or more won deals (as client or owner) closed by the period's end                                                                                                                                                                   |
| `new_conversion`                       | of the customers added in the period, the share on a won deal by its end                                                                                                                                                                             |
| `contacts_by_type`, `contacts_by_user` | contacts in the period, and the customers they reached                                                                                                                                                                                               |
| `requests`                             | per kind: open requests of active customers; requests added in the period, those with a deal, those with a won deal, and the share won (`conversion`)                                                                                                |

### Listings — `GET /api/reports/operations/listings?kind&from&to`

For sale listings (`kind=sale`) or rentals (`kind=rental`), and the
requests for them.

| Figure        | Definition                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `statuses`    | listings per current status                                                                                                                                                                                                                                                                                                                 |
| `closed`      | listings now sold (rented) whose change log records the change in the period (the dashboard's definition)                                                                                                                                                                                                                                   |
| `stale`       | available listings with no edit and no follow-up in the last 30 days (the dashboard's definition)                                                                                                                                                                                                                                           |
| `age`         | available listings by days since added: 0–30, 31–90, 91–180, 181–365, over 365; and the median                                                                                                                                                                                                                                              |
| `types`       | available listings and open requests (of active customers) per property type                                                                                                                                                                                                                                                                |
| `price_bands` | available listings by price, and open requests by their top budget, in fixed bands of dinars. A sale uses its total price. A rental uses its rent as a month's share (annual ÷ 12, semi-annual ÷ 6), and a request's budget is read the same way. A band holds its lower bound and not its upper one; amounts are compared in SQL `numeric` |
| `demand`      | open requests per governorate and district, beside the available listings in the same governorate and district                                                                                                                                                                                                                              |
| `unmatched`   | open requests of active customers that no available listing matches on every required criterion (the dashboard's matching)                                                                                                                                                                                                                  |

Sale bands start at 0, 100, 200, 300 and 500 million, and 1 billion dinars.
Rental bands start at 0, 500 thousand, 1, 1.5, 2 and 3 million.

### Leases — `GET /api/reports/operations/leases?from&to&days`

| Figure      | Definition                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `in_force`  | per currency: leases in force today (status active, today within their dates) and upcoming ones; their rent as a month's share (each lease's rent ÷ the months of its frequency, rounded to the fils), summed                 |
| `expiring`  | leases in force whose last day is within `days` (default 60) days of today                                                                                                                                                    |
| `due`       | installments due in the period on leases where the office collects (not cancelled, not released by a termination): their amount, what was paid on them (never beyond each one's amount) and the collection rate paid ÷ amount |
| `overdue`   | the same installments due before today and not fully paid: how many, what is left, the oldest's days                                                                                                                          |
| `ended`     | leases (not cancelled) whose termination day, else last day, is in the period; how many were renewed or terminated; renewal rate = renewed ÷ ended                                                                            |
| `brokerage` | leases added in the period (activated, and renewals apart), rent deals won in the period, and active commissions on rent deals dated in the period per currency                                                               |

## Screens and exports

- `/reports/financial` has a tab per report. Its filters (period or day,
  currency, month by month, employee, account) are in the address.
- Each response is mapped once to a table model, which the screen, the
  Excel file, the PDF and the printout all show. They cannot disagree.
- Sorting compares amounts exactly, as hundredths.
- In the Excel file, amounts are numbers so they can be summed. An amount
  too large for a double to hold to the fils stays text.
- Links lead to records the viewer may open: a customer (`people.read`),
  a deal (`deals.read`), a commission (`commissions.read`), a journal entry
  (`accounting.read`). An account opens its ledger inside the reports.

## Checks

- `test:reports` (`scripts/financial-reports.test.ts`) posts a known year:
  - capital;
  - two commissions, one with an employee's share;
  - a collection;
  - client funds in and out;
  - an expense and a voided one;
  - a share paid;
  - a transfer;
  - a dollar receipt.

  It checks each report's figures against it, and against the journal:
  - the trial balance's debits are every posted debit line;
  - the balance sheet's earnings are the income statement's net;
  - the receivables add up to the receivable account;
  - the cash flow closes at cash plus bank;
  - recorded commissions equal brokerage income.

  It also checks period edges, the currency filter, validation and the
  permission.

- `scripts/report-rules.test.ts` covers the period defaults, Baghdad's
  date, months, and aging (bucket edges, overpayment, a credit before any
  charge).
- **Timing.** Measured on 31 October 2026 against a generated year of
  40,000 posted entries (80,000 lines; this was a throwaway script, not a
  committed harness). Medians, through the API in-process:

  | Report           | Median |
  | ---------------- | ------ |
  | trial balance    | 67 ms  |
  | income statement | 92 ms  |
  | balance sheet    | 169 ms |
  | cash flow        | 233 ms |
  | receivables      | 140 ms |
  | payables         | 37 ms  |

  All are under the 500 ms target in `BUSINESS_SYSTEM_PLAN.md`.
