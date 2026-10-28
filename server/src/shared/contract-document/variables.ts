/**
 * The canonical field schema: every `{{key}}` a contract can show, its Arabic
 * label and group, and how it resolves from the linked records and terms.
 * `resolveValues` is the one resolution step behind the editor preview, the
 * PDF, the Word file and printing.
 */
import {
  amountInWords,
  addMonths,
  formatAmount,
  formatContractDate,
  formatDuration,
  formatMoney,
} from "./format.js";
import {
  CURRENCY_LABELS,
  FREQUENCY_MONTHS,
  INSTALLMENT_FREQUENCY_LABELS,
  PARTY_ROLE_LABELS,
  RENT_PERIOD_LABELS,
  RENT_PERIOD_MONTHS,
  TEMPLATES,
  rolesOf,
  type AgreementContext,
  type AgreementKind,
  type AgreementMeta,
  type AgreementTerms,
  type CompanyRecord,
  type ListingRecord,
  type PartyRecord,
  type PartyRole,
  type TemplateKey,
} from "./model.js";

export type FieldGroup =
  | "contract"
  | PartyRole
  | "property"
  | "sale"
  | "installments"
  | "rent"
  | "witnesses"
  | "company";

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  contract: "العقد",
  seller: "البائع (الطرف الأول)",
  buyer: "المشتري (الطرف الثاني)",
  landlord: "المؤجر (الطرف الأول)",
  tenant: "المستأجر (الطرف الثاني)",
  property: "العقار",
  sale: "الثمن والتسليم",
  installments: "التقسيط",
  rent: "الإيجار",
  witnesses: "الشهود",
  company: "المكتب",
};

export type FieldDef = {
  key: string;
  label: string;
  group: FieldGroup;
  /** May be blank: renders "—" and does not hold up issuing. */
  optional?: boolean;
  /** Only these templates offer the field. */
  templates?: readonly TemplateKey[];
};

const SALE: readonly TemplateKey[] = ["sale", "installment_sale"];
const RENT: readonly TemplateKey[] = ["residential_rent", "commercial_rent"];

const PARTY_FIELDS: Array<[string, string, boolean?]> = [
  ["full_name", "الاسم الكامل"],
  ["national_id", "رقم البطاقة الوطنية"],
  ["residence_card", "رقم بطاقة السكن", true],
  ["phone", "رقم الهاتف"],
  ["phone_secondary", "هاتف آخر", true],
  ["email", "البريد الإلكتروني", true],
  ["address", "العنوان الكامل"],
  ["governorate", "المحافظة", true],
  ["district", "القضاء / المنطقة", true],
  ["neighborhood", "الحي / المحلة", true],
  ["alley", "الزقاق", true],
  ["house_number", "رقم الدار", true],
  ["person_type", "صفة الطرف (فرد / شركة)", true],
  ["representative_name", "اسم الوكيل أو الممثل", true],
  ["representative_capacity", "صفة الوكيل وسنده", true],
];

function partyFields(role: PartyRole): FieldDef[] {
  const templates = role === "seller" || role === "buyer" ? SALE : RENT;
  return PARTY_FIELDS.map(([field, label, optional]) => ({
    key: `${role}.${field}`,
    label: `${label} (${PARTY_ROLE_LABELS[role]})`,
    group: role,
    optional,
    templates,
  }));
}

