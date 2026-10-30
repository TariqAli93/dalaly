import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDigits } from "../../apps/renderer/src/utils/digits.js";
import { samePlot, plotIdentityKey } from "../../apps/renderer/src/utils/plotIdentity.js";
import { splitAmenityKeys } from "../../apps/renderer/src/utils/amenities.js";

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
