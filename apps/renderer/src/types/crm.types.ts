export type PersonRecord = {
  id: number;
  code: string;
  full_name: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  national_id: string | null;
  governorate?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  alley?: string | null;
  house_number?: string | null;
  residence_card_number?: string | null;
  person_type: "individual" | "company" | "other";
  status: "active" | "inactive" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** What the office deals with them as; PERSON_ROLES in constants/crm.ts. */
  roles: PersonRole[];
  source: PersonSource | null;
  assigned_user_id: number | null;
  assigned_user_name: string | null;
};

export type PersonRole =
  "buyer" | "seller" | "tenant" | "landlord" | "owner" | "investor" | "other";
export type PersonSource =
  "walk_in" | "phone" | "referral" | "social" | "listing_ad" | "other";

/** GET /people/:id: also the roles their records imply (owner, buyer…). */
export type PersonDetailRecord = PersonRecord & { implied_roles: string[] };

/** Another customer with one of the same phones or the same national ID. */
export type PersonDuplicate = {
  id: number;
  code: string;
  full_name: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  national_id: string | null;
  status: PersonRecord["status"];
  matched_on: Array<"phone" | "national_id">;
};

export type RentalRequestRecord = {
  id: number;
  code: string;
  person_id: number;
  person_name: string | null;
  person_code: string | null;
  customer_name?: string | null;
  customer_code?: string | null;
  property_type: string;
  rent_period: string | null;
  budget_min: string | number | null;
  budget_max: string | number | null;
  area_unit: string | null;
  area_min: string | number | null;
  area_max: string | number | null;
  floors_count: number | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  governorate_id: number | null;
  district_id: number | null;
  neighborhood_id: number | null;
  governorate: string | null;
  district: string | null;
  neighborhood: string | null;
  amenities: Record<string, unknown>;
  other_requirements: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
export type PurchaseRequestRecord = Omit<RentalRequestRecord, "rent_period">;

/** مفاتيح الترتيب في /people/paged (PERSON_SORT_KEYS في الخادم). */
export type PersonSortKey =
  | "updated_at"
  | "created_at"
  | "full_name"
  | "code"
  | "phone_primary"
  | "person_type"
  | "status";

/** مفاتيح الترتيب في /rental-requests/paged (RENTAL_REQUEST_SORT_KEYS في الخادم). */
export type RentalRequestSortKey =
  | "updated_at"
  | "created_at"
  | "code"
  | "person_name"
  | "property_type"
  | "rent_period"
  | "budget_max"
  | "district"
  | "status";

/** مفاتيح /purchase-requests/paged: نفسها بلا نوع الإيجار. */
export type PurchaseRequestSortKey = Exclude<
  RentalRequestSortKey,
  "rent_period"
>;

export type MatchReason = {
  field: string;
  label: string;
  matched: boolean;
  detail: string;
  /** شرط أساسي (النوع، الموقع، الميزانية، نوع الإيجار) لا تفضيل. */
  required: boolean;
};
export type MatchResult<T = Record<string, unknown>> = {
  score: number;
  reasons: MatchReason[];
  /** كل الشروط الأساسية متحققة: مطابقة كاملة. */
  required_met: boolean;
  preferences_met: number;
  preferences_total: number;
  record: T;
};

export type DocumentTypeRecord = {
  id: number;
  key: string;
  name: string;
  transaction_scope: string;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type DocumentRecord = {
  id: number;
  code: string;
  person_id: number;
  person_name: string | null;
  /** The contract this is a signed copy or supporting file of. */
  agreement_id: number | null;
  document_type_id: number | null;
  document_type_name: string | null;
  document_name: string;
  document_number: string | null;
  document_side?: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  uploaded_at: string;
  expires_at: string | null;
  status: string;
  computed_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** مفاتيح الترتيب في /documents/paged (DOCUMENT_SORT_KEYS في الخادم). */
export type DocumentSortKey =
  | "uploaded_at"
  | "expires_at"
  | "code"
  | "person_name"
  | "document_type_name"
  | "document_name"
  | "document_number"
  | "computed_status";
export type CompanySettingsRecord = {
  id: number;
  company_name: string;
  owner_name?: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  additional_contact: string | null;
  license_number: string | null;
  logo_file_path: string | null;
  created_at: string;
  updated_at: string;
};
export type OfficeProfileRecord = CompanySettingsRecord;