export const FIELDS: FieldDef[] = [
  { key: "contract.number", label: "رقم العقد", group: "contract" },
  { key: "contract.title", label: "نوع العقد", group: "contract" },
  { key: "contract.date", label: "تاريخ العقد", group: "contract" },
  { key: "contract.place", label: "مكان تحرير العقد", group: "contract" },
  {
    key: "contract.revision",
    label: "رقم المراجعة",
    group: "contract",
    optional: true,
  },
  {
    key: "contract.commission",
    label: "عمولة المكتب",
    group: "contract",
    optional: true,
  },
  {
    key: "contract.commission_words",
    label: "عمولة المكتب كتابةً",
    group: "contract",
    optional: true,
  },
  {
    key: "contract.commission_terms",
    label: "شروط دفع العمولة",
    group: "contract",
    optional: true,
  },
  ...partyFields("seller"),
  ...partyFields("buyer"),
  ...partyFields("landlord"),
  ...partyFields("tenant"),
  { key: "property.code", label: "رمز العقار في المكتب", group: "property" },
  {
    key: "property.title",
    label: "اسم العرض",
    group: "property",
    optional: true,
  },
  { key: "property.type", label: "نوع العقار", group: "property" },
  {
    key: "property.legal_type",
    label: "جنس العقار (نوع السند)",
    group: "property",
    templates: SALE,
  },
  { key: "property.area", label: "المساحة مع الوحدة", group: "property" },
  { key: "property.address", label: "موقع العقار الكامل", group: "property" },
  {
    key: "property.governorate",
    label: "المحافظة",
    group: "property",
    optional: true,
  },
  {
    key: "property.district",
    label: "القضاء / المنطقة",
    group: "property",
    optional: true,
  },
  {
    key: "property.neighborhood",
    label: "الحي",
    group: "property",
    optional: true,
  },
  {
    key: "property.address_details",
    label: "تفاصيل العنوان",
    group: "property",
    optional: true,
  },
  {
    key: "property.plot",
    label: "رقم القطعة",
    group: "property",
    templates: SALE,
  },
  {
    key: "property.subdistrict",
    label: "المقاطعة (رقمها واسمها)",
    group: "property",
    templates: SALE,
  },
  {
    key: "property.mahalla",
    label: "المحلة",
    group: "property",
    optional: true,
  },
  {
    key: "property.alley",
    label: "الزقاق",
    group: "property",
    optional: true,
  },
  {
    key: "property.house_number",
    label: "رقم الدار",
    group: "property",
    optional: true,
  },
  {
    key: "property.landmark",
    label: "أقرب نقطة دالة",
    group: "property",
    optional: true,
  },
  {
    key: "property.street_width",
    label: "عرض الشارع",
    group: "property",
    optional: true,
    templates: SALE,
  },
  {
    key: "property.frontage",
    label: "الواجهة",
    group: "property",
    optional: true,
    templates: SALE,
  },
  {
    key: "property.nazal",
    label: "النزال (العمق)",
    group: "property",
    optional: true,
    templates: SALE,
  },
  {
    key: "property.rooms",
    label: "عدد الغرف",
    group: "property",
    optional: true,
  },
  {
    key: "property.bathrooms",
    label: "عدد الحمامات",
    group: "property",
    optional: true,
  },
  {
    key: "property.floors",
    label: "عدد الطوابق",
    group: "property",
    optional: true,
    templates: RENT,
  },
  {
    key: "property.details",
    label: "تفاصيل أخرى",
    group: "property",
    optional: true,
  },
  {
    key: "property.owner_name",
    label: "اسم المالك المسجل في العرض",
    group: "property",
    optional: true,
  },
  {
    key: "property.listed_price",
    label: "السعر المعروض",
    group: "property",
    optional: true,
  },
  { key: "sale.price", label: "ثمن البيع", group: "sale", templates: SALE },
  {
    key: "sale.price_words",
    label: "ثمن البيع كتابةً",
    group: "sale",
    templates: SALE,
  },
  { key: "sale.currency", label: "العملة", group: "sale" },
  {
    key: "sale.payment_terms",
    label: "طريقة دفع الثمن",
    group: "sale",
    templates: SALE,
  },
  {
    key: "sale.delivery_date",
    label: "تاريخ التسليم",
    group: "sale",
    templates: SALE,
  },
  {
    key: "sale.delivery_terms",
    label: "شروط التسليم",
    group: "sale",
    optional: true,
    templates: SALE,
  },
  {
    key: "installment.down_payment",
    label: "الدفعة المقدمة",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.down_payment_words",
    label: "الدفعة المقدمة كتابةً",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.remaining",
    label: "المبلغ المتبقي",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.remaining_words",
    label: "المبلغ المتبقي كتابةً",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.count",
    label: "عدد الأقساط",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.amount",
    label: "مبلغ القسط",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.amount_words",
    label: "مبلغ القسط كتابةً",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.frequency",
    label: "دورية القسط",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.first_due",
    label: "تاريخ استحقاق أول قسط",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.last_due",
    label: "تاريخ استحقاق آخر قسط",
    group: "installments",
    templates: ["installment_sale"],
  },
  {
    key: "installment.late_terms",
    label: "أحكام التأخر عن السداد",
    group: "installments",
    optional: true,
    templates: ["installment_sale"],
  },
  { key: "rent.amount", label: "بدل الإيجار", group: "rent", templates: RENT },
  {
    key: "rent.amount_words",
    label: "بدل الإيجار كتابةً",
    group: "rent",
    templates: RENT,
  },
  {
    key: "rent.period",
    label: "دورية دفع البدل",
    group: "rent",
    templates: RENT,
  },
  {
    key: "rent.start_date",
    label: "تاريخ بدء الإيجار",
    group: "rent",
    templates: RENT,
  },
  {
    key: "rent.end_date",
    label: "تاريخ انتهاء الإيجار",
    group: "rent",
    templates: RENT,
  },
  {
    key: "rent.duration",
    label: "مدة الإيجار",
    group: "rent",
    templates: RENT,
  },
  {
    key: "rent.payments_count",
    label: "عدد دفعات البدل",
    group: "rent",
    optional: true,
    templates: RENT,
  },
  {
    key: "rent.total",
    label: "مجموع البدل للمدة",
    group: "rent",
    optional: true,
    templates: RENT,
  },
  {
    key: "rent.deposit",
    label: "مبلغ التأمين",
    group: "rent",
    optional: true,
    templates: RENT,
  },
  {
    key: "rent.deposit_words",
    label: "مبلغ التأمين كتابةً",
    group: "rent",
    optional: true,
    templates: RENT,
  },
  {
    key: "rent.payment_due",
    label: "موعد دفع البدل",
    group: "rent",
    templates: RENT,
  },
  {
    key: "rent.renewal_terms",
    label: "شروط التجديد",
    group: "rent",
    optional: true,
    templates: RENT,
  },
  {
    key: "rent.notice_days",
    label: "مدة الإشعار بالإخلاء أو عدم التجديد",
    group: "rent",
    optional: true,
    templates: RENT,
  },
  {
    key: "rent.utilities",
    label: "الخدمات والفواتير",
    group: "rent",
    optional: true,
    templates: RENT,
  },
  {
    key: "rent.permitted_use",
    label: "الغرض المسموح من الإيجار",
    group: "rent",
    templates: ["commercial_rent"],
  },
  ...[1, 2].flatMap((n): FieldDef[] => [
    {
      key: `witness${n}.name`,
      label: `اسم الشاهد ${n === 1 ? "الأول" : "الثاني"}`,
      group: "witnesses",
      optional: true,
    },
    {
      key: `witness${n}.national_id`,
      label: `رقم هوية الشاهد ${n === 1 ? "الأول" : "الثاني"}`,
      group: "witnesses",
      optional: true,
    },
    {
      key: `witness${n}.address`,
      label: `عنوان الشاهد ${n === 1 ? "الأول" : "الثاني"}`,
      group: "witnesses",
      optional: true,
    },
  ]),
  { key: "company.name", label: "اسم المكتب", group: "company" },
  {
    key: "company.owner",
    label: "صاحب المكتب",
    group: "company",
    optional: true,
  },
  { key: "company.phone", label: "هاتف المكتب", group: "company" },
  {
    key: "company.phone_secondary",
    label: "هاتف آخر للمكتب",
    group: "company",
    optional: true,
  },
  {
    key: "company.email",
    label: "بريد المكتب",
    group: "company",
    optional: true,
  },
  {
    key: "company.address",
    label: "عنوان المكتب",
    group: "company",
    optional: true,
  },
  {
    key: "company.license",
    label: "رقم إجازة المكتب",
    group: "company",
    optional: true,
  },
  {
    key: "company.contact",
    label: "وسيلة تواصل إضافية",
    group: "company",
    optional: true,
  },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));

