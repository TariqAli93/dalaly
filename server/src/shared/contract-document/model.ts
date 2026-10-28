/**
 * The contract document model, shared by the API and the renderer (the
 * renderer imports this folder through the `@contract-document` alias). A
 * document is an ordered list of blocks that flow down A4 pages, plus the
 * clause list the `clauses` block renders. Nothing here is positioned
 * absolutely: text grows, and pages break between flow units.
 *
 * Pure TypeScript with no Node or DOM APIs, so both sides can run it.
 */

export const DOCUMENT_SCHEMA = 1;

/** The four built-in templates. There is no way to add a fifth. */
export const TEMPLATE_KEYS = [
  "sale",
  "installment_sale",
  "residential_rent",
  "commercial_rent",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type AgreementKind = "sale" | "rent";

export const TEMPLATES: Record<
  TemplateKey,
  { title: string; kind: AgreementKind; category: string; description: string }
> = {
  sale: {
    title: "عقد بيع عقار",
    kind: "sale",
    category: "بيع",
    description: "بيع بثمن يُدفع كاملاً، مع التسليم والضمان والتوقيعات.",
  },
  installment_sale: {
    title: "عقد بيع عقار بالتقسيط",
    kind: "sale",
    category: "بيع",
    description: "بيع بدفعة مقدمة وأقساط بمواعيد محددة وجدول للسداد.",
  },
  residential_rent: {
    title: "عقد إيجار سكني",
    kind: "rent",
    category: "إيجار",
    description: "إيجار للسكن ببدل شهري أو نصف سنوي أو سنوي وتأمين.",
  },
  commercial_rent: {
    title: "عقد إيجار تجاري",
    kind: "rent",
    category: "إيجار",
    description: "إيجار لنشاط تجاري محدد الغرض والمدة والبدل.",
  },
};

export function isTemplateKey(value: unknown): value is TemplateKey {
  return (
    typeof value === "string" &&
    (TEMPLATE_KEYS as readonly string[]).includes(value)
  );
}

export type PartyRole = "seller" | "buyer" | "landlord" | "tenant";

/** First party, then second party, for each kind. */
export const PARTY_ROLES: Record<
  AgreementKind,
  readonly [PartyRole, PartyRole]
> = {
  sale: ["seller", "buyer"],
  rent: ["landlord", "tenant"],
};

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  seller: "البائع",
  buyer: "المشتري",
  landlord: "المؤجر",
  tenant: "المستأجر",
};

export function rolesOf(template: TemplateKey) {
  return PARTY_ROLES[TEMPLATES[template].kind];
}

// ─── Rich text ──────────────────────────────────────────────────────────

export type Marks = { bold?: boolean; italic?: boolean; underline?: boolean };
export type TextRun = Marks & { type: "text"; text: string };
/** A dynamic value, resolved at render time from the contract's data. */
export type FieldRun = Marks & { type: "field"; key: string };
export type Run = TextRun | FieldRun;
/** One paragraph; "\n" inside a text run is a line break. */
export type Paragraph = Run[];
export type RichText = Paragraph[];

// ─── Styling ────────────────────────────────────────────────────────────

/** Logical alignment: start is the right edge in Arabic. */
export type Align = "start" | "center" | "end" | "justify";

export type BorderStyle = {
  /** pt */
  width: number;
  color: string;
  style: "solid" | "dashed" | "double";
  sides: "all" | "top" | "bottom" | "block";
};

/** Overrides on top of the document theme. Sizes in pt, lengths in mm. */
export type BlockStyle = {
  font_family?: string;
  font_size?: number;
  bold?: boolean;
  color?: string;
  align?: Align;
  line_height?: number;
  space_before?: number;
  space_after?: number;
  /** mm, from the start edge */
  indent?: number;
  /** mm, inside the border */
  padding?: number;
  border?: BorderStyle | null;
  background?: string | null;
  /** percent of the text width (tables and signatures) */
  width?: number;
};

// ─── Blocks ─────────────────────────────────────────────────────────────

type BlockBase = {
  id: string;
  style?: BlockStyle;
  /** Kept in the document, left out of every rendering. */
  hidden?: boolean;
  /** Part of the template's structure: it can be hidden but not removed. */
  required?: boolean;
};

