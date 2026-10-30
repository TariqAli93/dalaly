import type { Currency } from "./deal.types";

export type AccountType =
  "asset" | "liability" | "equity" | "revenue" | "expense";

/**
 * An account of the chart. A heading (`is_postable` false) groups others and
 * may span both currencies (`currency` null); a posting account has one.
 * `system_key` marks the default accounts the ledger finds by key: only
 * their name and description can change.
 */
export interface AccountRecord {
  id: number;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: number | null;
  currency: Currency | null;
  is_postable: boolean;
  system_key: string | null;
  is_active: boolean;
  description: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface AccountPayload {
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: number | null;
  currency: Currency | null;
  is_postable: boolean;
  is_active: boolean;
  description: string | null;
}

export type JournalStatus = "draft" | "posted";
export type JournalSource =
  | "manual"
  | "reversal"
  | "receipt"
  | "payment"
  | "commission"
  | "expense"
  | "transfer"
  | "lease";
export type JournalSortKey = "entry_date" | "code" | "created_at";

/**
 * A journal entry as lists show it. `total` is its debits (equal to its
 * credits once posted). A posted entry never changes: `reversed_by_*` names
 * the entry that undid it, `reversal_of_*` the one a reversing entry undoes.
 */
export interface JournalEntryRecord {
  id: number;
  code: string;
  entry_date: string;
  description: string;
  currency: Currency;
  status: JournalStatus;
  source_type: JournalSource;
  source_id: number | null;
  total: string;
  reversal_of_id: number | null;
  reversal_of_code: string | null;
  reversed_by_id: number | null;
  reversed_by_code: string | null;
  posted_at: string | null;
  posted_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalLineRecord {
  id: number;
  line_no: number;
  account_id: number;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
  person_id: number | null;
  person_name: string | null;
  deal_id: number | null;
  deal_code: string | null;
  memo: string | null;
}

export interface JournalEntryDetail extends JournalEntryRecord {
  lines: JournalLineRecord[];
}

export interface JournalLinePayload {
  account_id: number;
  debit: string | null;
  credit: string | null;
  person_id: number | null;
  deal_id: number | null;
  memo: string | null;
}

export interface JournalEntryPayload {
  entry_date: string;
  currency: Currency;
  description: string;
  lines: JournalLinePayload[];
  /** Post at once rather than keep a draft (needs the posting permission). */
  post: boolean;
}

export interface JournalFilters {
  currency?: Currency;
  status?: JournalStatus;
  source_type?: JournalSource;
  account_id?: number;
  from?: string;
  to?: string;
  q?: string;
}

/** An account's posted lines with a running balance on its normal side. */
export interface AccountStatement {
  account: {
    id: number;
    code: string;
    name: string;
    account_type: AccountType;
    currency: Currency | null;
    normal_side: "debit" | "credit";
  };
  from: string | null;
  to: string | null;
  opening_balance: string;
  closing_balance: string;
  lines: Array<{
    entry_id: number;
    code: string;
    entry_date: string;
    description: string;
    memo: string | null;
    debit: string;
    credit: string;
    balance: string;
  }>;
  /** More lines than the statement shows: narrow the dates. */
  truncated: boolean;
}

/** A closed month: no postings until it is reopened. */
export interface AccountingPeriod {
  period: string;
  closed_at: string;
  closed_by_name: string | null;
  notes: string | null;
}

export type VoucherKind = "receipt" | "payment";
export type VoucherStatus = "posted" | "voided";
export type VoucherSortKey = "voucher_date" | "code" | "amount" | "created_at";

/**
 * A receipt (RC-) or payment (PV-): money into or out of a cash or bank
 * account, posted with its journal entry. It never changes; voiding posts
 * the reversing entry and keeps the voucher, marked voided.
 */
export interface VoucherRecord {
  id: number;
  code: string;
  kind: VoucherKind;
  voucher_date: string;
  currency: Currency;
  amount: string;
  purpose: string;
  money_account_id: number;
  money_account_code: string;
  money_account_name: string;
  other_account_id: number;
  other_account_code: string;
  other_account_name: string;
  person_id: number | null;
  party_name: string;
  deal_id: number | null;
  deal_code: string | null;
  description: string;
  reference: string | null;
  /** The commission a receipt collects, or whose share a payment pays. */
  commission_id: number | null;
  commission_code: string | null;
  commission_split_id: number | null;
  /** What an expense payment was for. */
  expense_category_id: number | null;
  expense_category_name: string | null;
  status: VoucherStatus;
  journal_entry_id: number;
  journal_entry_code: string;
  void_entry_id: number | null;
  void_entry_code: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface VoucherDetail extends VoucherRecord {
  /** "فقط ... لا غير", for the printed copy. */
  amount_in_words: string;
  office: {
    company_name: string;
    phone_primary: string | null;
    phone_secondary: string | null;
    address: string | null;
    license_number: string | null;
  } | null;
}

export interface VoucherPayload {
  kind: VoucherKind;
  voucher_date: string;
  currency: Currency;
  amount: string;
  purpose: string;
  money_account_id: number;
  /** Empty: the purpose's default account in the voucher's currency. */
  other_account_id: number | null;
  person_id: number | null;
  party_name: string | null;
  deal_id: number | null;
  description: string;
  reference: string | null;
  /** A receipt collecting this commission. */
  commission_id?: number | null;
  /** A payment of this employee's share. */
  commission_split_id?: number | null;
  /** What an expense payment was for: picks its expense account. */
  expense_category_id?: number | null;
}

export interface VoucherFilters {
  kind?: VoucherKind;
  currency?: Currency;
  status?: VoucherStatus;
  purpose?: string;
  person_id?: number;
  deal_id?: number;
  money_account_id?: number;
  from?: string;
  to?: string;
  q?: string;
}

/** A cash or bank posting account with its posted balance. */
export interface MoneyAccount {
  id: number;
  code: string;
  name: string;
  currency: Currency;
  kind: "cash" | "bank";
  balance: string;
}

/** Client funds held for a person, per currency. */
export interface ClientFundsHeld {
  currency: Currency;
  held: string;
}

export type PayerRole = "client" | "owner";
export type ShareBasis = "fixed" | "percent";
export type CommissionState = "open" | "settled" | "cancelled";
export type CommissionSortKey =
  "commission_date" | "code" | "amount" | "created_at";

/**
 * The office's commission on a deal, owed by its client or owner. `collected`
 * is what allocated receipts settled; `office_share` is what is left after
 * employees' shares.
 */
export interface CommissionRecord {
  id: number;
  code: string;
  deal_id: number | null;
  deal_code: string | null;
  payer_role: PayerRole;
  payer_person_id: number | null;
  payer_name: string | null;
  currency: Currency;
  basis: ShareBasis;
  rate: string | null;
  base_amount: string | null;
  amount: string;
  collected: string;
  outstanding: string;
  shares_total: string;
  office_share: string;
  commission_date: string;
  description: string | null;
  status: "active" | "cancelled";
  journal_entry_id: number;
  journal_entry_code: string;
  cancel_entry_id: number | null;
  cancel_entry_code: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** An employee's share, with what was paid on it. */
export interface CommissionSplitRecord {
  id: number;
  commission_id: number;
  commission_code: string;
  commission_status: "active" | "cancelled";
  deal_code: string | null;
  currency: Currency;
  user_id: number;
  user_name: string;
  basis: ShareBasis;
  rate: string | null;
  amount: string;
  paid: string;
  outstanding: string;
}

export interface CommissionDetail extends CommissionRecord {
  splits: CommissionSplitRecord[];
  vouchers: Array<{
    id: number;
    code: string;
    kind: VoucherKind;
    voucher_date: string;
    amount: string;
    party_name: string;
    status: VoucherStatus;
    commission_split_id: number | null;
  }>;
}

export interface CommissionSharePayload {
  basis: ShareBasis;
  rate: string | null;
  amount: string | null;
}

export interface CommissionPayload extends CommissionSharePayload {
  deal_id: number;
  payer_role: PayerRole;
  currency?: Currency;
  commission_date: string;
  description: string | null;
  splits: Array<CommissionSharePayload & { user_id: number }>;
}

export interface CommissionFilters {
  deal_id?: number;
  person_id?: number;
  user_id?: number;
  currency?: Currency;
  state?: CommissionState;
  q?: string;
}

export type TransferSortKey =
  "transfer_date" | "code" | "amount" | "created_at";

/** Money moved between two cash or bank accounts of one currency. */
export interface CashTransferRecord {
  id: number;
  code: string;
  transfer_date: string;
  currency: Currency;
  amount: string;
  from_account_id: number;
  from_account_code: string;
  from_account_name: string;
  to_account_id: number;
  to_account_code: string;
  to_account_name: string;
  description: string;
  reference: string | null;
  status: VoucherStatus;
  journal_entry_id: number;
  journal_entry_code: string;
  void_entry_id: number | null;
  void_entry_code: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface TransferPayload {
  transfer_date: string;
  currency: Currency;
  from_account_id: number;
  to_account_id: number;
  amount: string;
  description: string;
  reference: string | null;
}

export interface TransferFilters {
  currency?: Currency;
  status?: VoucherStatus;
  account_id?: number;
  from?: string;
  to?: string;
  q?: string;
}

/** A count or a bank statement against the books on a date. */
export interface ReconciliationRecord {
  id: number;
  code: string;
  account_id: number;
  account_code: string;
  account_name: string;
  currency: Currency;
  statement_date: string;
  statement_balance: string;
  book_balance: string;
  difference: string;
  adjustment_entry_id: number | null;
  adjustment_entry_code: string | null;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface ReconciliationPayload {
  account_id: number;
  statement_date: string;
  statement_balance: string;
  adjust: boolean;
  notes: string | null;
}

/** What an expense is for, with its expense account in each currency. */
export interface ExpenseCategoryRecord {
  id: number;
  name: string;
  iqd_account_id: number | null;
  iqd_account_code: string | null;
  iqd_account_name: string | null;
  usd_account_id: number | null;
  usd_account_code: string | null;
  usd_account_name: string | null;
  is_active: boolean;
}

export interface ExpenseCategoryPayload {
  name: string;
  iqd_account_id: number | null;
  usd_account_id: number | null;
  is_active: boolean;
}