/** The fields a template offers, in picker order. */
export function fieldsFor(template: TemplateKey) {
  return FIELDS.filter(
    (field) => !field.templates || field.templates.includes(template),
  );
}

export function fieldLabel(key: string) {
  return FIELD_BY_KEY.get(key)?.label ?? key;
}

// ─── Picking contract-safe fields from API records ─────────────────────

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const num = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Only the customer fields a contract may show (no notes, no status). */
export function pickParty(record: Record<string, unknown>): PartyRecord {
  return {
    id: Number(record.id),
    code: text(record.code),
    full_name: text(record.full_name) ?? "",
    phone_primary: text(record.phone_primary),
    phone_secondary: text(record.phone_secondary),
    email: text(record.email),
    address: text(record.address),
    national_id: text(record.national_id),
    residence_card_number: text(record.residence_card_number),
    governorate: text(record.governorate),
    district: text(record.district),
    neighborhood: text(record.neighborhood),
    alley: text(record.alley),
    house_number: text(record.house_number),
    person_type: text(record.person_type),
  };
}

/** A sale or rental listing as the API returns it, without notes. */
export function pickListing(
  source: "property" | "rental",
  record: Record<string, unknown>,
): ListingRecord {
  const code = text(record.code) ?? "";
  // The API names an unnamed listing after its code ("عقار P-0001").
  const generated = `${source === "rental" ? "إيجار" : "عقار"} ${code}`;
  const name = text(record.name);
  return {
    source,
    id: Number(record.id),
    code,
    name: name === generated ? null : name,
    property_type: text(record.property_type),
    legal_type: text(record.legal_type),
    area_value: num(record.area_value),
    area_unit: text(record.area_unit),
    total_price: num(record.total_price),
    rent_price: num(record.rent_price),
    rent_period: text(record.rent_period),
    governorate:
      text(record.governorate_name) ??
      text(record.governorate_text) ??
      text(record.governorate),
    district:
      text(record.district_name) ??
      text(record.district_text) ??
      text(record.district),
    neighborhood:
      text(record.neighborhood_name) ??
      text(record.neighborhood_text) ??
      text(record.neighborhood),
    address_details: text(record.address_details),
    plot_number: text(record.plot_number),
    plot_letter: text(record.plot_letter),
    subdistrict_number: text(record.subdistrict_number),
    subdistrict_name: text(record.subdistrict_name),
    mahalla: text(record.mahalla),
    alley: text(record.alley),
    house_number: text(record.house_number),
    nearest_landmark: text(record.nearest_landmark),
    street_width: text(record.street_width),
    frontage: text(record.frontage),
    nazal: text(record.nazal),
    rooms_count: num(record.rooms_count),
    bathrooms_count: num(record.bathrooms_count),
    floors_count: num(record.floors_count),
    other_details: text(record.other_details),
    owner_name: text(record.owner_name),
    owner_phone: text(record.owner_phone),
    owner_person_id: num(record.owner_person_id),
  };
}

