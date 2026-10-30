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
