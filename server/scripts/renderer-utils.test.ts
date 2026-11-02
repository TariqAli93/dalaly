import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDigits } from "../../apps/renderer/src/utils/digits.js";
import { samePlot, plotIdentityKey } from "../../apps/renderer/src/utils/plotIdentity.js";
import { splitAmenityKeys } from "../../apps/renderer/src/utils/amenities.js";
import { escapeHtml } from "../../apps/renderer/src/utils/html.js";
import { isZeroAmount } from "../../apps/renderer/src/utils/money.js";
import { queryString } from "../../apps/renderer/src/utils/query.js";
import { intentStatus, newTaskIntent } from "../../apps/renderer/src/utils/taskIntent.js";
import { initialStatus } from "../src/modules/tasks/tasks.schema.js";

test("an amount is zero only when the API sends zero", () => {
  for (const value of ["0", "0.00", "-0.00", "0.0"]) assert.ok(isZeroAmount(value), value);
  for (const value of ["0.01", "-0.50", "10.00", "", "00.00"]) assert.ok(!isZeroAmount(value), value);
});

test("a new task is open until done, dated or not; a logged event is done", () => {
  // UX-04: «مهمة لزبون» without a date used to be saved as already done.
  assert.equal(intentStatus(newTaskIntent(null, "task", "")), "open");
  assert.equal(intentStatus(newTaskIntent(null, "task", "2026-11-03T10:00")), "open");
  assert.equal(intentStatus(newTaskIntent(null, "log", "2026-11-03T10:00")), "done");
  // The user's choice wins over the caller's and over the date.
  assert.equal(newTaskIntent("log", "task", ""), "log");
  assert.equal(newTaskIntent("task", undefined, ""), "task");
  // Without a choice or a caller intent, the server's rule for a row sent without a status.
  for (const date of ["", "2026-11-03T10:00"]) {
    const scheduled_at = date ? new Date(date).toISOString() : null;
    assert.equal(intentStatus(newTaskIntent(null, undefined, date)), initialStatus({ scheduled_at }), date || "no date");
  }
});

