import assert from "node:assert/strict";
import test from "node:test";
import {
  ageReceivable,
  daysBetween,
  monthsBetween,
  officeToday,
  reportPeriod,
  sumOf,
} from "../src/modules/reports/reports.rules.js";

test("a report's period defaults to the year to date, ending on the office's today", () => {
  assert.deepEqual(reportPeriod({}, "2026-10-31"), { from: "2026-01-01", to: "2026-10-31" });
  assert.deepEqual(reportPeriod({ to: "2025-03-15" }, "2026-10-31"), { from: "2025-01-01", to: "2025-03-15" });
  assert.deepEqual(reportPeriod({ from: "2026-07-01" }, "2026-10-31"), { from: "2026-07-01", to: "2026-10-31" });
  // 21:30 UTC on the 31st is already the 1st in Baghdad (UTC+3).
  assert.equal(officeToday(new Date("2026-10-31T21:30:00Z")), "2026-11-01");
  assert.equal(officeToday(new Date("2026-10-31T20:59:00Z")), "2026-10-31");
});

test("months of a period and days between dates", () => {
  assert.deepEqual(monthsBetween("2026-11-15", "2027-02-01"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthsBetween("2026-10-01", "2026-10-31"), ["2026-10"]);
  assert.equal(daysBetween("2026-10-01", "2026-10-31"), 30);
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
});

test("receivables are aged oldest charge first, and the buckets add up to the balance", () => {
  const asOf = "2026-10-31";
  // Three charges; a payment settles the oldest and part of the next.
  const aged = ageReceivable(
    [
      { date: "2026-06-01", debit: "1000000.00", credit: "0.00" },
      { date: "2026-08-20", debit: "500000.00", credit: "0.00" },
      { date: "2026-09-10", debit: "0.00", credit: "1200000.00" },
      { date: "2026-10-15", debit: "250000.50", credit: "0.00" },
    ],
    asOf,
  );
  assert.deepEqual(aged, {
    current: "250000.50",
    days_31_60: "0.00",
    days_61_90: "300000.00",
    over_90: "0.00",
    total: "550000.50",
  });
  // Ages at the bucket edges: 30 days is current, 31 is the next bucket.
  const edge = ageReceivable(
    [
      { date: "2026-10-01", debit: "1.00", credit: "0.00" },
      { date: "2026-09-30", debit: "2.00", credit: "0.00" },
      { date: "2026-08-02", debit: "4.00", credit: "0.00" },
      { date: "2026-07-01", debit: "8.00", credit: "0.00" },
    ],
    asOf,
  );
  assert.equal(edge.current, "1.00");
  assert.equal(edge.days_31_60, "2.00");
  assert.equal(edge.days_61_90, "4.00");
  assert.equal(edge.over_90, "8.00");
  // An overpayment stays as a credit in "current".
  const over = ageReceivable(
    [
      { date: "2026-01-01", debit: "100.00", credit: "0.00" },
      { date: "2026-02-01", debit: "0.00", credit: "150.00" },
    ],
    asOf,
  );
  assert.equal(over.current, "-50.00");
  assert.equal(over.over_90, "0.00");
  assert.equal(over.total, "-50.00");
  // A credit before any charge (a reversal posted first) still nets out.
  const early = ageReceivable(
    [
      { date: "2026-10-01", debit: "0.00", credit: "40.00" },
      { date: "2026-10-02", debit: "100.00", credit: "0.00" },
    ],
    asOf,
  );
  assert.equal(early.total, "60.00");
  assert.equal(early.current, "60.00");
});

test("sums are exact", () => {
  assert.equal(sumOf(["0.10", "0.20"]), "0.30");
  assert.equal(sumOf(["9999999999999999.99", "-9999999999999999.99", "0.01"]), "0.01");
  assert.equal(sumOf([]), "0.00");
});
