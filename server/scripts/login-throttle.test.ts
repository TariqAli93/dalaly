import assert from "node:assert/strict";
import { test } from "node:test";
import { LoginThrottle, lockedOutMessage } from "../src/modules/auth/login-throttle.js";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

test("four wrong PINs do not lock; the fifth locks for 30 seconds", () => {
  const time = clock();
  const throttle = new LoginThrottle(time.now);
  for (let i = 0; i < 4; i += 1) throttle.recordFailure("login:admin");
  assert.equal(throttle.retryAfterMs("login:admin"), 0);
  throttle.recordFailure("login:admin");
  assert.equal(throttle.retryAfterMs("login:admin"), 30_000);
  time.advance(30_000);
  assert.equal(throttle.retryAfterMs("login:admin"), 0);
});

test("repeated lockouts double and are capped at 15 minutes", () => {
  const time = clock();
  const throttle = new LoginThrottle(time.now);
  const lockouts: number[] = [];
  for (let round = 0; round < 7; round += 1) {
    for (let i = 0; i < 5; i += 1) throttle.recordFailure("login:admin");
    const wait = throttle.retryAfterMs("login:admin");
    lockouts.push(wait);
    time.advance(wait);
  }
  assert.deepEqual(lockouts, [30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000]);
});

test("a successful login clears the account and other accounts are unaffected", () => {
  const throttle = new LoginThrottle(clock().now);
  for (let i = 0; i < 5; i += 1) throttle.recordFailure("login:admin");
  assert.ok(throttle.retryAfterMs("login:admin") > 0);
  assert.equal(throttle.retryAfterMs("login:clerk"), 0);
  throttle.recordSuccess("login:admin");
  assert.equal(throttle.retryAfterMs("login:admin"), 0);
});

test("failures older than the window are forgotten", () => {
  const time = clock();
  const throttle = new LoginThrottle(time.now);
  for (let i = 0; i < 4; i += 1) throttle.recordFailure("login:admin");
  time.advance(15 * 60_000 + 1);
  throttle.recordFailure("login:admin");
  assert.equal(throttle.retryAfterMs("login:admin"), 0);
});

test("a flood of usernames cannot evict an active lockout", () => {
  const throttle = new LoginThrottle(clock().now);
  for (let i = 0; i < 5; i += 1) throttle.recordFailure("login:admin");
  for (let i = 0; i < 5_000; i += 1) throttle.recordFailure(`login:spray-${i}`);
  assert.ok(throttle.retryAfterMs("login:admin") > 0);
});

test("lockout messages are Arabic and round up", () => {
  assert.match(lockedOutMessage(29_100), /30 ثانية/);
  assert.match(lockedOutMessage(240_000), /4 دقيقة/);
});
