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
