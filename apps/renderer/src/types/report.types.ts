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
