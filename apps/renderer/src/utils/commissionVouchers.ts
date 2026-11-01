import { formatAmount } from "./format";
import type {
  CommissionRecord,
  CommissionSplitRecord,
  VoucherPayload,
} from "../types";

/**
 * سند قبض يحصّل عمولة: مخصص لها (commission_id) بما بقي منها، فيحدد الخادم
 * الدافع والصفقة والعملة. نفسه من صفحة الحسابات والعمولة والصفقة.
 */
export function commissionCollection(commission: CommissionRecord): {
  preset: Partial<VoucherPayload>;
  note: string;
} {
  return {
    preset: {
      purpose: "commission",
      currency: commission.currency,
      commission_id: commission.id,
      amount: commission.outstanding,
      description: `عمولة ${commission.code}${commission.deal_code ? ` على الصفقة ${commission.deal_code}` : ""}`,
    },
    note: `تحصيل العمولة ${commission.code} من ${commission.payer_name ?? ""}؛ المتبقي ${formatAmount(commission.outstanding, commission.currency)}.`,
  };
}

/** سند صرف يدفع حصة موظف من عمولة، بما بقي منها. */
export function sharePayment(share: CommissionSplitRecord): {
  preset: Partial<VoucherPayload>;
  note: string;
} {
  return {
    preset: {
      purpose: "commission",
      currency: share.currency,
      commission_split_id: share.id,
      amount: share.outstanding,
      description: `حصة ${share.user_name} من العمولة ${share.commission_code}`,
    },
    note: `دفع حصة ${share.user_name} من العمولة ${share.commission_code}؛ المتبقي ${formatAmount(share.outstanding, share.currency)}.`,
  };
}
