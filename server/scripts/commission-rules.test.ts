import assert from "node:assert/strict";
import test from "node:test";
import {
  allocationError,
  outstanding,
  parseRate,
  shareAmount,
  splitAmounts,
} from "../src/modules/accounting/commissions.rules.js";

test("a commission is a fixed amount or a rate of the agreed price, half up", () => {
  assert.deepEqual(shareAmount({ basis: "percent", rate: "2.5" }, "150000000.00", "العمولة"), { amount: "3750000.00" });
  assert.deepEqual(shareAmount({ basis: "percent", rate: "1.75" }, "333333.33", "العمولة"), { amount: "5833.33" }, "5833.3333 rounds down");
  assert.deepEqual(shareAmount({ basis: "percent", rate: "50" }, "0.01", "العمولة"), { amount: "0.01" }, "0.005 rounds half up");
  assert.deepEqual(shareAmount({ basis: "fixed", amount: "2,000,000" }, null, "العمولة"), { amount: "2000000.00" });
  assert.match((shareAmount({ basis: "percent", rate: "2" }, null, "العمولة") as { error: string }).error, /لا مبلغ/);
  assert.match((shareAmount({ basis: "fixed", amount: "0" }, null, "العمولة") as { error: string }).error, /رقم موجب/);
  assert.match((shareAmount({ basis: "percent", rate: "0.0001" }, "1.00", "العمولة") as { error: string }).error, /لا تبلغ فلساً/);
});

test("a rate is above 0, at most 100, with four decimals at most", () => {
  assert.equal(parseRate("100"), "100");
  assert.equal(parseRate("0.0001"), "0.0001");
  assert.equal(parseRate("0"), null);
  assert.equal(parseRate("100.0001"), null);
  assert.equal(parseRate("2.12345"), null);
  assert.equal(parseRate("-1"), null);
  assert.equal(parseRate(null), null);
});

test("employees' shares are exact and together no more than the commission", () => {
  assert.deepEqual(
    splitAmounts("3750000.00", [
      { userId: 1, basis: "percent", rate: "40" },
      { userId: 2, basis: "fixed", amount: "500000" },
    ]),
    { amounts: ["1500000.00", "500000.00"] },
  );
  assert.deepEqual(splitAmounts("100.00", []), { amounts: [] });
  assert.match((splitAmounts("100.00", [{ userId: 1, basis: "percent", rate: "60" }, { userId: 2, basis: "percent", rate: "50" }]) as { error: string }).error, /أكبر من العمولة/);
  assert.match((splitAmounts("100.00", [{ userId: 1, basis: "fixed", amount: "1" }, { userId: 1, basis: "fixed", amount: "1" }]) as { error: string }).error, /حصة واحدة/);
  // Thirds of 100.00 round to 33.33 each and fit.
  assert.deepEqual(
    splitAmounts("100.00", [1, 2, 3].map((userId) => ({ userId, basis: "percent" as const, rate: "33.3333" }))),
    { amounts: ["33.33", "33.33", "33.33"] },
  );
});

test("an allocation takes no more than is left", () => {
  assert.equal(outstanding("3750000.00", "1000000.50"), "2749999.50");
  assert.equal(allocationError("2749999.50", "2749999.50", "العمولة CM-000001"), null);
  assert.match(allocationError("2749999.51", "2749999.50", "العمولة CM-000001")!, /أكبر من المتبقي/);
  assert.match(allocationError("1.00", "0.00", "العمولة CM-000001")!, /مسدد بالكامل/);
});
