import assert from "node:assert/strict";
import test from "node:test";
import {
  needsClosePermission,
  stageMoveError,
  type StageMoveDeal,
} from "../src/modules/deals/deals.rules.js";

const deal = (patch: Partial<StageMoveDeal> = {}): StageMoveDeal => ({
  stage: "negotiating",
  agreedPrice: null,
  ownerPersonId: 2,
  agreementStatus: null,
  ...patch,
});

test("open stages move freely, forwards and back", () => {
  assert.equal(stageMoveError(deal({ stage: "new" }), "negotiating"), null);
  assert.equal(stageMoveError(deal({ stage: "agreed" }), "viewing_scheduled"), null);
  assert.match(stageMoveError(deal(), "negotiating")!, /أصلاً/);
});

test("a deal is won only after an agreed price, with both parties", () => {
  assert.match(stageMoveError(deal(), "won")!, /بعد الاتفاق/);
  assert.match(stageMoveError(deal({ stage: "agreed" }), "won")!, /السعر المتفق/);
  assert.match(
    stageMoveError(deal({ stage: "agreed", agreedPrice: "1.00", ownerPersonId: null }), "won")!,
    /البائع أو المؤجر/,
  );
  assert.equal(stageMoveError(deal({ stage: "agreed", agreedPrice: "1.00" }), "won"), null);
  assert.equal(stageMoveError(deal({ stage: "contract_issued", agreedPrice: "1.00" }), "won"), null);
});

test("'contract issued' needs an issued contract", () => {
  assert.match(stageMoveError(deal({ stage: "agreed" }), "contract_issued")!, /عقد صادر/);
  assert.match(stageMoveError(deal({ stage: "agreed", agreementStatus: "draft" }), "contract_issued")!, /عقد صادر/);
  assert.equal(stageMoveError(deal({ stage: "agreed", agreementStatus: "issued" }), "contract_issued"), null);
});

test("losing and cancelling need a reason; a closed deal is reopened before closing again", () => {
  assert.match(stageMoveError(deal(), "lost")!, /سبب خسارة/);
  assert.equal(stageMoveError(deal(), "lost", { lost_reason: "السعر مرتفع" }), null);
  assert.match(stageMoveError(deal(), "cancelled")!, /سبب إلغاء/);
  assert.match(stageMoveError(deal({ stage: "won" }), "lost", { lost_reason: "x" })!, /أعد فتح/);
  assert.match(stageMoveError(deal({ stage: "lost" }), "negotiating")!, /سبب إعادة فتح/);
  assert.equal(stageMoveError(deal({ stage: "lost" }), "negotiating", { reason: "عاد الزبون" }), null);
});

test("closing and reopening need the close permission; other moves do not", () => {
  assert.equal(needsClosePermission("new", "negotiating"), false);
  assert.equal(needsClosePermission("agreed", "won"), true);
  assert.equal(needsClosePermission("negotiating", "cancelled"), true);
  assert.equal(needsClosePermission("lost", "negotiating"), true);
});
