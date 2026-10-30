import type { Currency } from "./deal.types";

/**
 * The financial reports (/api/reports/financial). Every amount is a decimal
 * string; every report has one section per currency, never mixed. The
 * formulas are in docs/REPORTS.md.
 */

/** An account as a report lists it, with the heading it falls under. */
export interface ReportAccount {
  account_id: number;
  code: string;
  name: string;
  account_type: string;
  /** The system heading (cash, bank, receivables, …) or null. */
  heading: string | null;
  heading_name: string | null;
}

export interface ReportPeriodQuery {
  from?: string;
  to?: string;
  currency?: Currency;
}
export interface ReportAsOfQuery {
  as_of?: string;
  currency?: Currency;
}

export interface TrialBalanceRow extends ReportAccount {
  /** The balance before the period, debit positive. */
  opening: string;
  debit: string;
  credit: string;
  closing_debit: string;
  closing_credit: string;
}
export interface TrialBalanceSection {
  currency: Currency;
  rows: TrialBalanceRow[];
  totals: {
    opening: string;
    debit: string;
    credit: string;
    closing_debit: string;
    closing_credit: string;
  };
  balanced: boolean;
}
export interface TrialBalanceReport {
  from: string;
  to: string;
  sections: TrialBalanceSection[];
}

export interface IncomeStatementRow extends ReportAccount {
  amount: string;
  by_month: Array<{ month: string; amount: string }>;
}
export interface IncomeStatementSection {
  currency: Currency;
  revenue: IncomeStatementRow[];
  expenses: IncomeStatementRow[];
  /** Expenses paid by voucher, by the voucher's category. */
  expense_categories: Array<{
    category_id: number | null;
    category_name: string | null;
    amount: string;
  }>;
  totals: { revenue: string; expenses: string; net: string };
  by_month: Array<{
    month: string;
    revenue: string;
    expenses: string;
    net: string;
  }>;
}
export interface IncomeStatementReport {
  from: string;
  to: string;
  group: "none" | "month";
  months: string[];
  sections: IncomeStatementSection[];
}

export interface BalanceSheetRow extends ReportAccount {
  balance: string;
}
export interface BalanceSheetSection {
  currency: Currency;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  totals: {
    assets: string;
    liabilities: string;
    equity: string;
    /** Revenue less expenses up to the day, not closed into equity. */
    earnings: string;
    liabilities_and_equity: string;
  };
  balanced: boolean;
}
export interface BalanceSheetReport {
  as_of: string;
  sections: BalanceSheetSection[];
}

export interface CashFlowCategory {
  /** The heading of the other side (receivables, client_funds, …). */
  category: string;
  category_name: string;
  money_in: string;
  money_out: string;
  net: string;
}
export interface CashFlowAccount extends ReportAccount {
  opening: string;
  money_in: string;
  money_out: string;
  closing: string;
}
export interface CashFlowSection {
  currency: Currency;
  categories: CashFlowCategory[];
  accounts: CashFlowAccount[];
  totals: {
    opening: string;
    money_in: string;
    money_out: string;
    net: string;
    closing: string;
  };
  balanced: boolean;
}
export interface CashFlowReport {
  from: string;
  to: string;
  sections: CashFlowSection[];
}

export interface CommissionReportRow {
  id: number;
  code: string;
  commission_date: string;
  currency: Currency;
  status: string;
  payer_role: string;
  payer_person_id: number | null;
  payer_name: string | null;
  deal_id: number;
  deal_code: string;
  deal_type: string;
  amount: string;
  collected: string;
  outstanding: string;
  shares: string;
  shares_paid: string;
}
export interface CommissionReportSection {
  currency: Currency;
  rows: CommissionReportRow[];
  totals: {
    count: number;
    recorded: string;
    collected: string;
    outstanding: string;
    shares: string;
    shares_paid: string;
    shares_owed: string;
    /** Recorded less employees' shares. */
    office_net: string;
    cancelled_count: number;
    cancelled_amount: string;
  };
  by_deal_type: Array<{
    deal_type: string;
    count: number;
    recorded: string;
    collected: string;
  }>;
  employees: Array<{
    user_id: number;
    display_name: string;
    commissions: number;
    shares: string;
    paid: string;
    owed: string;
  }>;
}
export interface CommissionsReport {
  from: string;
  to: string;
  user_id: number | null;
  sections: CommissionReportSection[];
  truncated: boolean;
}
export interface CommissionsReportQuery extends ReportPeriodQuery {
  user_id?: number;
}

export type AgingKey = "current" | "days_31_60" | "days_61_90" | "over_90";

/** Age buckets of what a customer owes, in days since it was charged. */
export interface Aging {
  current: string;
  days_31_60: string;
  days_61_90: string;
  over_90: string;
  total: string;
}
export interface ReceivableRow extends Aging {
  currency: Currency;
  person_id: number | null;
  person_name: string | null;
  phone: string | null;
  last_date: string;
}
export interface ReceivablesReport {
  as_of: string;
  sections: Array<{ currency: Currency; rows: ReceivableRow[]; totals: Aging }>;
}

export interface PayablePersonRow {
  person_id: number | null;
  person_name: string | null;
  phone: string | null;
  amount: string;
}
export interface PayablesSection {
  currency: Currency;
  client_funds: PayablePersonRow[];
  payables: PayablePersonRow[];
  employees: Array<{
    user_id: number;
    display_name: string;
    shares: string;
    paid: string;
    owed: string;
  }>;
  totals: {
    client_funds: string;
    payables: string;
    employee_shares: string;
    /** The commissions-payable accounts' balance. */
    employee_shares_ledger: string;
  };
}
export interface PayablesReport {
  as_of: string;
  sections: PayablesSection[];
}

