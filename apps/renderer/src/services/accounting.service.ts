import type {
  AccountPayload,
  AccountRecord,
  AccountStatement,
  AccountingPeriod,
  JournalEntryDetail,
  JournalEntryPayload,
  JournalEntryRecord,
  JournalFilters,
  JournalSortKey,
  PageQuery,
  PagedResult,
} from "../types";
import { request } from "./api.service";
import { queryString } from "../utils/query";

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

export function listJournalPage(
  filters: JournalFilters,
  page: PageQuery<JournalSortKey>,
  signal?: AbortSignal,
) {
  return request<PagedResult<JournalEntryRecord>>(
    `/accounting/journal/paged${queryString({ ...filters, ...page })}`,
    { signal },
  );
}

export function getJournalEntry(id: number) {
  return request<JournalEntryDetail>(`/accounting/journal/${id}`);
}

export function createJournalEntry(payload: JournalEntryPayload) {
  return request<JournalEntryDetail>("/accounting/journal", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateJournalEntry(id: number, payload: JournalEntryPayload) {
  return request<JournalEntryDetail>(`/accounting/journal/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteJournalEntry(id: number) {
  return request<{ id: number }>(`/accounting/journal/${id}`, {
    method: "DELETE",
  });
}

export function postJournalEntry(id: number) {
  return request<JournalEntryDetail>(`/accounting/journal/${id}/post`, {
    method: "POST",
  });
}

export function reverseJournalEntry(
  id: number,
  input: { entry_date?: string; reason: string },
) {
  return request<JournalEntryDetail>(`/accounting/journal/${id}/reverse`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAccountStatement(
  id: number,
  range: { from?: string; to?: string },
) {
  return request<AccountStatement>(
    `/accounting/accounts/${id}/statement${queryString(range)}`,
  );
}

export function listPeriods() {
  return request<AccountingPeriod[]>("/accounting/periods");
}

export function closePeriod(period: string, notes: string | null) {
  return request<{ period: string; drafts_left: number }>(
    "/accounting/periods",
    { method: "POST", body: JSON.stringify({ period, notes }) },
  );
}

export function reopenPeriod(period: string) {
  return request<{ period: string }>(`/accounting/periods/${period}`, {
    method: "DELETE",
  });
}
