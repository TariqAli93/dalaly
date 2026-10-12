import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetOwnerId,
  currentContractDate,
  recoverLocalDraft,
  remainingAmount,
  totalAssetAmount,
  type ContractAsset,
} from "../../apps/renderer/src/components/contracts/contract-form.js";

const people = [
  { id: 1, full_name: "مالك اختبار", phone_primary: "07700000001", phone_secondary: null },
  { id: 2, full_name: "مالك آخر", phone_primary: "07700000002", phone_secondary: null },
];
function asset(overrides: Record<string, unknown> = {}): ContractAsset {
  return {
    id: 10, owner_person_id: null, owner_name: people[0].full_name,
    owner_phone: "0770 000 0001", total_price: "100,000", rent_price: "500,000", ...overrides,
  } as unknown as ContractAsset;
}

test("contract default date follows Baghdad across the UTC day boundary", () => {
  assert.equal(currentContractDate(new Date("2026-10-11T20:59:59Z")), "2026-10-11");
  assert.equal(currentContractDate(new Date("2026-10-11T21:00:00Z")), "2026-10-12");
});

test("owner autofill prefers the linked person and refuses ambiguous or mixed owners", () => {
  assert.equal(assetOwnerId([asset({ owner_person_id: 2 })], people), 2);
  assert.equal(assetOwnerId([asset()], people), 1);
  assert.equal(assetOwnerId([asset(), asset({ id: 11 })], people), 1);
  assert.equal(assetOwnerId([asset({ owner_person_id: 1 }), asset({ owner_person_id: 2 })], people), null);
  assert.equal(assetOwnerId([asset({ owner_person_id: 999 })], people), null);
  assert.equal(assetOwnerId([asset()], [...people, { ...people[0], id: 3 }]), null);
  assert.equal(assetOwnerId([asset({ owner_phone: "" })], people), null);
  assert.equal(assetOwnerId([], people), null);
});

test("financial defaults retain separate sales and rental prices and calculate remaining", () => {
  assert.equal(totalAssetAmount([asset(), asset()], "sale"), 200000);
  assert.equal(totalAssetAmount([asset(), asset()], "rental"), 1000000);
  assert.equal(remainingAmount(1000000, "250,000"), 750000);
});

test("draft recovery rejects issued/cancelled content and newer server versions", () => {
  const server = { status: "draft", updatedAt: "2026-10-12T10:00:00Z", fingerprint: "same" };
  const matching = { updatedAt: server.updatedAt, fingerprint: "same" };
  assert.equal(recoverLocalDraft(server, matching), true);
  assert.equal(recoverLocalDraft({ ...server, status: "active" }, matching), false);
  assert.equal(recoverLocalDraft({ ...server, status: "cancelled" }, matching), false);
  assert.equal(recoverLocalDraft(server, { ...matching, updatedAt: "2026-10-12T09:00:00Z" }), false);
  assert.equal(recoverLocalDraft(server, null), false);
  assert.equal(recoverLocalDraft({ ...server, updatedAt: null }, { fingerprint: "same" }), true);
  assert.equal(recoverLocalDraft({ ...server, updatedAt: null }, { fingerprint: "different" }), false);
});
