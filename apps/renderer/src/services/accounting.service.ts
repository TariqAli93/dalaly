import type { AccountPayload, AccountRecord } from "../types";
import { request } from "./api.service";

export function listAccounts() {
  return request<AccountRecord[]>("/accounting/accounts");
}

export function createAccount(payload: AccountPayload) {
  return request<AccountRecord>("/accounting/accounts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAccount(id: number, payload: AccountPayload) {
  return request<AccountRecord>(`/accounting/accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