export function pickCompany(record: Record<string, unknown>): CompanyRecord {
  return {
    company_name: text(record.company_name),
    owner_name: text(record.owner_name),
    phone_primary: text(record.phone_primary),
    phone_secondary: text(record.phone_secondary),
    email: text(record.email),
    address: text(record.address),
    additional_contact: text(record.additional_contact),
    license_number: text(record.license_number),
  };
}

// ─── Rental property type labels (rentals store a key) ─────────────────

const RENTAL_TYPE_LABELS: Record<string, string> = {
  house: "بيت",
  apartment: "شقة",
  shop: "محل",
  office: "مكتب",
  land: "أرض غير محددة الاستخدام",
  warehouse: "مخزن",
  residential_land: "أرض سكنية",
  agricultural_land: "أرض زراعية / مزرعة",
  commercial: "عقار تجاري",
  building: "بناية",
  villa: "فيلا",
  other: "أخرى",
};

const PERSON_TYPE_LABELS: Record<string, string> = {
  individual: "فرد",
  company: "شركة",
  other: "أخرى",
};

// ─── Payment schedules ──────────────────────────────────────────────────

export type ScheduleRow = {
  index: number;
  due_date: string | null;
  amount: number;
  /** rent schedules: the period the payment covers */
  period_end?: string | null;
};

