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
