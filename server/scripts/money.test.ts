import assert from "node:assert/strict";
import test from "node:test";
import {
  addMoney,
  compareMoney,
  fromMinor,
  moneyField,
  optionalMoneyField,
  parseMoney,
  percentOf,
  subtractMoney,
  toMinor,
} from "../src/shared/money.js";

test("amounts parse to two-decimal strings and nothing else does", () => {
  for (const [input, expected] of [
    ["1500000", "1500000.00"],
    ["1500000.5", "1500000.50"],
    [" 1,500,000.05 ", "1500000.05"],
    [0, "0.00"],
    [1234.5, "1234.50"],
    ["007", "7.00"],
    ["9999999999999999.99", "9999999999999999.99"],
  ] as const)
    assert.equal(parseMoney(input), expected, String(input));
  for (const input of ["-1", -1, "1.234", 1.234, "1e9", 1e21, "abc", "", NaN, Infinity, "10000000000000000", null, undefined, {}])
    assert.equal(parseMoney(input), null, String(input));
});

test("arithmetic is exact in minor units", () => {
  assert.equal(addMoney("0.10", "0.20"), "0.30");
  assert.equal(addMoney("9007199254740993.00", "1.00"), "9007199254740994.00", "past 2^53, still exact");
  assert.equal(subtractMoney("100.00", "250.50"), "-150.50");
  assert.equal(toMinor("1234.56"), 123456n);
  assert.equal(fromMinor(-5n), "-0.05");
  assert.equal(compareMoney("10.00", "9.99"), 1);
  assert.equal(compareMoney("10", "10.00"), 0);
});

test("balances and differences may be negative; typed amounts may not", () => {
  assert.equal(toMinor("-250.50"), -25050n);
  assert.equal(fromMinor(toMinor("-0.05")), "-0.05");
  assert.equal(compareMoney("1.00", "-500.00"), 1, "a payment against an overdrawn balance");
  assert.equal(compareMoney("-0.01", "0.00"), -1);
  assert.equal(subtractMoney("-100.00", "-250.50"), "150.50");
  assert.equal(parseMoney("-250.50"), null);
  assert.throws(() => toMinor("--1"));
  assert.throws(() => toMinor("-"));
});

test("a percentage rounds half up to the hundredth", () => {
  assert.equal(percentOf("150000000.00", "2.5"), "3750000.00");
  assert.equal(percentOf("100.00", "0.125"), "0.13");
  assert.equal(percentOf("100.00", "0.124"), "0.12");
  assert.equal(percentOf("333.33", "33.3333"), "111.11");
  assert.throws(() => percentOf("1.00", "abc"));
});

test("money fields accept numbers and strings and refuse bad amounts", () => {
  assert.equal(moneyField.parse(250000), "250000.00");
  assert.equal(moneyField.parse("250000.5"), "250000.50");
  assert.equal(moneyField.safeParse("-1").success, false);
  assert.equal(moneyField.safeParse(1.005).success, false);
  assert.equal(optionalMoneyField.parse(undefined), null);
  assert.equal(optionalMoneyField.parse(""), null);
  assert.equal(optionalMoneyField.parse(null), null);
  assert.equal(optionalMoneyField.parse("12"), "12.00");
});