/** Installments after the down payment; the last one absorbs rounding. */
export function installmentSchedule(terms: AgreementTerms): ScheduleRow[] {
  const price = terms.sale_price ?? 0;
  const down = terms.down_payment ?? 0;
  const count = Math.floor(terms.installment_count ?? 0);
  const remaining = price - down;
  if (price <= 0 || count < 1 || remaining <= 0 || count > 600) return [];
  const amount = Math.floor(remaining / count);
  const step = FREQUENCY_MONTHS[terms.installment_frequency] ?? 1;
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    due_date: terms.first_due_date
      ? addMonths(terms.first_due_date, i * step)
      : null,
    amount: i === count - 1 ? remaining - amount * (count - 1) : amount,
  }));
}

/** One rent payment at the start of each period of the lease. */
export function rentSchedule(terms: AgreementTerms): ScheduleRow[] {
  const amount = terms.rent_amount ?? 0;
  if (amount <= 0 || !terms.start_date || !terms.end_date) return [];
  const step = RENT_PERIOD_MONTHS[terms.rent_period] ?? 1;
  const rows: ScheduleRow[] = [];
  let due: string | null = terms.start_date;
  while (due && due < terms.end_date && rows.length < 600) {
    const next = addMonths(due, step);
    rows.push({
      index: rows.length + 1,
      due_date: due,
      amount,
      period_end: next && next < terms.end_date ? next : terms.end_date,
    });
    due = next;
  }
  return rows;
}

export function scheduleFor(template: TemplateKey, terms: AgreementTerms) {
  if (template === "installment_sale") return installmentSchedule(terms);
  if (TEMPLATES[template].kind === "rent") return rentSchedule(terms);
  return [];
}

// ─── Resolution ─────────────────────────────────────────────────────────

/** Resolved display text by field key. A missing key means no value. */
export type FieldValues = Record<string, string>;

function joined(...parts: Array<string | null | undefined>) {
  const present = parts.filter((part): part is string => Boolean(part));
  return present.length ? present.join("، ") : null;
}

function partyAddress(party: PartyRecord) {
  return (
    party.address ??
    joined(
      party.governorate,
      party.district,
      party.neighborhood,
      party.alley ? `زقاق ${party.alley}` : null,
      party.house_number ? `دار ${party.house_number}` : null,
    )
  );
}

function listingType(listing: ListingRecord) {
  if (!listing.property_type) return null;
  return listing.source === "rental"
    ? (RENTAL_TYPE_LABELS[listing.property_type] ?? listing.property_type)
    : listing.property_type;
}

/** Same unit spellings as areaInSquareMeters in shared/utils/paging.ts. */
function areaUnitLabel(unit: string | null) {
  const value = unit?.trim() ?? "";
  if (["square_meter", "sqm", "m2", "متر", "متر مربع"].includes(value))
    return "متر مربع";
  if (["dunum", "donum", "دونم"].includes(value)) return "دونم";
  return value;
}

function listingAddress(listing: ListingRecord) {
  return joined(
    listing.governorate,
    listing.district,
    listing.neighborhood,
    listing.mahalla ? `محلة ${listing.mahalla}` : null,
    listing.alley ? `زقاق ${listing.alley}` : null,
    listing.house_number ? `دار ${listing.house_number}` : null,
    listing.address_details,
  );
}

