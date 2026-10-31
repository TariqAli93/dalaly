import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDigits } from "../../apps/renderer/src/utils/digits.js";
import { samePlot, plotIdentityKey } from "../../apps/renderer/src/utils/plotIdentity.js";
import { splitAmenityKeys } from "../../apps/renderer/src/utils/amenities.js";
import { queryString } from "../../apps/renderer/src/utils/query.js";

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
  assert.equal(section.figures.find((figure) => figure.label === "نسبة الفوز")?.kind, "percent");
  assert.equal(section.figures.find((figure) => figure.label === "متوسط مدة الإغلاق")?.value, "—");
  const staff = section.tables.find((table) => table.title === "أداء الموظفين")!;
  assert.equal(staff.rows[0].cells.name, "غير مسند");
  assert.equal(staff.rows[0].tone, "muted");
  assert.equal(staff.columns.find((column) => column.key === "usd")?.currency, "USD");
  const closed = section.tables.find((table) => table.title === "الصفقات المغلقة في المدة")!;
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
