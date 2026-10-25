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