test("printed HTML escapes markup and quotes", () => {
  assert.equal(escapeHtml(`<b>"علي" & 'سارة'</b>`), "&lt;b&gt;&quot;علي&quot; &amp; &#39;سارة&#39;&lt;/b&gt;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("query strings keep the set filters, encoded, and drop empty ones", () => {
  assert.equal(queryString({}), "");
  assert.equal(queryString({ q: "", status: undefined, person_id: null }), "");
  assert.equal(
    queryString({ q: "بيت كبير", page: 2, page_size: 25, archived: false, skip: "" }),
    `?q=${encodeURIComponent("بيت كبير").replaceAll("%20", "+")}&page=2&page_size=25&archived=false`,
  );
  assert.equal(queryString({ from: "2026-10-01", amount: 0 }), "?from=2026-10-01&amount=0");
});

test("Arabic-Indic and Persian digits become Latin, with Arabic separators", () => {
  assert.equal(normalizeDigits("٠٧٧٠١٢٣٤٥٦٧"), "07701234567");
  assert.equal(normalizeDigits("۲۵۰"), "250");
  assert.equal(normalizeDigits("٢٥٠٬٠٠٠"), "250,000");
  assert.equal(normalizeDigits("١٢٫٥"), "12.5");
  assert.equal(normalizeDigits("قطعة 88 أ"), "قطعة 88 أ");
});

test("plot identity follows the server key: location names, number and letter", () => {
  const base = { governorate: "بغداد", district: "الكرادة", neighborhood: "حي 1", plotNumber: "88", plotLetter: "أ" };
  assert.ok(samePlot(base, { ...base, district: " الكرادة ", plotNumber: "88 " }));
  assert.ok(samePlot(base, { ...base, neighborhood: "حي  1" }));
  assert.ok(!samePlot(base, { ...base, plotLetter: "ب" }));
  assert.ok(!samePlot(base, { ...base, district: "المنصور" }));
  // بلا رقم قطعة لا هوية، فلا تكرار.
  assert.equal(plotIdentityKey({ ...base, plotNumber: "  " }), null);
  assert.ok(!samePlot({ ...base, plotNumber: "" }, { ...base, plotNumber: "" }));
});

test("request amenities map stored Arabic names to listing keys and keep the rest", () => {
  assert.deepEqual(splitAmenityKeys({ مصعد: true, parking: true, "مطبخ أمريكي": true, pool: false }), {
    known: ["elevator", "parking"],
    other: ["مطبخ أمريكي"],
  });
  assert.deepEqual(splitAmenityKeys(null), { known: [], other: [] });
});

test("exact amounts are grouped without passing through a number", async () => {
  const { formatAmount } = await import("../../apps/renderer/src/utils/format.js");
  assert.equal(formatAmount("145000000.50"), "145,000,000.50 د.ع");
  assert.equal(formatAmount("150000000.00"), "150,000,000 د.ع");
  assert.equal(formatAmount("9007199254740993.00"), "9,007,199,254,740,993 د.ع", "past 2^53");
  assert.equal(formatAmount("1200.00", "USD"), "1,200.00 $");
  assert.equal(formatAmount("-150.5"), "-150.50 د.ع");
  assert.equal(formatAmount(null), "—");
});

test("the journal editor sums amounts exactly", async () => {
  const { amountToMinor, minorToAmount, sumAmounts } = await import("../../apps/renderer/src/utils/money.js");
  assert.equal(amountToMinor("1,500.5"), 150050n);
  assert.equal(amountToMinor(""), 0n);
  assert.equal(amountToMinor(null), 0n);
  assert.equal(amountToMinor("1.234"), null, "three decimals is not an amount");
  assert.equal(amountToMinor("-5"), null);
  assert.equal(sumAmounts(["0.10", "0.20"]), amountToMinor("0.30"), "where 0.1 + 0.2 is not 0.3");
  assert.equal(minorToAmount(sumAmounts(["9007199254740993.00", "0.01"])!), "9007199254740993.01", "past 2^53");
  assert.equal(minorToAmount(-150n), "-1.50");
  assert.equal(sumAmounts(["1", "x"]), null);
});

test("the commission preview rounds a percentage as the server does", async () => {
  const { minorToAmount, percentOfAmount } = await import("../../apps/renderer/src/utils/money.js");
  const { percentOf } = await import("../src/shared/money.js");
  for (const [amount, rate] of [["150000000.00", "2.5"], ["333333.33", "1.75"], ["0.01", "50"], ["9007199254740993.00", "0.0001"]])
    assert.equal(minorToAmount(percentOfAmount(amount, rate)!), percentOf(amount, rate), `${rate}% of ${amount}`);
  assert.equal(percentOfAmount("100", "abc"), null);
  assert.equal(percentOfAmount("x", "2"), null);
});

test("balances keep their sign as exact hundredths", async () => {
  const { signedAmountToMinor } = await import("../../apps/renderer/src/utils/money.js");
  assert.equal(signedAmountToMinor("-1250.50"), -125050n);
  assert.equal(signedAmountToMinor("300.00"), 30000n);
  assert.equal(signedAmountToMinor("-0.01"), -1n);
  assert.equal(signedAmountToMinor("--1"), null);
});

test("financial reports map to tables, with links only the viewer may open", async () => {
  const { trialBalanceDocument, commissionsDocument, monthLabel } = await import("../../apps/renderer/src/utils/financialReports.js");
  const links = (allowed: string[]) => ({
    can: (permission: string) => allowed.includes(permission),
    ledger: (id: number, range: { from?: string; to: string }) => `/ledger/${id}?${range.from ?? ""}..${range.to}`,
  });
  const account = { account_id: 3, code: "1101", name: "الصندوق", account_type: "asset", heading: "cash", heading_name: "الصندوق" };
  const tb = trialBalanceDocument(
    {
      from: "2026-01-01",
      to: "2026-10-31",
      sections: [
        {
          currency: "IQD",
          rows: [{ ...account, opening: "0.00", debit: "500.00", credit: "200.00", closing_debit: "300.00", closing_credit: "0.00" }],
          totals: { opening: "0.00", debit: "500.00", credit: "500.00", closing_debit: "300.00", closing_credit: "300.00" },
          balanced: false,
        },
      ],
    },
    links([]),
  );
  const [section] = tb.sections;
  assert.match(section.warning ?? "", /لا يساوي/);
  assert.equal(section.tables[0].rows[0].links?.name, "/ledger/3?2026-01-01..2026-10-31", "an account opens its ledger in the reports");
  assert.equal(section.tables[0].total?.debit, "500.00");

  const commission = {
    from: "2026-01-01",
    to: "2026-10-31",
    user_id: null,
    truncated: false,
    sections: [
      {
        currency: "IQD" as const,
        rows: [
          { id: 7, code: "CM-000007", commission_date: "2026-09-14", currency: "IQD" as const, status: "active", payer_role: "owner", payer_person_id: 4, payer_name: "أحمد", deal_id: 9, deal_code: "D-0009", deal_type: "rent", amount: "100.00", collected: "40.00", outstanding: "60.00", shares: "10.00", shares_paid: "0.00" },
          { id: 8, code: "CM-000008", commission_date: "2026-09-15", currency: "IQD" as const, status: "cancelled", payer_role: "client", payer_person_id: null, payer_name: null, deal_id: 9, deal_code: "D-0009", deal_type: "rent", amount: "50.00", collected: "0.00", outstanding: "0.00", shares: "0.00", shares_paid: "0.00" },
        ],
        totals: { count: 1, recorded: "100.00", collected: "40.00", outstanding: "60.00", shares: "10.00", shares_paid: "0.00", shares_owed: "10.00", office_net: "90.00", cancelled_count: 1, cancelled_amount: "50.00" },
        by_deal_type: [],
        employees: [],
      },
    ],
  };
  const everything = commissionsDocument(commission, links(["commissions.read", "deals.read", "people.read"]));
  const [first, cancelled] = everything.sections[0].tables[0].rows;
  assert.deepEqual(first.links, { code: "/accounting/commissions/7", deal: "/deals/9", payer: "/clients/4" });
  assert.equal(first.cells.payer, "المؤجر: أحمد");
  assert.equal(cancelled.tone, "muted");
  assert.match(String(cancelled.cells.code), /ملغاة/);
  assert.ok(everything.sections[0].figures.some((figure) => figure.label === "ملغاة (1)"));
  const nothing = commissionsDocument(commission, links([]));
  assert.equal(nothing.sections[0].tables[0].rows[0].links, undefined, "no links without the permissions");
  assert.equal(monthLabel("2026-10"), "تشرين الأول 2026");
});

test("operational reports map to tables, request columns only with the requests", async () => {
  const { dealsDocument, listingsDocument } = await import("../../apps/renderer/src/utils/operationsReports.js");
  const deals = {
    from: "2026-01-01",
    to: "2026-10-31",
    user_id: null,
    deal_type: null,
    totals: { created: 4, won: 1, lost: 1, cancelled: 0, open_now: 2, win_rate: 50, cohort_won: 1, cohort_conversion: 25, cycle_days_average: null, cycle_days_median: null },
    stages: [],
    pipeline: [],
    lost_reasons: [],
    employees: [{ user_id: null, display_name: null, open_now: 1, created: 1, won: 0, lost: 0, win_rate: null, cycle_days: null, commission_iqd: "7500000.00", commission_usd: "0.00" }],
    commissions: [],
    closed: [{ id: 4, code: "D-0004", deal_type: "sale", stage: "won", currency: "USD" as const, agreed_price: "180000.00", lost_reason: null, client_person_id: 2, client_name: "سارة", user_name: null, created_on: "2026-10-01", closed_on: "2026-10-31", cycle_days: 30 }],
    closed_truncated: false,
  };
  const document = dealsDocument(deals, { can: (key: string) => key === "deals.read" });
  const [section] = document.sections;
  assert.equal(section.figures.find((figure) => figure.label === "نسبة الإتمام")?.kind, "percent");
  assert.equal(section.figures.find((figure) => figure.label === "متوسط مدة الإتمام")?.value, "—");
  const staff = section.tables.find((table) => table.title === "أداء الموظفين")!;
  assert.equal(staff.rows[0].cells.name, "بلا موظف مسؤول");
  assert.equal(staff.rows[0].tone, "muted");
  assert.equal(staff.columns.find((column) => column.key === "usd")?.currency, "USD");
  const closed = section.tables.find((table) => table.title === "الصفقات المغلقة خلال الفترة")!;
  assert.deepEqual(closed.rows[0].links, { code: "/deals/4" }, "no customer link without people.read");
  assert.equal(closed.rows[0].currency, "USD");

  const listings = {
    kind: "rental" as const,
    from: "2026-01-01",
    to: "2026-10-31",
    statuses: [{ status: "available", listings: 1 }],
    totals: { available: 1, closed: 0, stale: 0, age_median: 3, open_requests: null, unmatched_requests: null },
    age: [{ bucket: "days_0_30", listings: 1 }],
    closed: [],
    types: [{ property_type: "apartment", available: 1, requests: null }],
    price_bands: [{ from: 1000000, to: 1500000, available: 1, requests: null }, { from: 3000000, to: null, available: 0, requests: null }],
    demand: null,
    unmatched: null,
  };
  const rental = listingsDocument(listings, { can: () => true }).sections[0];
  assert.ok(!rental.tables.some((table) => table.title === "الطلب حسب المنطقة"), "no demand without requests.read");
  const types = rental.tables.find((table) => table.title === "المعروض والمطلوب حسب النوع")!;
  assert.deepEqual(types.columns.map((column) => column.key), ["type", "available"]);
  assert.equal(types.rows[0].cells.type, "شقة", "rental types read in Arabic");
  const bands = rental.tables.find((table) => table.title.includes("الإيجار الشهري"))!;
  assert.deepEqual(bands.rows.map((row) => row.cells.band), ["1,000,000 – 1,500,000 شهرياً", "3,000,000 فأكثر شهرياً"]);
  assert.ok(!rental.figures.some((figure) => figure.label === "طلبات مفتوحة"));
});

test("the attention queue orders by tier then date, once per record, with the right action", async () => {
  const { attentionItems, attentionTotals } = await import("../../apps/renderer/src/utils/attentionQueue.js");
  const task = (id: number, scheduled_at: string, extra: object = {}) => ({
    source: "sale_followup", id, type: "visit", notes: null, scheduled_at, status: "open", priority: "normal",
    overdue: true, person_id: null, person_name: null, property_id: 7, rental_id: null, listing_code: "H-0007",
    listing_name: "بيت", request_code: null, ...extra,
  });
  const business = {
    tasks: {
      overdue: { total: 9, items: [task(2, "2026-10-28T09:00:00Z"), task(1, "2026-10-20T09:00:00Z", { person_id: 4, person_name: "سارة" })] },
      today: { total: 1, items: [task(3, "2026-11-02T10:00:00Z", { overdue: false })] },
      week: { total: 2, items: [] },
    },
    leases: {
      expiring_days: 30,
      expiring: { total: 1, items: [{ id: 5, code: "LS-5", end_date: "2026-11-20", days_left: 18, tenant_name: "علي" }] },
      overdue: { total: 8, by_currency: [], items: [{ id: 11, seq: 1, due_date: "2026-10-01", left: "350000.00", days_overdue: 32, lease_id: 5, lease_code: "LS-5", currency: "IQD", tenant_name: "علي" }] },
    },
    customers: { contact_days: 30, needing_contact: { total: 2, rows: [
      { person_id: 4, person_name: "سارة", phone: "0780", open_requests: 1, open_deals: 0, last_contact: null },
      { person_id: 6, person_name: "محمد", phone: null, open_requests: 0, open_deals: 1, last_contact: "2026-09-01T00:00:00Z" },
    ] } },
    deals: { stalled_days: 14, stalled: { total: 1, items: [{ id: 3, code: "D-3", title: null, client_name: "كاظم", stage: "negotiating", stage_changed_at: "2026-10-01T00:00:00Z" }] } },
  };
  const overview = {
    appointments: { today: 1, items: [] },
    // Listing follow-up 2 is also an overdue task: one line, as the task.
    viewings_without_outcome: { total: 2, days: 30, items: [
      { id: 2, kind: "sale", listing_id: 7, listing_code: "H-0007", listing_name: "بيت", type: "visit", scheduled_at: "2026-10-28T09:00:00Z" },
      { id: 9, kind: "rental", listing_id: 8, listing_code: "R-0008", listing_name: "شقة", type: "visit", scheduled_at: "2026-10-30T09:00:00Z" },
    ] },
  };
  const matching = { customers: { total: 2, items: [
    { person_id: 4, person_name: "سارة", person_phone: "0780", total_matches: 2, last_request_update_at: "2026-10-31" },
    { person_id: 12, person_name: "زبون مطابق", person_phone: null, total_matches: 1, last_request_update_at: "2026-10-30" },
  ] } };
  const commissions = [{ id: 1, code: "CM-1", payer_name: "أحمد", deal_code: "D-1", commission_date: "2026-06-20", outstanding: "2500000.00", currency: "IQD" }];
  const all = new Set(["people.read", "vouchers.receipt"]);
  const permissions = { can: (p: string) => all.has(p), canFollowup: () => true };
  const sources = { business, overview, matching, commissions } as never;
  const items = attentionItems(sources, permissions);

  assert.deepEqual(
    items.map((item) => item.key),
    [
      "installment:11", "task:sale_followup:1", "task:sale_followup:2", // overdue, oldest first
      "task:sale_followup:3", // today
      "commission:1", // to collect
      "person:4", "person:6", "person:12", // never contacted, then the longest silence
      "deal:3", "task:rental_followup:9", "lease:5", // follow-up, by date
    ],
  );
  const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
  assert.equal(byKey["installment:11"].action.type, "collect-installment");
  assert.equal(byKey["commission:1"].action.type, "collect-commission");
  assert.equal(byKey["task:sale_followup:1"].link, "/clients/4");
  assert.equal(byKey["task:sale_followup:2"].link, "/properties/7");
  // Sara waits on a call and has matches: one line, both reasons, the options drawer.
  assert.equal(byKey["person:4"].action.type, "customer");
  assert.match(byKey["person:4"].reason, /عروض مطابقة/);
  assert.match(byKey["person:4"].reason, /لم يُتواصل معه/);
  assert.equal(byKey["task:rental_followup:9"].action.type, "viewing");

  // Without receipts the money rows open their records instead.
  const readOnly = attentionItems(sources, { can: (p: string) => p === "people.read", canFollowup: () => false });
  const ro = Object.fromEntries(readOnly.map((item) => [item.key, item]));
  assert.deepEqual(ro["installment:11"].action, { type: "route", to: "/leases/5" });
  assert.deepEqual(ro["commission:1"].action, { type: "route", to: "/accounting/commissions/1" });
  assert.deepEqual(ro["task:rental_followup:9"].action, { type: "route", to: "/rentals/8" });

  // Tier counts are the server's totals, not the five loaded rows.
  assert.deepEqual(attentionTotals({ ...(sources as object), commissionTotal: 2 } as never), {
    overdue: 17, today: 1, collect: 2, contact: 3, followup: 4,
  });
  // A failed business summary leaves today's appointments from the overview.
  const now = new Date();
  const appointment = { id: 40, kind: "sale", listing_id: 7, listing_code: "H-0007", listing_name: "بيت", type: "phone_call", scheduled_at: now.toISOString() };
  const degraded = attentionItems({ business: null, overview: { appointments: { today: 1, items: [appointment] } }, matching: null, commissions: null } as never, permissions);
  assert.deepEqual(degraded.map((item) => [item.key, item.tier]), [["task:sale_followup:40", "today"]]);
});

test("an optional form section opens for data, an error, the user or edit mode, never hiding a value", async () => {
  const { hasValue, useFormSections } = await import("../../apps/renderer/src/composables/useFormSections.js");
  for (const value of ["x", 0, 3, ["a"], { wifi: true }]) assert.ok(hasValue(value), JSON.stringify(value));
  for (const value of ["", "  ", null, undefined, false, [], {}, { wifi: false }]) assert.ok(!hasValue(value), JSON.stringify(value));

  // Plain holders, not Vue refs: the server package does not depend on vue
  // (the composable resolves it from the renderer).
  const model = { value: { plot_number: "", notes: "", amenities: {} as Record<string, boolean> } };
  const errors = { value: {} as Record<string, string[]> };
  const sections = useFormSections(model as never, { parcel: ["plot_number"], notes: ["notes", "amenities"] }, () => errors.value);
  // A new, empty form starts with the optional sections closed.
  assert.equal(sections.isOpen("parcel"), false);
  assert.equal(sections.summary("parcel"), "اختياري");
  // A record that has a value shows it (editing, a restored draft).
  model.value.amenities = { wifi: true };
  assert.equal(sections.isOpen("notes"), true);
  assert.equal(sections.summary("notes"), "فيه بيانات");
  // The user's choice wins over the data…
  sections.setOpen("notes", false);
  assert.equal(sections.isOpen("notes"), false);
  // …but never over an error from the server on one of its fields.
  errors.value = { notes: ["طويل جداً"] };
  assert.equal(sections.isOpen("notes"), true);
  // Edit mode can open a section with defaults only (the request's status).
  assert.equal(sections.isOpen("parcel", true), true);
  sections.setOpen("parcel", false);
  assert.equal(sections.isOpen("parcel", true), false);
  // Closing keeps the value: the fields stay mounted and in the model.
  model.value.plot_number = "88";
  assert.equal(model.value.plot_number, "88");
});

test("date and time fields read any digits and separators and store the native input formats", async () => {
  const { parseDateInput, formatDateInput, withinBounds } = await import("../../apps/renderer/src/utils/dateInput.js");
  // Day first, as written in Iraq; a four-digit first part is a year.
  for (const text of ["2/11/2026", "02-11-2026", "٢/١١/٢٠٢٦", "2.11.26", "2026-11-02", "2026/11/2", " 2 / 11 / 2026 "])
    assert.equal(parseDateInput(text, "date"), "2026-11-02", text);
  for (const text of ["31/2/2026", "29/2/2025", "2/13/2026", "2/11", "x/11/2026", "0/1/2026"])
    assert.equal(parseDateInput(text, "date"), null, text);
  assert.equal(parseDateInput("29/2/2024", "date"), "2024-02-29");
  assert.equal(parseDateInput("", "date"), "");
  assert.equal(formatDateInput("2026-11-02", "date"), "02/11/2026");
  assert.equal(formatDateInput(null, "date"), "");
  // Times: 24 hours, with or without a separator, Arabic-Indic digits too.
  for (const [text, value] of [["9:30", "09:30"], ["0930", "09:30"], ["٢٣:٠٥", "23:05"], ["930", "09:30"]] as const)
    assert.equal(parseDateInput(text, "time"), value, text);
  for (const text of ["24:00", "9:7", "9", "12:60"]) assert.equal(parseDateInput(text, "time"), null, text);
  assert.equal(formatDateInput("09:30:00", "time"), "09:30");
  // Months.
  assert.equal(parseDateInput("11/2026", "month"), "2026-11");
  assert.equal(parseDateInput("2026-1", "month"), "2026-01");
  assert.equal(parseDateInput("13/2026", "month"), null);
  assert.equal(formatDateInput("2026-11", "month"), "11/2026");
  // Bounds compare the stored ISO text.
  assert.ok(withinBounds("2026-11-02", "2026-11-01", "2026-11-30"));
  assert.ok(!withinBounds("2026-12-01", undefined, "2026-11-30"));
});
