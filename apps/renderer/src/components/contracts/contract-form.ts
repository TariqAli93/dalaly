import { toNumber } from "../../utils/format";
import type { PropertyRecord, RentalRecord } from "../../types";

export type ContractType = "sale" | "rental";
export type ContractAsset = PropertyRecord | RentalRecord;

export function assetAmount(asset: ContractAsset, type: ContractType) {
  return toNumber(
    type === "sale"
      ? (asset as PropertyRecord).total_price
      : (asset as RentalRecord).rent_price,
  );
}

export function totalAssetAmount(assets: ContractAsset[], type: ContractType) {
  return assets.reduce((total, asset) => total + assetAmount(asset, type), 0);
}

export function requiredDocumentKeys(_type: ContractType, _role: string) {
  return ["national_id", "residence_card"];
}

export function dateOnly(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
}

export function remainingAmount(total: number, paid: unknown) {
  return total - toNumber(paid);
}

export function currentContractDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Prefer the stored relationship. The fallback must identify exactly one
// reusable person, and every selected asset must have the same owner.
export function assetOwnerId(
  assets: ContractAsset[],
  people: Array<{
    id: number;
    full_name: string;
    phone_primary: string | null;
    phone_secondary: string | null;
  }>,
) {
  const phone = (value: string | null) =>
    (value ?? "").replace(/[^0-9٠-٩۰-۹]/g, "");
  const owners = assets.map((asset) => {
    if (asset.owner_person_id)
      return people.some((person) => person.id === asset.owner_person_id)
        ? asset.owner_person_id
        : null;
    if (!asset.owner_name.trim() || !phone(asset.owner_phone)) return null;
    const matches = people.filter(
      (person) =>
        person.full_name.trim() === asset.owner_name.trim() &&
        [person.phone_primary, person.phone_secondary].some(
          (value) => phone(value) === phone(asset.owner_phone),
        ),
    );
    return matches.length === 1 ? matches[0].id : null;
  });
  return owners.length && owners.every((id) => id && id === owners[0])
    ? owners[0]
    : null;
}

export function recoverLocalDraft(
  server: { status: string; updatedAt: string | null; fingerprint: string },
  cached: { updatedAt?: unknown; fingerprint?: unknown } | null,
) {
  if (server.status !== "draft" || !cached) return false;
  return cached.updatedAt && server.updatedAt
    ? cached.updatedAt === server.updatedAt
    : cached.fingerprint === server.fingerprint;
}
