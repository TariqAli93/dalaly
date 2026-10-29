import type { PagedResult } from "./paging.types";
import type { ActivityRecord, TaskPriority } from "./task.types";

export type DealType = "sale" | "rent";
export type DealStage =
  | "new"
  | "contacted"
  | "qualified"
  | "viewing_scheduled"
  | "viewing_done"
  | "negotiating"
  | "agreed"
  | "contract_preparation"
  | "contract_issued"
  | "won"
  | "lost"
  | "cancelled";
export type Currency = "IQD" | "USD";
export type DealSortKey =
  | "updated_at"
  | "created_at"
  | "stage_changed_at"
  | "expected_close_date"
  | "asking_price"
  | "agreed_price"
  | "code";

/**
 * A deal as lists show it. Amounts are exact decimal strings ("1500000.00");
 * format them for display, never add them as numbers.
 */
export type DealRecord = {
  id: number;
  code: string;
  deal_type: DealType;
  stage: DealStage;
  priority: TaskPriority;
  title: string | null;
  property_id: number | null;
  rental_id: number | null;
  /** The buyer of a sale, the tenant of a rent. */
  client_person_id: number;
  client_name: string;
  client_phone: string | null;
  /** The seller of a sale, the landlord of a rent. */
  owner_person_id: number | null;
  owner_name: string | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
  purchase_request_id: number | null;
  rental_request_id: number | null;
  request_code: string | null;
  agreement_id: number | null;
  agreement_code: string | null;
  agreement_status: string | null;
  listing_code: string | null;
  listing_name: string | null;
  currency: Currency;
  asking_price: string | null;
  agreed_price: string | null;
  expected_commission: string | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  stage_changed_at: string;
  closed_at: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
};

export type DealOfferRecord = {
  id: number;
  deal_id: number;
  party: "client" | "owner";
  amount: string;
  status: "proposed" | "countered" | "accepted" | "rejected" | "withdrawn";
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type DealStageHistoryRecord = {
  id: number;
  from_stage: DealStage | null;
  to_stage: DealStage;
  reason: string | null;
  user_name: string | null;
  created_at: string;
};

/** GET /deals/:id: the deal with its offers, stage history and activities. */
export type DealDetail = DealRecord & {
  offers: DealOfferRecord[];
  history: DealStageHistoryRecord[];
  activities: ActivityRecord[];
};

export type DealPage = PagedResult<DealRecord>;

export type DealPipeline = {
  stages: Array<{
    stage: DealStage;
    currency: Currency;
    count: number;
    asking_total: string;
    agreed_total: string;
    expected_commission_total: string;
  }>;
};

export type DealFilters = {
  q?: string;
  deal_type?: DealType;
  stage?: DealStage;
  state?: "open" | "closed";
  assigned?: "me" | "unassigned" | number;
  person_id?: number;
  property_id?: number;
  rental_id?: number;
  stalled_days?: number;
};

export type DealPayload = {
  deal_type: DealType;
  title?: string | null;
  priority?: TaskPriority;
  property_id?: number | null;
  rental_id?: number | null;
  client_person_id: number;
  owner_person_id?: number | null;
  assigned_user_id?: number | null;
  purchase_request_id?: number | null;
  rental_request_id?: number | null;
  currency?: Currency;
  asking_price?: string | null;
  agreed_price?: string | null;
  expected_commission?: string | null;
  expected_close_date?: string | null;
  notes?: string | null;
};
