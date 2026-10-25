import type { MatchReason } from "./crm.types";

/** نوع المعاملة في لوحة العمليات: بيع (عروض وطلبات شراء) أو إيجار. */
export type OperationsKind = "sale" | "rental";

export type DashboardAppointment = {
  id: number;
  kind: OperationsKind;
  listing_id: number;
  listing_code: string;
  listing_name: string;
  listing_status: string;
  type: string;
  notes: string | null;
  scheduled_at: string;
  created_at: string;
  user_name: string | null;
};

export type DashboardStaleListing = {
  id: number;
  kind: OperationsKind;
  code: string;
  name: string;
  property_type: string;
  governorate: string | null;
  district: string | null;
  price: number;
  rent_period: string | null;
  updated_at: string;
  last_followup_at: string | null;
};

export type DashboardStaleListings = {
  total: number;
  items: DashboardStaleListing[];
};

export type DashboardSaleFigures = {
  counts: {
    available: number;
    reserved: number;
    negotiating: number;
    sold: number;
  };
  available_value: number;
  closed_recently: number;
};

export type DashboardRentalFigures = {
  counts: {
    available: number;
    reserved: number;
    negotiating: number;
    rented: number;
  };
  available_monthly_value: number;
  rented_monthly_value: number;
  closed_recently: number;
};

/** GET /dashboard/overview — كل قسم null حين لا يملك المستخدم صلاحيته. */
export type DashboardOverview = {
  generated_at: string;
  recent_days: number;
  stale_days: number;
  sale: DashboardSaleFigures | null;
  rental: DashboardRentalFigures | null;
  appointments: {
    today: number;
    next_days: number;
    days: number;
    items: DashboardAppointment[];
  } | null;
  viewings_without_outcome: {
    total: number;
    days: number;
    items: DashboardAppointment[];
  } | null;
  stale_listings: {
    sale: DashboardStaleListings | null;
    rental: DashboardStaleListings | null;
  };
};

/** طلب مفتوح لزبون نشط، مع عدد العروض المتاحة التي تحقق شروطه الأساسية. */
export type DashboardRequest = {
  kind: OperationsKind;
  id: number;
  code: string;
  person_id: number;
  person_code: string;
  person_name: string;
  person_phone: string | null;
  property_type: string;
  rent_period: string | null;
  budget_min: number | null;
  budget_max: number | null;
  area_min: number | null;
  area_max: number | null;
  area_unit: string | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  floors_count: number | null;
  governorate: string | null;
  district: string | null;
  neighborhood: string | null;
  other_requirements: string | null;
  created_at: string;
  updated_at: string;
  match_count: number;
  preferences_total: number;
};

export type DashboardOffer = {
  id: number;
  kind: OperationsKind;
  code: string;
  name: string;
  property_type: string;
  status: string;
  price: number;
  rent_period: string | null;
  area_value: number;
  area_unit: string;
  rooms_count: number | null;
  bathrooms_count: number | null;
  floors_count: number | null;
  governorate: string | null;
  district: string | null;
  neighborhood: string | null;
  is_negotiable: boolean;
  owner_person_id: number | null;
  updated_at: string;
};

export type DashboardMatch = {
  request: DashboardRequest;
  offer: DashboardOffer;
  match: {
    score: number;
    reasons: MatchReason[];
    required_met: boolean;
    preferences_met: number;
    preferences_total: number;
  };
};

export type DashboardCustomer = {
  person_id: number;
  person_code: string;
  person_name: string;
  person_phone: string | null;
  open_requests: number;
  requests_with_matches: number;
  total_matches: number;
  oldest_request_at: string;
  last_request_update_at: string;
  requests: Array<{
    kind: OperationsKind;
    id: number;
    code: string;
    property_type: string;
    match_count: number;
  }>;
};

export type DashboardRequestCounts = {
  open_requests: number;
  with_matches: number;
  without_matches: number;
};

/** GET /dashboard/matching */
export type DashboardMatching = {
  kinds: OperationsKind[];
  counts: {
    sale: DashboardRequestCounts | null;
    rental: DashboardRequestCounts | null;
  };
  items: DashboardMatch[];
  total: number;
  page: number;
  page_size: number;
  customers: { total: number; items: DashboardCustomer[] };
  unmatched: { total: number; items: DashboardRequest[] };
};

/** العرض الذي تُسجَّل عليه متابعة من اللوحة، ونص مقترح لملاحظتها. */
export type FollowupTarget = {
  kind: OperationsKind;
  listingId: number;
  listingLabel: string;
  notes?: string;
};

export type DashboardMatchingQuery = {
  kind: "all" | OperationsKind;
  q: string;
  page: number;
  page_size: number;
};