export type LetterheadBlock = BlockBase & {
  type: "letterhead";
  start: RichText;
  end: RichText;
  logo: boolean;
  /** mm */
  logo_width: number;
};
export type HeadingBlock = BlockBase & {
  type: "heading";
  level: 1 | 2 | 3;
  text: Paragraph;
};
export type TextBlock = BlockBase & { type: "text"; text: RichText };
/** Where the clause list is rendered. Exactly one per document. */
export type ClausesBlock = BlockBase & { type: "clauses" };
export type TableBlock = BlockBase & {
  type: "table";
  rows: RichText[][];
  header_row: boolean;
  /** relative column widths, one per column */
  widths: number[];
  borders: boolean;
};
/** The installment or rent payment table, computed from the terms. */
export type ScheduleBlock = BlockBase & { type: "schedule" };
export type Signer = { id: string; title: Paragraph; name: Paragraph };
export type SignaturesBlock = BlockBase & {
  type: "signatures";
  signers: Signer[];
  show_date: boolean;
};
export type ImageBlock = BlockBase & {
  type: "image";
  /** "logo" is the office logo from Settings; "embedded" carries its data. */
  source: "logo" | "embedded";
  data?: string | null;
  /** mm */
  width: number;
  align: Align;
};
export type SeparatorBlock = BlockBase & { type: "separator" };
export type PageBreakBlock = BlockBase & { type: "page_break" };

export type Block =
  | LetterheadBlock
  | HeadingBlock
  | TextBlock
  | ClausesBlock
  | TableBlock
  | ScheduleBlock
  | SignaturesBlock
  | ImageBlock
  | SeparatorBlock
  | PageBreakBlock;
export type BlockType = Block["type"];

export const BLOCK_LABELS: Record<BlockType, string> = {
  letterhead: "ترويسة العقد",
  heading: "عنوان",
  text: "فقرة",
  clauses: "البنود",
  table: "جدول",
  schedule: "جدول الدفعات",
  signatures: "التوقيعات",
  image: "صورة",
  separator: "خط فاصل",
  page_break: "فاصل صفحة",
};

// ─── Clauses ────────────────────────────────────────────────────────────

export type Clause = {
  /** Stable across edits and reorders. */
  id: string;
  title: Paragraph;
  body: RichText;
  /** Counted in the automatic numbering. */
  numbered: boolean;
  hidden?: boolean;
  /** A template clause the contract cannot do without (can be reworded). */
  required?: boolean;
  /** The factory clause this one started from, for "restore clauses". */
  origin?: string | null;
};

export type ClauseNumbering = "ordinal" | "number" | "none";

export type ClauseSettings = {
  numbering: ClauseNumbering;
  /** Word before the number: "البند" → "البند الأول". */
  prefix: string;
  title_style: BlockStyle;
  body_style: BlockStyle;
};

// ─── Page ───────────────────────────────────────────────────────────────

export type PageSetup = {
  size: "A4";
  /** mm */
  margins: { top: number; bottom: number; start: number; end: number };
};

/** Repeated on every page, inside the top or bottom margin. */
export type PageBand = {
  enabled: boolean;
  text: Paragraph;
  align: Align;
  /** pt */
  font_size: number;
  /** footer only: "صفحة 1 من 3" */
  page_numbers?: boolean;
};

export type Theme = {
  font_family: string;
  /** pt */
  font_size: number;
  line_height: number;
  color: string;
  /** headings, rules and table headers */
  accent: string;
  /** pt between paragraphs */
  paragraph_spacing: number;
};

export type ContractDocument = {
  schema: typeof DOCUMENT_SCHEMA;
  page: PageSetup;
  header: PageBand;
  footer: PageBand;
  theme: Theme;
  clause_settings: ClauseSettings;
  blocks: Block[];
  clauses: Clause[];
};

export const PAGE_SIZES = { A4: { width: 210, height: 297 } } as const;

/**
 * Fonts the inspector offers. Bundled fonts ship with the app and are
 * embedded in PDFs; the Windows fonts are what Word documents fall back to.
 */
export const BUNDLED_FONTS = [
  "IBM Plex Sans Arabic",
  "Tajawal",
  "Almarai",
  "Cairo",
] as const;
export const SYSTEM_FONTS = [
  "Tahoma",
  "Arial",
  "Times New Roman",
  "Traditional Arabic",
  "Simplified Arabic",
  "Sakkal Majalla",
] as const;
export const DEFAULT_FONT = "IBM Plex Sans Arabic";

// ─── Transaction data ───────────────────────────────────────────────────

export type Currency = "IQD" | "USD";
export const CURRENCY_LABELS: Record<Currency, string> = {
  IQD: "دينار عراقي",
  USD: "دولار أمريكي",
};

export type InstallmentFrequency =
  "monthly" | "quarterly" | "semi_annual" | "annual";
export const INSTALLMENT_FREQUENCY_LABELS: Record<
  InstallmentFrequency,
  string
