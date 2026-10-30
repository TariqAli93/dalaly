import assert from "node:assert/strict";
import test from "node:test";
import {
  addMonths,
  installmentLeft,
  installmentState,
  leaseSchedule,
  leaseState,
  leaseTermsOf,
  MAX_INSTALLMENTS,
  renewalStart,
  terminationError,
  type Installment,
} from "../src/modules/leases/leases.rules.js";

const schedule = (startDate: string, endDate: string, frequency: "monthly" | "quarterly" | "semi_annual" | "annual", rent: string) => {
  const result = leaseSchedule({ startDate, endDate, frequency, rent });
  assert.ok("installments" in result, JSON.stringify(result));
  return result.installments;
};
const brief = (rows: Installment[]) => rows.map((row) => [row.due_date, row.period_end, row.amount]);

test("months are counted from the start date and clamp at a month's end", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonths("2026-11-15", 3), "2027-02-15");
});

test("a year of monthly rent is twelve installments, due in advance", () => {
  const rows = schedule("2026-01-01", "2026-12-31", "monthly", "750000");
  assert.equal(rows.length, 12);
  assert.deepEqual(brief(rows).slice(0, 2), [["2026-01-01", "2026-01-31", "750000.00"], ["2026-02-01", "2026-02-28", "750000.00"]]);
  assert.deepEqual(rows.at(-1), { seq: 12, due_date: "2026-12-01", period_start: "2026-12-01", period_end: "2026-12-31", amount: "750000.00", full: true });
  // "From 1/1/2026 to 1/1/2027" is the same year, not a year and a day.
  assert.equal(schedule("2026-01-01", "2027-01-01", "monthly", "750000").length, 12);
  // From the 31st: periods end the day before the next month's 31st (or its
  // last day), and 30 April is the third month's anniversary.
  assert.deepEqual(brief(schedule("2026-01-31", "2026-04-30", "monthly", "100")), [
    ["2026-01-31", "2026-02-27", "100.00"],
    ["2026-02-28", "2026-03-30", "100.00"],
    ["2026-03-31", "2026-04-29", "100.00"],
  ]);
  // One more day is a cut fourth period: 2 of May's 31 days → 6.45.
  assert.deepEqual(brief(schedule("2026-01-31", "2026-05-01", "monthly", "100")).at(-1), ["2026-04-30", "2026-05-01", "6.45"]);
});

test("a period the end date cuts short pays its days' share, half up", () => {
  // 15 of June's 30 days of 1,000,000: exactly half.
  const rows = schedule("2026-01-01", "2026-06-15", "monthly", "1000000");
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.at(-1), { seq: 6, due_date: "2026-06-01", period_start: "2026-06-01", period_end: "2026-06-15", amount: "500000.00", full: false });
  // 10 of 31 days of 100.00 = 32.258… → 32.26.
  assert.equal(schedule("2026-01-01", "2026-01-10", "monthly", "100").at(0)!.amount, "32.26");
  // A rent too small for one day's share leaves nothing due for it.
  assert.equal(schedule("2026-01-01", "2026-02-01", "monthly", "0.01").length, 1);
});

test("quarterly, half-yearly and yearly periods", () => {
  assert.deepEqual(brief(schedule("2026-03-01", "2027-02-28", "quarterly", "2100000")), [
    ["2026-03-01", "2026-05-31", "2100000.00"],
    ["2026-06-01", "2026-08-31", "2100000.00"],
    ["2026-09-01", "2026-11-30", "2100000.00"],
    ["2026-12-01", "2027-02-28", "2100000.00"],
  ]);
  assert.equal(schedule("2026-01-01", "2027-12-31", "semi_annual", "4500").length, 4);
  assert.deepEqual(brief(schedule("2026-05-10", "2029-05-09", "annual", "12000.50")), [
    ["2026-05-10", "2027-05-09", "12000.50"],
    ["2027-05-10", "2028-05-09", "12000.50"],
    ["2028-05-10", "2029-05-09", "12000.50"],
  ]);
});

test("dates, rent and length are checked", () => {
  const error = (startDate: string, endDate: string, rent = "100") =>
    (leaseSchedule({ startDate, endDate, frequency: "monthly", rent }) as { error: string }).error;
  assert.match(error("2026-01-01", "2026-01-01"), /بعد تاريخ بدئه/);
  assert.match(error("2026-02-30", "2026-04-01"), /YYYY-MM-DD/);
  assert.match(error("2026-01-01", "2026-12-31", "0"), /مبلغ موجب/);
  assert.match(error("2026-01-01", "2026-12-31", "1.234"), /مبلغ موجب/);
  assert.equal(schedule("2026-01-01", "2055-12-31", "monthly", "1").length, MAX_INSTALLMENTS);
  assert.match(error("2026-01-01", "2056-01-31"), /360 قسطاً/);
});