// ─── Operational reports (/api/reports/operations) ───────────────────────

export interface OperationsPeriodQuery {
  from?: string;
  to?: string;
}

export interface DealsReport {
  from: string;
  to: string;
  user_id: number | null;
  deal_type: string | null;
  totals: {
    created: number;
    won: number;
    lost: number;
    cancelled: number;
    open_now: number;
    /** Won ÷ (won + lost) closed in the period, %; null when none closed. */
    win_rate: number | null;
    cohort_won: number;
    /** Of deals created in the period, the share won by now, %. */
    cohort_conversion: number | null;
    cycle_days_average: number | null;
    cycle_days_median: number | null;
  };
  stages: Array<{ stage: string; deals: number; days_in_stage: number | null }>;
  pipeline: Array<{
    currency: Currency;
    deals: number;
    expected_commission: string;
  }>;
  lost_reasons: Array<{ reason: string; deals: number; share: number | null }>;
  employees: Array<{
    user_id: number | null;
    display_name: string | null;
    open_now: number;
    created: number;
    won: number;
    lost: number;
    win_rate: number | null;
    cycle_days: number | null;
    commission_iqd: string;
    commission_usd: string;
  }>;
  commissions: Array<{
    currency: Currency;
    deal_type: string;
    commissions: number;
    amount: string;
  }>;
  closed: Array<{
    id: number;
    code: string;
    deal_type: string;
    stage: string;
    currency: Currency;
    agreed_price: string | null;
    lost_reason: string | null;
    client_person_id: number | null;
    client_name: string | null;
    user_name: string | null;
    created_on: string;
    closed_on: string;
    cycle_days: number | null;
  }>;
  closed_truncated: boolean;
}
export interface DealsReportQuery extends OperationsPeriodQuery {
  user_id?: number;
  deal_type?: "sale" | "rent";
}

export interface CustomersReport {
  from: string;
  to: string;
  days: number;
  user_id: number | null;
  totals: {
    active: number;
    new: number;
    contacted: number;
    uncontacted: number;
    repeat: number;
    new_converted: number;
    new_conversion: number | null;
  };
  uncontacted: Array<{
    person_id: number;
    person_name: string;
    phone: string | null;
    user_name: string | null;
    open_requests: number;
    open_deals: number;
    last_contact: string | null;
  }>;
  repeat: Array<{
    person_id: number;
    person_name: string;
    phone: string | null;
    won_deals: number;
    last_won: string | null;
  }>;
  contacts_by_type: Array<{
    type: string;
    contacts: number;
    customers: number;
  }>;
  contacts_by_user: Array<{
    user_id: number | null;
    display_name: string | null;
    contacts: number;
    customers: number;
  }>;
  /** Null without requests.read. */
  requests: Array<{
    kind: "sale" | "rental";
    open: number;
    created: number;
    with_deal: number;
    won: number;
    conversion: number | null;
  }> | null;
}
export interface CustomersReportQuery extends OperationsPeriodQuery {
  user_id?: number;
  days?: number;
}

export interface ListingsReport {
  kind: "sale" | "rental";
  from: string;
  to: string;
  statuses: Array<{ status: string; listings: number }>;
  totals: {
    available: number;
    closed: number;
    stale: number;
    age_median: number | null;
    open_requests: number | null;
    unmatched_requests: number | null;
  };
  age: Array<{ bucket: string; listings: number }>;
  closed: Array<{
    id: number;
    code: string;
    name: string;
    property_type: string;
    price: string | null;
    closed_on: string;
  }>;
  types: Array<{
    property_type: string;
    available: number;
    requests: number | null;
  }>;
  price_bands: Array<{
    from: number | null;
    to: number | null;
    available: number;
    requests: number | null;
  }>;
  demand: Array<{
    governorate: string;
    district: string;
    requests: number;
    available: number;
  }> | null;
  unmatched: Array<{
    id: number;
    code: string;
    person_id: number;
    person_name: string;
    phone: string | null;
    property_type: string;
    budget_max: string | null;
    governorate: string | null;
    district: string | null;
    created_at: string;
  }> | null;
}
export interface ListingsReportQuery extends OperationsPeriodQuery {
  kind: "sale" | "rental";
}

export interface LeasesReport {
  from: string;
  to: string;
  days: number;
  in_force: Array<{
    currency: Currency;
    current: number;
    upcoming: number;
    monthly_rent: string;
  }>;
  expiring: Array<{
    id: number;
    code: string;
    currency: Currency;
    rent_amount: string;
    frequency: string;
    end_date: string;
    days_left: number;
    tenant_person_id: number | null;
    tenant_name: string | null;
    landlord_name: string | null;
  }>;
  due: Array<{
    currency: Currency;
    installments: number;
    amount: string;
    paid: string;
    collection_rate: number | null;
  }>;
  overdue: Array<{
    currency: Currency;
    installments: number;
    left: string;
    oldest_days: number;
  }>;
  ended: {
    ended: number;
    renewed: number;
    terminated: number;
    renewal_rate: number | null;
  };
  brokerage: {
    activated: number;
    renewals: number;
    rent_deals_won: number;
    commissions: Array<{
      currency: Currency;
      commissions: number;
      amount: string;
    }>;
  };
}
export interface LeasesReportQuery extends OperationsPeriodQuery {
  days?: number;
}
