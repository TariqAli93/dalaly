# Release notes

## 0.2.0 (draft, not released)

The first release since 0.1.0 (June 2026), which had sign-in, roles and
sale listings only. Since then Dalaly has become a brokerage office system,
following the workflow customer → request → matching → deal → contract →
payment → commission → reports → follow-up. The business phases, their PRs
and checks are in [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md).

### Before the business system (June–October)

- **Records:**
  - rental listings;
  - customers (people);
  - rental and purchase requests, with matching against listings;
  - identity documents, with expiry and requirements;
  - photos with thumbnails;
  - favorites;
  - locations and maps (Leaflet and OpenStreetMap);
  - the Excel import of listings.
- **Contracts:** the four built-in templates, with drafts, issued
  revisions, PDF and Word.
- **Setup and backups:**
  - a setup screen that creates the first administrator;
  - backups and restore;
  - scheduled backups, with the encrypted, database-only copy by email.
- **Remote access** through a Cloudflare tunnel (optional).
- **Desktop redesign:** the sidebar, the command bar and the shared list
  grid.

### The business system (October)

- **Customers and tasks.**
  - A customer can have roles (buyer, seller, tenant, landlord, owner,
    investor), a source and an employee who follows them up.
  - The app warns about a duplicate phone number or national ID.
  - Each customer has a timeline.
  - Tasks and follow-ups have a due date, a priority, an assignee and an
    outcome, on one tasks page.
- **Deals.** A pipeline from first contact to won or lost. A deal records
  its offers and counter-offers and keeps its stage history. It can start
  from a request, a match, a customer or a listing, and prepare its
  contract.
- **Accounting.**
  - A chart of accounts and a posted, balanced journal.
  - Receipt and payment vouchers, printable.
  - Commissions with employee shares.
  - Expenses by category, cash and bank transfers, and reconciliation.
  - Money the office holds for a client is kept apart from its income.
  - A property's sale price is never the office's revenue.
- **Leases.**
  - A lease in force is created from an issued rent contract, with its
    installments.
  - Rent is collected against installments, with overdue tracking.
  - The deposit is held for the tenant, and rent is held and paid out to
    the landlord.
  - A lease can end early or be renewed.
- **Reports.**
  - Financial: trial balance, income statement, balance sheet, cash flow,
    commissions, receivables and payables.
  - Operational: deals, customers, listings and leases.
  - Each prints, and exports as PDF or Excel.
- **Dashboard and navigation.**
  - Panels for overdue tasks, stalled deals, customers to contact, leases
    and the month's money, plus a notifications bell.
  - The sidebar is grouped by business area, and «إضافة» starts any
    record from any page.
- **Faster lists.** The vouchers, deals and tasks lists answer in about
  a third to a half of the time on a year of data. Four list pages no
  longer reload their rows several times a second while open.

### Installing and upgrading

- **From 0.1.0: not yet decided.** A database created by 0.1.0 cannot be
  upgraded in place. Its three migrations were replaced by a new baseline
  in October, so the upgrade stops at «relation "permissions" already
  exists» and the app shows its startup error. 0.1.0 had no backup
  feature, so there is no backup to restore either. See
  `IMPLEMENTATION_PROGRESS.md`, 9b.
- **A new install** runs every migration (`0000`–`0015`) on an empty
  database, and the setup screen creates the first administrator.
- **Permissions.** The **Super Admin** role receives every permission
  automatically. **Other roles see none of the business modules** until
  an administrator grants them in الأدوار والصلاحيات. The new areas are
  deals, agreements, accounting, vouchers, commissions, cash, leases and
  both reports.

### Checked before release

Recorded in `IMPLEMENTATION_PROGRESS.md`, Phase 9:

- the unit and database suites;
- the sale and rental workflows end to end (`test:workflows`);
- the real Electron startup scenarios;
- `pnpm perf` on a packaged build of this version against the
  28 October build.
