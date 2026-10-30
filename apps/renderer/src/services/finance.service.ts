import type { DealFinance, PersonFinance } from "../types";
import { request } from "./api.service";

/** A deal's money: commissions, client funds held, income and costs. */
export function getDealFinance(dealId: number) {
  return request<DealFinance>(`/finance/deals/${dealId}`);
}

/** A customer's money: what they owe the office and what it holds for them. */
export function getPersonFinance(personId: number) {
  return request<PersonFinance>(`/finance/people/${personId}`);
}
