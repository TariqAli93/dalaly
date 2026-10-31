import type {
  CashTransferRecord,
  ExpenseCategoryPayload,
  ExpenseCategoryRecord,
  MoneyAccount,
  PageQuery,
  PagedResult,
  ReconciliationPayload,
  ReconciliationRecord,
  TransferFilters,
  TransferPayload,
  TransferSortKey,
} from "../types";
import { request } from "./api.service";
import { queryString } from "../utils/query";

/** Cash and bank accounts with their balances, today or as of a date. */
export function getBalances(asOf?: string) {
  return request<MoneyAccount[]>(
    `/cash/balances${queryString({ as_of: asOf })}`,
  );
}

export function listTransfersPage(
  filters: TransferFilters,
  page: PageQuery<TransferSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<CashTransferRecord>>(
    `/cash/transfers/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
}

export function createTransfer(payload: TransferPayload) {
  return request<CashTransferRecord>("/cash/transfers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function voidTransfer(
  id: number,
  input: { void_date?: string; reason: string },
) {
  return request<CashTransferRecord>(`/cash/transfers/${id}/void`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listReconciliations(accountId?: number) {
  return request<ReconciliationRecord[]>(
    `/cash/reconciliations${queryString({ account_id: accountId })}`,
  );
}

export function createReconciliation(payload: ReconciliationPayload) {
  return request<ReconciliationRecord>("/cash/reconciliations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listExpenseCategories() {
  return request<ExpenseCategoryRecord[]>("/expense-categories");
}

export function createExpenseCategory(payload: ExpenseCategoryPayload) {
  return request<ExpenseCategoryRecord>("/expense-categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateExpenseCategory(
  id: number,
  payload: ExpenseCategoryPayload,
) {
  return request<ExpenseCategoryRecord>(`/expense-categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
