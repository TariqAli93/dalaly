# Screenshot evidence

125 PNG captures from the actual development Electron application, 1 November 2026. No standalone-browser captures and no generated before/after mockups.

Screenshots show synthetic demo fixtures. Customer/phone/identity and financial values are masked where applicable; grey blocks are capture masks, not UI defects. Screenshots capture Electron web contents rather than the Windows frame; filenames with native outer sizes have a smaller client raster.

T01–T04 are explicitly controlled read-request delay/failure/recovery/empty tests. S03 is the actual native failure splash; it is not the renderer startup-error page. E58 is a missing-record error, not a populated contract workspace. Z1440/Z1920 deals-table captures retain the selected table view; the nine-stage board is E18.

See [coverage](../SCREEN-INVENTORY.md), [findings](../DALALY-UI-UX-AUDIT.md) and [sanitized measurements](../RUNTIME-EVIDENCE.json).

| Screenshot | Actual captured state | Raster |
|---|---|---|
| [C01-client-tab](C01-client-tab.png) | Client tab الصفقات | 1350×729 |
| [C02-client-tab](C02-client-tab.png) | Client tab الإيجارات | 1350×729 |
| [C03-client-tab](C03-client-tab.png) | Client tab المال | 1350×729 |
| [C04-client-tab](C04-client-tab.png) | Client tab الطلبات | 1350×729 |
| [C05-client-tab](C05-client-tab.png) | Client tab العروض المملوكة (1) | 1350×729 |
| [C06-client-tab](C06-client-tab.png) | Client tab المستمسكات (1) | 1350×729 |
| [C07-client-tab](C07-client-tab.png) | Client tab الملاحظات | 1350×729 |
| [C08-client-tab](C08-client-tab.png) | Client tab البيانات | 1350×729 |
| [D01-dashboard-dark](D01-dashboard-dark.png) | Dashboard in dark theme, isolated profile | 1350×729 |
| [D02-sale-dark](D02-sale-dark.png) | Sale form in dark theme | 1350×729 |
| [D03-settings-dark](D03-settings-dark.png) | Dark appearance settings | 1350×729 |
| [E01-login](E01-login.png) | Initial real Electron login | 1304×821 |
| [E02-login-api-origin-error](E02-login-api-origin-error.png) | Audit launch CORS mismatch, recovered by process-only configuration | 1304×821 |
| [E03-dashboard-1366x768](E03-dashboard-1366x768.png) | Dashboard top | 1350×729 |
| [E04-sales-list](E04-sales-list.png) | Sales list | 1350×729 |
| [E05-sale-form](E05-sale-form.png) | New sale form | 1350×729 |
| [E06-sale-validation](E06-sale-validation.png) | Arabic required validation and first-invalid-field focus | 1350×729 |
| [E07-sale-details](E07-sale-details.png) | Property details, media paths isolated | 1350×729 |
| [E08-rental-list](E08-rental-list.png) | Rental offers list | 1350×729 |
| [E09-rental-form](E09-rental-form.png) | New rental form | 1350×729 |
| [E10-rental-details](E10-rental-details.png) | Rental details | 1350×729 |
| [E11-clients](E11-clients.png) | Clients | 1350×729 |
| [E12-client-details](E12-client-details.png) | Client record | 1350×729 |
| [E13-purchase-requests](E13-purchase-requests.png) | Purchase requests list | 1350×729 |
| [E14-purchase-request-form](E14-purchase-request-form.png) | Purchase request dialog | 1350×729 |
| [E15-purchase-request-details](E15-purchase-request-details.png) | Matched purchase request details | 1350×729 |
| [E16-rental-requests](E16-rental-requests.png) | Rental requests list | 1350×729 |
| [E17-rental-request-details](E17-rental-request-details.png) | Unmatched rental request details | 1350×729 |
| [E18-deals](E18-deals.png) | Deals nine-stage board | 1350×729 |
| [E19-deal-dialog](E19-deal-dialog.png) | Deal creation dialog | 1350×729 |
| [E20-deal-details](E20-deal-details.png) | Deal record | 1350×729 |
| [E21-documents](E21-documents.png) | Documents list | 1350×729 |
| [E22-document-form](E22-document-form.png) | Document creation dialog | 1350×729 |
| [E23-contracts-empty](E23-contracts-empty.png) | Empty contracts list | 1350×729 |
| [E24-contract-new](E24-contract-new.png) | Contract chooser after dev prebundle settles | 1350×729 |
| [E25-contract-templates](E25-contract-templates.png) | Four contract templates | 1350×729 |
| [E26-template-studio](E26-template-studio.png) | Sale contract template studio, read-only inspection | 1350×729 |
| [E27-accounting-summary](E27-accounting-summary.png) | Accounting | 1350×729 |
| [E28-commissions](E28-commissions.png) | Accounting commissions view | 1350×729 |
| [E29-vouchers](E29-vouchers.png) | Accounting vouchers view | 1350×729 |
| [E30-commission-details](E30-commission-details.png) | Commission record and collection | 1350×729 |
| [E31-commission-collection](E31-commission-collection.png) | Prefilled commission receipt dialog | 1350×729 |
| [E32-voucher-details](E32-voucher-details.png) | Issued voucher details | 1350×729 |
| [E33-cash](E33-cash.png) | Cash | 1350×729 |
| [E34-accounts](E34-accounts.png) | Chart of accounts | 1350×729 |
| [E35-account-statement](E35-account-statement.png) | Account statement | 1350×729 |
| [E36-journal](E36-journal.png) | Journal | 1350×729 |
| [E37-journal-entry](E37-journal-entry.png) | Issued journal entry | 1350×729 |
| [E38-leases](E38-leases.png) | Leases | 1350×729 |
| [E39-lease-details](E39-lease-details.png) | Lease instalments and owner settlement | 1350×729 |
| [E40-reports](E40-reports.png) | Reports | 1350×729 |
| [E41-tasks](E41-tasks.png) | Tasks | 1350×729 |
| [E42-settings-appearance](E42-settings-appearance.png) | Appearance | 1350×729 |
| [E43-help](E43-help.png) | Help and keyboard shortcuts | 1350×729 |
| [E44-users](E44-users.png) | Users | 1350×729 |
| [E45-roles](E45-roles.png) | Roles | 1350×729 |
| [E46-locations](E46-locations.png) | Governorates districts and neighborhoods | 1350×729 |
| [E47-sale-edit](E47-sale-edit.png) | Existing sale form, no changes | 1350×729 |
| [E48-rental-edit](E48-rental-edit.png) | Existing rental form, no changes | 1350×729 |
| [E49-settings-office](E49-settings-office.png) | معلومات المكتب tab, read only | 1350×729 |
| [E50-settings-security](E50-settings-security.png) | الأمان tab, read only | 1350×729 |
| [E51-settings-backups](E51-settings-backups.png) | النسخ الاحتياطي tab, read only | 1350×729 |
| [E52-settings-system](E52-settings-system.png) | النظام والاتصال tab, read only | 1350×729 |
| [E53-report-picker](E53-report-picker.png) | Financial reports category picker | 1350×729 |
| [E54-deals-table](E54-deals-table.png) | Deals table alternative | 1350×729 |
| [E55-dashboard-lower](E55-dashboard-lower.png) | Dashboard lower panels and obsolete feature disclaimer | 1350×729 |
| [E56-overdue-instalments](E56-overdue-instalments.png) | Overdue instalments across renewed and ended leases | 1350×729 |
| [E57-employee-shares](E57-employee-shares.png) | Accounting employee shares | 1350×729 |
| [E58-contract-missing](E58-contract-missing.png) | Missing contract error; real contract content unavailable | 1350×729 |
| [F01-client-form](F01-client-form.png) | New client form, no save | 1350×729 |
| [F02-task-form](F02-task-form.png) | Task form, no save | 1350×729 |
| [F03-lease-form](F03-lease-form.png) | New lease without agreement form, no save | 1350×729 |
| [F04-user-form](F04-user-form.png) | User form, no submission or permission changes | 1350×729 |
| [F05-role-form](F05-role-form.png) | Role form, no permission edits | 1350×729 |
| [F06-transfer-form](F06-transfer-form.png) | Transfer dialog, no transaction | 1350×729 |
| [F07-reconciliation-form](F07-reconciliation-form.png) | Cash reconciliation form, no transaction | 1350×729 |
| [F08-expense-form](F08-expense-form.png) | Expense receipt form, no issue | 1350×729 |
| [F09-journal-form](F09-journal-form.png) | Manual journal form, no save or post | 1350×729 |
| [F10-periods](F10-periods.png) | Accounting period dialog read only | 1350×729 |
| [F11-customer-drawer](F11-customer-drawer.png) | Customer drawer, including obsolete contact-history copy | 1350×729 |
| [F12-import-dialog](F12-import-dialog.png) | Excel import entry; unnamed header Close works; Escape does not dismiss | 1350×729 |
| [F13-account-form](F13-account-form.png) | New account form, not saved | 1350×729 |
| [F14-location-form](F14-location-form.png) | New governorate form, not saved | 1350×729 |
| [F15-stage-form](F15-stage-form.png) | Deal-stage form, no transition | 1350×729 |
| [F16-commission-form](F16-commission-form.png) | Commission form, not posted | 1350×729 |
| [G01-add-menu](G01-add-menu.png) | Global Add menu | 1350×729 |
| [G02-notifications](G02-notifications.png) | Global notification menu | 1350×729 |
| [K01-filtered-sales](K01-filtered-sales.png) | Code search H-0001 returns two matching records | 1350×729 |
| [K02-global-search](K02-global-search.png) | Ctrl+K search dialog | 1350×729 |
| [P01-property-tab](P01-property-tab.png) | Property tab الموقع | 1350×729 |
| [P02-property-tab](P02-property-tab.png) | Property tab المتابعات | 1350×729 |
| [P03-property-tab](P03-property-tab.png) | Property tab الملاحظات | 1350×729 |
| [P04-property-tab](P04-property-tab.png) | Property tab السجل | 1350×729 |
| [R01-sale-listings](R01-sale-listings.png) | Report: sale-listings | 1350×729 |
| [R02-rental-listings](R02-rental-listings.png) | Report: rental-listings | 1350×729 |
| [R03-leases](R03-leases.png) | Report: leases | 1350×729 |
| [R04-customers](R04-customers.png) | Report: customers | 1350×729 |
| [R05-income-statement](R05-income-statement.png) | Report: income-statement | 1350×729 |
| [R06-balance-sheet](R06-balance-sheet.png) | Report: balance-sheet | 1350×729 |
| [R07-cash-flow](R07-cash-flow.png) | Report: cash-flow | 1350×729 |
| [R08-commissions](R08-commissions.png) | Report: commissions | 1350×729 |
| [R09-receivables](R09-receivables.png) | Report: receivables | 1350×729 |
| [R10-payables](R10-payables.png) | Report: payables | 1350×729 |
| [R11-trial-balance](R11-trial-balance.png) | Report: trial-balance | 1350×729 |
| [R12-ledger](R12-ledger.png) | Report: ledger | 1350×729 |
| [R13-ledger-selected](R13-ledger-selected.png) | Ledger with selected posting account | 1350×729 |
| [S01-setup-welcome](S01-setup-welcome.png) | Real unconfigured Electron profile, welcome | 1304×821 |
| [S02-setup-database](S02-setup-database.png) | Real setup database form; no initialization | 1304×821 |
| [S03-startup-error](S03-startup-error.png) | Native failure splash, not the renderer startup-error route | 465×300 |
| [T01-sales-loading](T01-sales-loading.png) | Controlled delayed GET, loading state | 1350×729 |
| [T02-sales-error](T02-sales-error.png) | Injected 503 on read GET, existing data retained | 1350×729 |
| [T03-sales-recovered](T03-sales-recovered.png) | Retry completed; transient snackbar may remain | 1350×729 |
| [T04-sales-empty](T04-sales-empty.png) | No search results, clear filters recovery | 1350×729 |
| [W01-context-deal](W01-context-deal.png) | Prefilled matched deal | 1350×729 |
| [W02-match-drawer](W02-match-drawer.png) | Match drawer and outdated contact-history statement | 1350×729 |
| [Z125-sale-form](Z125-sale-form.png) | 1366×768 native window at 125 percent Electron zoom | 1080×583 |
| [Z1366-sale-form](Z1366-sale-form.png) | Native Electron 1366×768 sale form | 1350×729 |
| [Z1440-dashboard](Z1440-dashboard.png) | Native Electron outer 1440×900 | 1424×861 |
| [Z1440-deals-table](Z1440-deals-table.png) | Native Electron 1440 outer window, persisted deals table view | 1424×861 |
| [Z1440-sale-form](Z1440-sale-form.png) | Native Electron outer 1440×900 | 1424×861 |
| [Z1440-template-studio](Z1440-template-studio.png) | Native Electron outer 1440×900 | 1424×861 |
| [Z1920-dashboard](Z1920-dashboard.png) | Native Electron outer 1920×1080 | 1904×1041 |
| [Z1920-deals-table](Z1920-deals-table.png) | Native Electron 1920 outer window, persisted deals table view | 1904×1041 |
| [Z1920-sale-form](Z1920-sale-form.png) | Native Electron outer 1920×1080 | 1904×1041 |
| [Z1920-template-studio](Z1920-template-studio.png) | Native Electron outer 1920×1080 | 1904×1041 |
