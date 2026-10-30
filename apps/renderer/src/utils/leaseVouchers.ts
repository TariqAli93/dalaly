import { formatAmount, formatDate } from "./format";
import { amountToMinor, minorToAmount } from "./money";
import type { Currency, VoucherKind, VoucherPayload } from "../types";

/** What a lease's voucher needs to know of the lease. */
export interface LeaseParties {
  id: number;
  code: string;
  currency: Currency;
  landlord_person_id: number | null;
  landlord_name: string | null;
  tenant_person_id: number | null;
  tenant_name: string | null;
}

/** A voucher opened from a lease: its kind, preset and the note on top. */
export interface LeaseVoucher {
  kind: VoucherKind;
  preset: Partial<VoucherPayload>;
  note: string;
}

const zero = (value: string) => /^-?0(\.0+)?$/.test(value);

/**
 * سند قبض لقسط من الإيجار: المتبقي منه، من المستأجر، لحساب المؤجر. أمانة
 * وليس إيراداً للمكتب.
 */
export function rentReceipt(
  lease: LeaseParties,
  installment: { id: number; seq: number; due_date: string; left: string },
): LeaseVoucher {
  const landlord = lease.landlord_name ?? "المؤجر";
  return {
    kind: "receipt",
    preset: {
      purpose: "client_funds",
      currency: lease.currency,
      person_id: lease.tenant_person_id,
      held_for_person_id: lease.landlord_person_id,
      lease_id: lease.id,
      lease_installment_id: installment.id,
      amount: installment.left,
      description: `إيجار القسط ${installment.seq} من الإيجار ${lease.code} (يُستحق ${formatDate(installment.due_date)})`,
    },
    note: `القسط ${installment.seq} من الإيجار ${lease.code}: المتبقي منه ${formatAmount(installment.left, lease.currency)}. يُحفظ لحساب ${landlord}، وليس إيراداً للمكتب.`,
  };
}

/** سند قبض لتأمين الإيجار: يُحفظ لحساب المستأجر حتى يُعاد إليه. */
export function depositReceipt(
  lease: LeaseParties,
  agreed: string | null,
  held: string,
): LeaseVoucher {
  // What of the agreed deposit is not held yet, in exact hundredths.
  const left = (amountToMinor(agreed) ?? 0n) - (amountToMinor(held) ?? 0n);
  return {
    kind: "receipt",
    preset: {
      purpose: "client_funds",
      currency: lease.currency,
      person_id: lease.tenant_person_id,
      held_for_person_id: lease.tenant_person_id,
      lease_id: lease.id,
      amount: left > 0n ? minorToAmount(left) : "",
      description: `تأمين الإيجار ${lease.code}`,
    },
    note: `تأمين الإيجار ${lease.code}: يُحفظ لحساب ${lease.tenant_name ?? "المستأجر"} ويُعاد إليه عند انتهاء الإيجار، وليس إيراداً للمكتب.`,
  };
}

/** سند صرف من أمانة الإيجار: الإيجار إلى المؤجر، أو التأمين إلى المستأجر. */
export function leasePayout(
  lease: LeaseParties,
  to: "landlord" | "tenant",
  held: string,
): LeaseVoucher {
  const personId =
    to === "landlord" ? lease.landlord_person_id : lease.tenant_person_id;
  const name =
    (to === "landlord" ? lease.landlord_name : lease.tenant_name) ??
    (to === "landlord" ? "المؤجر" : "المستأجر");
  return {
    kind: "payment",
    preset: {
      purpose: "client_funds",
      currency: lease.currency,
      person_id: personId,
      held_for_person_id: personId,
      lease_id: lease.id,
      amount: zero(held) ? "" : held,
      description:
        to === "landlord"
          ? `تسليم إيجار ${lease.code} إلى المؤجر`
          : `إعادة تأمين الإيجار ${lease.code}`,
    },
    note:
      to === "landlord"
        ? `من الإيجار المقبوض على ${lease.code} لحساب ${name}؛ يحفظه الإيجار ${formatAmount(held, lease.currency)}.`
        : `من تأمين الإيجار ${lease.code} المحفوظ لحساب ${name}؛ المحفوظ ${formatAmount(held, lease.currency)}.`,
  };
}
