import type { Currency } from "./deal.types";

export type LeaseFrequency = "monthly" | "quarterly" | "semi_annual" | "annual";
/** Where a lease stands today: before, during or after its dates. */
export type LeaseState = "upcoming" | "current" | "ended" | "cancelled";
export type LeaseSortKey = "start_date" | "end_date" | "code" | "created_at";

/**
 * A lease in force: from an issued rent contract (its code and revision) or
 * entered by hand. Its terms never change; a mistake is cancelled.
 */
export interface LeaseRecord {
  id: number;
  code: string;
  agreement_id: number | null;
  agreement_code: string | null;
  agreement_revision: number | null;
  rental_id: number | null;
  rental_code: string | null;
  rental_name: string | null;
  landlord_person_id: number | null;
  landlord_name: string | null;
  tenant_person_id: number | null;
  tenant_name: string | null;
  currency: Currency;
  /** The rent of one period of `frequency`. */
  rent_amount: string;
  frequency: LeaseFrequency;
  start_date: string;
  end_date: string;
  deposit: string | null;
  office_collects: boolean;
  status: "active" | "cancelled";
  state: LeaseState;
  installment_count: number;
  total_rent: string;
  next_due_date: string | null;
  notes: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface LeaseInstallmentRecord {
  id: number;
  seq: number;
  due_date: string;
  period_start: string;
  period_end: string;
  amount: string;
  /** Due once its day has come. */
  state: "upcoming" | "due";
}

export interface LeaseDetail extends LeaseRecord {
  installments: LeaseInstallmentRecord[];
}

/** One installment of a schedule not yet written. */
export interface ScheduledInstallment {
  seq: number;
  due_date: string;
  period_start: string;
  period_end: string;
  amount: string;
  /** False for a period the end date cuts short (its days' share). */
  full: boolean;
}

export interface LeaseSchedule {
  installments: ScheduledInstallment[];
  total: string;
}

/** What activating a rent contract would put in force, or why it cannot. */
export interface AgreementLeaseDraft {
  agreement_id: number;
  agreement_code: string;
  agreement_status: string;
  agreement_revision: number;
  problem: string | null;
  existing_lease: { id: number; code: string } | null;
  lease: {
    rental_id: number | null;
    landlord_person_id: number | null;
    tenant_person_id: number | null;
    currency: Currency;
    rent_amount: string;
    frequency: LeaseFrequency;
    start_date: string;
    end_date: string;
    deposit: string | null;
  } | null;
  installments: ScheduledInstallment[];
  total_rent: string;
}

export interface LeaseScheduleTerms {
  currency: Currency;
  rent_amount: string;
  frequency: LeaseFrequency;
  start_date: string;
  end_date: string;
}

/** A lease entered by hand. */
export interface LeasePayload extends LeaseScheduleTerms {
  rental_id: number | null;
  landlord_person_id: number;
  tenant_person_id: number;
  deposit: string | null;
  office_collects: boolean;
  notes: string | null;
}

export interface LeaseActivatePayload {
  agreement_id: number;
  office_collects: boolean;
  notes: string | null;
}

export interface LeaseFilters {
  state?: LeaseState;
  person_id?: number;
  rental_id?: number;
  q?: string;
}