> = {
  monthly: "شهري",
  quarterly: "كل ثلاثة أشهر",
  semi_annual: "نصف سنوي",
  annual: "سنوي",
};
export const FREQUENCY_MONTHS: Record<InstallmentFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
};

/** Same values as the rentals' rent_period. */
export type RentPeriod = "monthly" | "semi_annual" | "annual";
export const RENT_PERIOD_LABELS: Record<RentPeriod, string> = {
  monthly: "شهري",
  semi_annual: "نصف سنوي",
  annual: "سنوي",
};
export const RENT_PERIOD_MONTHS: Record<RentPeriod, number> = {
  monthly: 1,
  semi_annual: 6,
  annual: 12,
};

export type Representative = { name: string | null; capacity: string | null };
export type Witness = {
  name: string | null;
  national_id: string | null;
  address: string | null;
};

/**
 * The deal itself: amounts, dates and conditions. Dates are YYYY-MM-DD.
 * Every template stores the same shape; each reads the fields it needs.
 */
export type AgreementTerms = {
  contract_date: string | null;
  contract_place: string | null;
  currency: Currency;
  sale_price: number | null;
  payment_terms: string | null;
  delivery_date: string | null;
  delivery_terms: string | null;
  down_payment: number | null;
  installment_count: number | null;
  installment_frequency: InstallmentFrequency;
  first_due_date: string | null;
  late_terms: string | null;
  rent_amount: number | null;
  rent_period: RentPeriod;
  start_date: string | null;
  end_date: string | null;
  deposit: number | null;
  payment_due: string | null;
  renewal_terms: string | null;
  notice_days: number | null;
  utilities_terms: string | null;
  permitted_use: string | null;
  commission: number | null;
  commission_terms: string | null;
  representatives: Partial<Record<PartyRole, Representative>>;
  witnesses: Witness[];
};

export function emptyTerms(today: string | null = null): AgreementTerms {
  return {
    contract_date: today,
    contract_place: null,
    currency: "IQD",
    sale_price: null,
    payment_terms: null,
    delivery_date: null,
    delivery_terms: null,
    down_payment: null,
    installment_count: null,
    installment_frequency: "monthly",
    first_due_date: null,
    late_terms: null,
    rent_amount: null,
    rent_period: "monthly",
    start_date: null,
    end_date: null,
    deposit: null,
    payment_due: null,
    renewal_terms: null,
    notice_days: null,
    utilities_terms: null,
    permitted_use: null,
    commission: null,
    commission_terms: null,
    representatives: {},
    witnesses: [],
  };
}

// ─── Linked records ─────────────────────────────────────────────────────

/** The customer fields a contract may show. Notes and status never are. */
export type PartyRecord = {
  id: number;
  code: string | null;
  full_name: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  national_id: string | null;
  residence_card_number: string | null;
  governorate: string | null;
  district: string | null;
  neighborhood: string | null;
  alley: string | null;
  house_number: string | null;
  person_type: string | null;
};

/** A sale listing (properties) or a rental listing (rentals). */
export type ListingRecord = {
  source: "property" | "rental";
  id: number;
  code: string;
  name: string | null;
  property_type: string | null;
  legal_type: string | null;
  area_value: number | null;
  area_unit: string | null;
  total_price: number | null;
  rent_price: number | null;
  rent_period: string | null;
  governorate: string | null;
  district: string | null;
  neighborhood: string | null;
  address_details: string | null;
  plot_number: string | null;
  plot_letter: string | null;
  subdistrict_number: string | null;
  subdistrict_name: string | null;
  mahalla: string | null;
  alley: string | null;
  house_number: string | null;
  nearest_landmark: string | null;
  street_width: string | null;
  frontage: string | null;
  nazal: string | null;
  rooms_count: number | null;
  bathrooms_count: number | null;
  floors_count: number | null;
  other_details: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  /** The owner in the customers, offered as the first party (not printed). */
  owner_person_id: number | null;
};

export type CompanyRecord = {
  company_name: string | null;
  owner_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  address: string | null;
  additional_contact: string | null;
  license_number: string | null;
};

/**
 * Everything a contract's fields resolve from besides its terms. A draft
 * reads it live from the linked records; an issued revision stores it.
 */
export type AgreementContext = {
  parties: Partial<Record<PartyRole, PartyRecord | null>>;
  listing: ListingRecord | null;
  company: CompanyRecord | null;
};

export type AgreementMeta = {
  template: TemplateKey;
  number: string | null;
  revision: number | null;
};

// ─── Small helpers ──────────────────────────────────────────────────────

let idCounter = 0;
/** A short id that is unique within a document. */
export function newId(prefix = "b") {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