function put(values: FieldValues, key: string, value: unknown) {
  if (value === null || value === undefined) return;
  const display =
    typeof value === "number" ? formatAmount(value) : String(value);
  if (display.trim()) values[key] = display.trim();
}

/**
 * Every field's display text for one contract. Pure: the same inputs give the
 * same text on the API (issuing, Word) and in the renderer (editor, PDF).
 */
export function resolveValues(
  meta: AgreementMeta,
  context: AgreementContext,
  terms: AgreementTerms,
): FieldValues {
  const values: FieldValues = {};
  const template = meta.template;
  const kind: AgreementKind = TEMPLATES[template].kind;
  const currency = terms.currency in CURRENCY_LABELS ? terms.currency : "IQD";
  const money = (amount: number | null | undefined) =>
    amount === null || amount === undefined
      ? null
      : formatMoney(amount, currency);
  const words = (amount: number | null | undefined) =>
    amount === null || amount === undefined
      ? null
      : amountInWords(amount, currency);

  put(values, "contract.number", meta.number);
  put(values, "contract.title", TEMPLATES[template].title);
  put(values, "contract.date", formatContractDate(terms.contract_date));
  put(values, "contract.place", terms.contract_place);
  put(values, "contract.revision", meta.revision);
  put(values, "contract.commission", money(terms.commission));
  put(values, "contract.commission_words", words(terms.commission));
  put(values, "contract.commission_terms", terms.commission_terms);

  for (const role of rolesOf(template)) {
    const party = context.parties[role];
    const representative = terms.representatives?.[role];
    put(values, `${role}.representative_name`, representative?.name);
    put(values, `${role}.representative_capacity`, representative?.capacity);
    if (!party) continue;
    put(values, `${role}.full_name`, party.full_name);
    put(values, `${role}.national_id`, party.national_id);
    put(values, `${role}.residence_card`, party.residence_card_number);
    put(values, `${role}.phone`, party.phone_primary);
    put(values, `${role}.phone_secondary`, party.phone_secondary);
    put(values, `${role}.email`, party.email);
    put(values, `${role}.address`, partyAddress(party));
    put(values, `${role}.governorate`, party.governorate);
    put(values, `${role}.district`, party.district);
    put(values, `${role}.neighborhood`, party.neighborhood);
    put(values, `${role}.alley`, party.alley);
    put(values, `${role}.house_number`, party.house_number);
    put(
      values,
      `${role}.person_type`,
      party.person_type
        ? (PERSON_TYPE_LABELS[party.person_type] ?? party.person_type)
        : null,
    );
  }

  const listing = context.listing;
  if (listing) {
    put(values, "property.code", listing.code);
    put(values, "property.title", listing.name);
    put(values, "property.type", listingType(listing));
    put(values, "property.legal_type", listing.legal_type);
    if (listing.area_value !== null)
      put(
        values,
        "property.area",
        `${formatAmount(listing.area_value)} ${areaUnitLabel(listing.area_unit)}`.trim(),
      );
    put(values, "property.address", listingAddress(listing));
    put(values, "property.governorate", listing.governorate);
    put(values, "property.district", listing.district);
    put(values, "property.neighborhood", listing.neighborhood);
    put(values, "property.address_details", listing.address_details);
    put(
      values,
      "property.plot",
      listing.plot_number
        ? `${listing.plot_number}${listing.plot_letter ? ` ${listing.plot_letter}` : ""}`
        : null,
    );
    put(
      values,
      "property.subdistrict",
      joined(listing.subdistrict_number, listing.subdistrict_name)?.replace(
        "، ",
        " ",
      ),
    );
    put(values, "property.mahalla", listing.mahalla);
    put(values, "property.alley", listing.alley);
    put(values, "property.house_number", listing.house_number);
    put(values, "property.landmark", listing.nearest_landmark);
    put(values, "property.street_width", listing.street_width);
    put(values, "property.frontage", listing.frontage);
    put(values, "property.nazal", listing.nazal);
    put(values, "property.rooms", listing.rooms_count);
    put(values, "property.bathrooms", listing.bathrooms_count);
    put(values, "property.floors", listing.floors_count);
    put(values, "property.details", listing.other_details);
    put(values, "property.owner_name", listing.owner_name);
    put(
      values,
      "property.listed_price",
      listing.source === "rental"
        ? listing.rent_price !== null
          ? formatMoney(listing.rent_price, "IQD")
          : null
        : listing.total_price !== null
          ? formatMoney(listing.total_price, "IQD")
          : null,
    );
  }

  put(values, "sale.currency", CURRENCY_LABELS[currency]);
  if (kind === "sale") {
    put(values, "sale.price", money(terms.sale_price));
    put(values, "sale.price_words", words(terms.sale_price));
    put(values, "sale.payment_terms", terms.payment_terms);
    put(values, "sale.delivery_date", formatContractDate(terms.delivery_date));
    put(values, "sale.delivery_terms", terms.delivery_terms);
  }

  if (template === "installment_sale") {
    const schedule = installmentSchedule(terms);
    const remaining =
      terms.sale_price !== null && terms.down_payment !== null
        ? terms.sale_price - terms.down_payment
        : null;
    put(values, "installment.down_payment", money(terms.down_payment));
    put(values, "installment.down_payment_words", words(terms.down_payment));
    put(values, "installment.remaining", money(remaining));
    put(values, "installment.remaining_words", words(remaining));
    put(values, "installment.count", terms.installment_count);
    if (schedule.length) {
      put(values, "installment.amount", money(schedule[0]!.amount));
      put(values, "installment.amount_words", words(schedule[0]!.amount));
      put(
        values,
        "installment.first_due",
        formatContractDate(schedule[0]!.due_date),
      );
      put(
        values,
        "installment.last_due",
        formatContractDate(schedule.at(-1)!.due_date),
      );
    }
    put(
      values,
      "installment.frequency",
      INSTALLMENT_FREQUENCY_LABELS[terms.installment_frequency],
    );
    put(values, "installment.late_terms", terms.late_terms);
  }

  if (kind === "rent") {
    const schedule = rentSchedule(terms);
    put(values, "rent.amount", money(terms.rent_amount));
    put(values, "rent.amount_words", words(terms.rent_amount));
    put(values, "rent.period", RENT_PERIOD_LABELS[terms.rent_period]);
    put(values, "rent.start_date", formatContractDate(terms.start_date));
    put(values, "rent.end_date", formatContractDate(terms.end_date));
    put(
      values,
      "rent.duration",
      formatDuration(terms.start_date, terms.end_date),
    );
    if (schedule.length) {
      put(values, "rent.payments_count", schedule.length);
      put(
        values,
        "rent.total",
        money(schedule.reduce((sum, row) => sum + row.amount, 0)),
      );
    }
    put(values, "rent.deposit", money(terms.deposit));
    put(values, "rent.deposit_words", words(terms.deposit));
    put(values, "rent.payment_due", terms.payment_due);
    put(values, "rent.renewal_terms", terms.renewal_terms);
    put(
      values,
      "rent.notice_days",
      terms.notice_days ? `${terms.notice_days} يوماً` : null,
    );
    put(values, "rent.utilities", terms.utilities_terms);
    if (template === "commercial_rent")
      put(values, "rent.permitted_use", terms.permitted_use);
  }

  (terms.witnesses ?? []).slice(0, 2).forEach((witness, index) => {
    put(values, `witness${index + 1}.name`, witness?.name);
    put(values, `witness${index + 1}.national_id`, witness?.national_id);
    put(values, `witness${index + 1}.address`, witness?.address);
  });

  const company = context.company;
  if (company) {
    put(values, "company.name", company.company_name);
    put(values, "company.owner", company.owner_name);
    put(values, "company.phone", company.phone_primary);
    put(values, "company.phone_secondary", company.phone_secondary);
    put(values, "company.email", company.email);
    put(values, "company.address", company.address);
    put(values, "company.license", company.license_number);
    put(values, "company.contact", company.additional_contact);
  }
  return values;
}
