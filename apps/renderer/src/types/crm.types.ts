export type PersonRecord = {
  id: number;
  code: string;
  full_name: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  national_id: string | null;
  person_type: "individual" | "company" | "other";
  status: "active" | "inactive" | "archived";
  notes: string | null;
  created_at: string;
  updated_at: string;
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
};
export type PurchaseRequestRecord = Omit<RentalRequestRecord, "rent_period">;

export type MatchReason = { field: string; label: string; matched: boolean; detail: string };
export type MatchResult<T = Record<string, unknown>> = { score: number; reasons: MatchReason[]; record: T };

export type DocumentTypeRecord = {
  id: number;
  key: string;
  name: string;
  transaction_scope: string;
  is_required: boolean;
  is_active: boolean;
};
export type DocumentRecord = {
  id: number;
  code: string;
  person_id: number;
  person_name: string | null;
  document_type_id: number | null;
  document_type_name: string | null;
  document_name: string;
  document_number: string | null;
  file_path: string;
  file_type: string;
  file_size: number | null;
  uploaded_at: string;
  expires_at: string | null;
  status: string;
  computed_status: string;
  notes: string | null;
};
export type CompanySettingsRecord = {
  id: number;
  company_name: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  additional_contact: string | null;
  license_number: string | null;
  logo_file_path: string | null;
};
export type OfficeProfileRecord = CompanySettingsRecord;

export type ContractTemplateRecord = {
  id: number;
  contract_type: "sale" | "rental";
  name: string;
  body: string;
  is_active: boolean;
};
export type ContractRecord = {
  id: number;
  code: string;
  contract_type: "sale" | "rental";
  property_id: number | null;
  rental_id: number | null;
  template_id: number | null;
  status: string;
  contract_date: string;
  start_date: string | null;
  end_date: string | null;
  amount: string | number | null;
  payment_info: Record<string, unknown>;
  notes: string | null;
  generated_content: string | null;
  generated_at: string | null;
  primary_person_name?: string | null;
  primary_party_role?: string | null;
};
export type ContractPartyBundle = {
  id: number;
  contract_id: number;
  person_id: number;
  role: string;
  person: PersonRecord;
  snapshot: PartySnapshot | null;
};
export type PartySnapshot = {
  id: number;
  contract_party_id: number;
  full_name: string;
  identity_number: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  captured_at: string;
};
export type ContractBundle = {
  contract: ContractRecord;
  template: ContractTemplateRecord | null;
  parties: ContractPartyBundle[];
  office: CompanySettingsRecord | null;
  asset: { id: number; contract_id: number; source_type: string; source_id: number; data: Record<string, unknown> } | null;
  attachments: Array<{
    id: number;
    contract_id: number;
    contract_party_id: number;
    identity_document_id: number;
    document_type: string | null;
    document_name: string;
    document_number: string | null;
    file_path: string;
    file_type: string;
    file_size: number | null;
  }>;
};
export type ContractValidation = {
  valid: boolean;
  issues: Array<{ code: string; message: string; path?: string }>;
  parties: Array<{ role: string; person: PersonRecord; documents: DocumentRecord[]; selected_document_ids: number[] }>;
};
