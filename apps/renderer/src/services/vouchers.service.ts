import type {
  ClientFundsHeld,
  MoneyAccount,
  PageQuery,
  PagedResult,
  VoucherDetail,
  VoucherFilters,
  VoucherPayload,
  VoucherRecord,
  VoucherSortKey,
} from "../types";
import { request } from "./api.service";

function buildQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
  return query.toString() ? `?${query}` : "";
}

export function listVouchersPage(
  filters: VoucherFilters,
  page: PageQuery<VoucherSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<VoucherRecord>>(
    `/vouchers/paged${buildQuery({ ...filters, ...page })}`,
    { signal },
  );
}

export function getVoucher(id: number) {
  return request<VoucherDetail>(`/vouchers/${id}`);
}

export function listMoneyAccounts() {
  return request<MoneyAccount[]>("/vouchers/money-accounts");
}

export function getClientFunds(personId: number) {
  return request<ClientFundsHeld[]>(
    `/vouchers/client-funds?person_id=${personId}`,
  );
}

export function issueVoucher(payload: VoucherPayload) {
  return request<VoucherDetail>("/vouchers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function voidVoucher(
  id: number,
  input: { void_date?: string; reason: string },
) {
  return request<VoucherDetail>(`/vouchers/${id}/void`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
