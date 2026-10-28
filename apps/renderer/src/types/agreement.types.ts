import type {
  AgreementContext,
  AgreementKind,
  AgreementTerms,
  CompanyRecord,
  ContractDocument,
  PartyRole,
  TemplateKey,
} from "@contract-document/index";

/** Contract status as the API enforces it (agreements.repository.ts). */
export type AgreementStatus = "draft" | "review" | "issued" | "cancelled";

export type AgreementTemplateSummary = {
  key: TemplateKey;
  title: string;
  kind: AgreementKind;
  category: string;
  description: string;
  is_customized: boolean;
  version: number;
  factory_revision: number;
  updated_at: string;
  updated_by_name: string | null;
};

export type AgreementTemplateRecord = AgreementTemplateSummary & {
  definition: ContractDocument;
  factory: ContractDocument;
  company: CompanyRecord | null;
};

export type AgreementTemplateVersion = {
  version: number;
  change_type: "saved" | "design_reset" | "full_reset" | "restored";
  note: string | null;
  is_factory: boolean;
  created_at: string;
  created_by_name: string | null;
};

export type AgreementTemplateVersionDetail = {
  version: number;
  change_type: string;
  created_at: string;
  definition: ContractDocument;
};

export type AgreementSortKey =
  "updated_at" | "created_at" | "code" | "status" | "contract_date";

export type AgreementListItem = {
  id: number;
  code: string;
  template_key: TemplateKey;
  title: string;
  status: AgreementStatus;
  current_revision: number;
  first_party_name: string | null;
  second_party_name: string | null;
  listing_code: string | null;
  listing_name: string | null;
  listing_type: string | null;
  contract_date: string | null;
  updated_at: string;
  created_at: string;
};

export type AgreementParty = {
  role: PartyRole;
  person_id: number;
  code: string;
  full_name: string;
  phone_primary: string | null;
};

export type AgreementRevisionSummary = {
  revision: number;
  reason: string | null;
  issued_at: string;
  issued_by_name: string | null;
};

export type AgreementExportRecord = {
  id: number;
  revision: number | null;
  format: "pdf" | "docx" | "print";
  file_name: string | null;
  created_at: string;
  created_by_name?: string | null;
};

export type AgreementRecord = {
  id: number;
  code: string;
  template_key: TemplateKey;
  title: string;
  kind: AgreementKind;
  status: AgreementStatus;
  property_id: number | null;
  rental_id: number | null;
  terms: AgreementTerms;
  document: ContractDocument;
  template_version: number;
  draft_rev: number;
  current_revision: number;
  issued_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  amend_reason: string | null;
  created_at: string;
  updated_at: string;
  parties: AgreementParty[];
  listing_label: string | null;
  context: AgreementContext;
  revisions: AgreementRevisionSummary[];
  exports: AgreementExportRecord[];
};

export type AgreementRevisionRecord = {
  revision: number;
  template_key: TemplateKey;
  document: ContractDocument;
  terms: AgreementTerms;
  context: AgreementContext;
  values: Record<string, string>;
  logo: string | null;
  reason: string | null;
  issued_at: string;
};

export type AgreementSaveResult = { draft_rev: number; updated_at: string };

export type AgreementDocxFile = {
  file_name: string;
  revision: number | null;
  data: string;
};

/** A draft save: only the parts that changed are sent. */
export type AgreementSavePayload = {
  base_rev: number;
  document?: ContractDocument;
  terms?: AgreementTerms;
  parties?: Array<{ role: PartyRole; person_id: number }>;
  property_id?: number | null;
  rental_id?: number | null;
};
