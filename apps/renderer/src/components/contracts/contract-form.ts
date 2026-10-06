import { toNumber } from "../../utils/format";
import type { PropertyRecord, RentalRecord } from "../../types";

export type ContractType = "sale" | "rental";
export type ContractAsset = PropertyRecord | RentalRecord;

export function assetAmount(asset: ContractAsset, type: ContractType) {
  return toNumber(type === "sale" ? (asset as PropertyRecord).total_price : (asset as RentalRecord).rent_price);
}

export function totalAssetAmount(
  assets: ContractAsset[],
  type: ContractType,
) {
  return assets.reduce((total, asset) => total + assetAmount(asset, type), 0);
}

export function requiredDocumentKeys(type: ContractType, role: string) {
  if (type === "sale") {
    return role === "seller"
      ? ["national_id", "residence_card", "ownership_document"]
      : ["national_id", "residence_card"];
  }
  return role === "lessee"
    ? ["national_id", "residence_card", "security_approval"]
    : ["national_id", "residence_card"];
}

export function dateOnly(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "";
}

export function remainingAmount(total: number, paid: unknown) {
  return total - toNumber(paid);
}