test("an issued rent contract's terms become the lease's", () => {
  const terms = { currency: "IQD" as const, rent_amount: 750000, rent_period: "monthly", start_date: "2026-11-01", end_date: "2027-10-31", deposit: 750000 };
  assert.deepEqual(leaseTermsOf(terms), { currency: "IQD", rent: "750000.00", frequency: "monthly", startDate: "2026-11-01", endDate: "2027-10-31", deposit: "750000.00" });
  assert.equal((leaseTermsOf({ ...terms, deposit: 0 }) as { deposit: null }).deposit, null);
  assert.equal((leaseTermsOf({ ...terms, rent_amount: 1250.5, currency: "USD" }) as { rent: string }).rent, "1250.50");
  assert.match((leaseTermsOf({ ...terms, rent_amount: null }) as { error: string }).error, /بلا بدل إيجار/);
  assert.match((leaseTermsOf({ ...terms, end_date: null }) as { error: string }).error, /بلا تاريخ/);
  assert.match((leaseTermsOf({ ...terms, rent_period: "weekly" }) as { error: string }).error, /غير معروفة/);
});

test("a lease is upcoming, current or ended by its dates; cancelled stays cancelled", () => {
  const lease = { status: "active", startDate: "2026-11-01", endDate: "2027-10-31" };
  assert.equal(leaseState(lease, "2026-10-31"), "upcoming");
  assert.equal(leaseState(lease, "2026-11-01"), "current");
  assert.equal(leaseState(lease, "2027-10-31"), "current");
  assert.equal(leaseState(lease, "2027-11-01"), "ended");
  assert.equal(leaseState({ ...lease, status: "cancelled" }, "2026-12-01"), "cancelled");
  assert.equal(leaseState({ ...lease, status: "terminated" }, "2026-12-01"), "terminated");
  assert.equal(leaseState({ ...lease, status: "renewed" }, "2026-12-01"), "renewed");
});

test("an installment is paid, upcoming, due or overdue; one after a termination is released", () => {
  const row = (patch: Partial<Parameters<typeof installmentState>[0]> = {}) =>
    installmentState({ dueDate: "2026-11-01", amount: "750000.00", paid: "0.00", officeCollects: true, terminationDate: null, ...patch }, "2026-11-10");
  assert.equal(row(), "overdue");
  assert.equal(row({ paid: "300000.00" }), "overdue", "partly paid and past its day");
  assert.equal(row({ paid: "750000.00" }), "paid");
  assert.equal(row({ dueDate: "2026-11-10" }), "due");
  assert.equal(row({ dueDate: "2026-12-01" }), "upcoming");
  assert.equal(row({ dueDate: "2026-12-01", paid: "750000.00" }), "paid", "paid in advance");
  assert.equal(row({ terminationDate: "2026-10-31" }), "released");
  assert.equal(row({ terminationDate: "2026-11-01" }), "overdue", "due on the last day: still owed");
  // Where the tenant pays the landlord directly, the office tracks no payments.
  assert.equal(row({ officeCollects: false }), "due");
  assert.equal(row({ officeCollects: false, paid: "750000.00" }), "due");
  assert.equal(installmentLeft("750000.00", "300000.00"), "450000.00");
  assert.equal(installmentLeft("750000.00", "800000.00"), "0.00");
});

test("a lease in force ends early inside its term, unless rent after that day was paid", () => {
  const lease = { status: "active", startDate: "2026-01-01", endDate: "2026-12-31" };
  assert.equal(terminationError(lease, "2026-06-30", 0), null);
  assert.equal(terminationError(lease, "2026-01-01", 0), null);
  assert.match(terminationError(lease, "2026-12-31", 0)!, /قبل آخر يوم/);
  assert.match(terminationError(lease, "2025-12-31", 0)!, /بين بدء الإيجار/);
  assert.match(terminationError(lease, "2026-06-30", 1)!, /قُبض قسط يُستحق بعد تاريخ الإنهاء/);
  assert.match(terminationError({ ...lease, status: "renewed" }, "2026-06-30", 0)!, /الإيجار الساري فقط/);
  assert.match(terminationError(lease, "30/06/2026", 0)!, /YYYY-MM-DD/);
  assert.equal(renewalStart("2026-12-31"), "2027-01-01");
  assert.equal(renewalStart("2028-02-28"), "2028-02-29");
});
