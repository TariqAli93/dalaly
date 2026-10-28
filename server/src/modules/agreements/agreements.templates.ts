/**
 * Factory definitions of the four built-in contract templates. They live in
 * code, frozen, so they are immutable and versioned with the app; the
 * database holds only an office's customised copy (null = use these).
 *
 * The clause wording is editable starter text for an Iraqi brokerage office,
 * not legally reviewed text: each clause is a separate, titled unit so a
 * qualified lawyer can review and replace it.
 */
import {
  DEFAULT_FONT,
  DOCUMENT_SCHEMA,
  PARTY_ROLE_LABELS,
  deepClone,
  para,
  rich,
  type Block,
  type Clause,
  type ContractDocument,
  type PartyRole,
  type RichText,
  type TemplateKey,
} from "../../shared/contract-document/index.js";

function clause(
  id: string,
  title: string,
  body: string,
  options: { required?: boolean; hidden?: boolean } = {},
): Clause {
  return {
    id,
    title: para(title),
    body: rich(body),
    numbered: true,
    origin: id,
    ...(options.required ? { required: true } : {}),
    ...(options.hidden ? { hidden: true } : {}),
  };
}

const row = (...cells: string[]): RichText[] => cells.map((cell) => rich(cell));

function base(
  prefix: string,
  blocks: Block[],
  clauses: Clause[],
): ContractDocument {
  return {
    schema: DOCUMENT_SCHEMA,
    page: { size: "A4", margins: { top: 18, bottom: 20, start: 18, end: 18 } },
    header: {
      enabled: false,
      text: para(
        "{{company.name}} — {{contract.title}} رقم {{contract.number}}",
      ),
      align: "center",
      font_size: 8.5,
    },
    footer: {
      enabled: true,
      text: para("{{contract.title}} رقم {{contract.number}}"),
      align: "center",
      font_size: 8.5,
      page_numbers: true,
    },
    theme: {
      font_family: DEFAULT_FONT,
      font_size: 11.5,
      line_height: 1.75,
      color: "#1a1a1a",
      accent: "#1f4e5f",
      paragraph_spacing: 5,
    },
    clause_settings: {
      numbering: "ordinal",
      prefix: "البند",
      title_style: {},
      body_style: {},
    },
    blocks: blocks.map((block) => ({ ...block, id: `${prefix}-${block.id}` })),
    // Clause ids have their own prefix: a clause and a block may share a name.
    clauses: clauses.map((item) => ({
      ...item,
      id: `${prefix}-clause-${item.id}`,
      origin: `${prefix}-clause-${item.id}`,
    })),
  };
}

function letterhead(): Block {
  return {
    id: "letterhead",
    type: "letterhead",
    required: true,
    start: rich(
      "**{{company.name}}**\n\n{{company.address}}\n\nهاتف: {{company.phone}}",
    ),
    end: rich(
      "رقم العقد: **{{contract.number}}**\n\nالتاريخ: {{contract.date}}\n\nمكان التحرير: {{contract.place}}",
    ),
    logo: true,
    logo_width: 26,
  };
}

function partiesTable(first: PartyRole, second: PartyRole): Block {
  return {
    id: "parties",
    type: "table",
    header_row: true,
    borders: true,
    widths: [1, 1],
    rows: [
      row(
        `الطرف الأول (${PARTY_ROLE_LABELS[first]})`,
        `الطرف الثاني (${PARTY_ROLE_LABELS[second]})`,
      ),
      row(
        `الاسم: **{{${first}.full_name}}**`,
        `الاسم: **{{${second}.full_name}}**`,
      ),
      row(
        `رقم البطاقة الوطنية: {{${first}.national_id}}`,
        `رقم البطاقة الوطنية: {{${second}.national_id}}`,
      ),
      row(`العنوان: {{${first}.address}}`, `العنوان: {{${second}.address}}`),
      row(`الهاتف: {{${first}.phone}}`, `الهاتف: {{${second}.phone}}`),
      row(
        `الوكيل أو الممثل: {{${first}.representative_name}}`,
        `الوكيل أو الممثل: {{${second}.representative_name}}`,
      ),
    ],
  };
}

function signatures(first: PartyRole, second: PartyRole): Block {
  return {
    id: "signatures",
    type: "signatures",
    required: true,
    show_date: false,
    signers: [
      {
        id: "first",
        title: para(`الطرف الأول (${PARTY_ROLE_LABELS[first]})`),
        name: para(`{{${first}.full_name}}`),
      },
      {
        id: "second",
        title: para(`الطرف الثاني (${PARTY_ROLE_LABELS[second]})`),
        name: para(`{{${second}.full_name}}`),
      },
      {
        id: "witness1",
        title: para("الشاهد الأول"),
        name: para("{{witness1.name}}"),
      },
      {
        id: "witness2",
        title: para("الشاهد الثاني"),
        name: para("{{witness2.name}}"),
      },
    ],
  };
}

const closing = (copies: string): Block => ({
  id: "closing",
  type: "text",
  text: rich(
    `حُرر هذا العقد في {{contract.place}} بتاريخ {{contract.date}} من ${copies}، وبعد تلاوته وفهم مضمونه وقّعه الطرفان والشهود.`,
  ),
});

// ─── Sale ───────────────────────────────────────────────────────────────

function saleBlocks(withSchedule: boolean): Block[] {
  return [
    letterhead(),
    {
      id: "title",
      type: "heading",
      level: 1,
      required: true,
      text: para("{{contract.title}}"),
    },
    {
      id: "intro",
      type: "text",
      text: rich(
        "إنه في يوم {{contract.date}}، في مدينة {{contract.place}}، وبحضور مكتب {{company.name}}، تم الاتفاق بين كل من:",
      ),
    },
    partiesTable("seller", "buyer"),
    {
      id: "property-title",
      type: "heading",
      level: 2,
      text: para("أوصاف العقار المبيع"),
    },
    {
      id: "property",
      type: "table",
      header_row: false,
      borders: true,
      widths: [1, 2],
      rows: [
        row("نوع العقار", "{{property.type}}"),
        row("جنس العقار", "{{property.legal_type}}"),
        row("رقم القطعة", "{{property.plot}}"),
        row("المقاطعة", "{{property.subdistrict}}"),
        row("المساحة", "{{property.area}}"),
        row("الموقع", "{{property.address}}"),
      ],
    },
    {
      id: "preamble",
      type: "text",
      text: rich(
        "وقد اتفق الطرفان، وهما بكامل الأهلية المعتبرة شرعاً وقانوناً، على ما يأتي:",
      ),
    },
    { id: "clauses", type: "clauses", required: true },
    ...(withSchedule
      ? ([
          {
            id: "schedule-title",
            type: "heading",
            level: 2,
            text: para("جدول الأقساط"),
          },
          { id: "schedule", type: "schedule" },
        ] as Block[])
      : []),
    closing("ثلاث نسخ أصلية، بيد كل طرف نسخة ونسخة لدى المكتب"),
    signatures("seller", "buyer"),
  ];
}

const SALE_COMMON = {
  preamble: clause(
    "preamble",
    "التمهيد",
    "يُعدّ التمهيد أعلاه وبيانات الطرفين وأوصاف العقار جزءاً لا يتجزأ من هذا العقد ويُقرأ معه.",
  ),
  subject: clause(
    "subject",
    "موضوع العقد",
    "باع الطرف الأول إلى الطرف الثاني العقار الموصوف أعلاه ({{property.type}}، القطعة المرقمة {{property.plot}} مقاطعة {{property.subdistrict}}، بمساحة {{property.area}}) بكامل حدوده وحقوقه ومرافقه، وقبل الطرف الثاني الشراء.",
    { required: true },
  ),
  price: clause(
    "price",
    "ثمن البيع",
    "اتفق الطرفان على أن ثمن البيع هو **{{sale.price}}** ({{sale.price_words}})، وهو ثمن نهائي لا يقبل الزيادة أو النقصان.",
    { required: true },
  ),
  inspection: clause(
    "inspection",
    "المعاينة",
    "يقر الطرف الثاني بأنه عاين العقار المعاينة التامة النافية للجهالة، وقبله بحالته الراهنة.",
  ),
  warranty: clause(
    "warranty",
    "الضمان",
    "يقر الطرف الأول بأن العقار مملوك له ملكية تامة، وخالٍ من أي رهن أو حجز أو حق للغير، ويضمن للطرف الثاني عدم التعرض له في الانتفاع بالعقار.",
  ),
  taxes: clause(
    "taxes",
    "الضرائب والرسوم",
    "يتحمل الطرف الأول الضرائب والرسوم والمستحقات المترتبة على العقار حتى تاريخ التسليم، ويتحملها الطرف الثاني بعده.",
  ),
  commission: clause(
    "commission",
    "عمولة المكتب",
    "يستحق مكتب {{company.name}} عمولة قدرها {{contract.commission}} عن هذه الصفقة، تُدفع وفق ما يأتي: {{contract.commission_terms}}.",
    { hidden: true },
  ),
  breach: clause(
    "breach",
    "الإخلال بالالتزامات",
    "إذا أخلّ أحد الطرفين بأي من التزاماته الواردة في هذا العقد، حق للطرف الآخر المطالبة بالتنفيذ أو بالفسخ مع التعويض عن الضرر، وفق أحكام القانون المدني العراقي.",
  ),
  disputes: clause(
    "disputes",
    "حل النزاعات",
    "يسعى الطرفان إلى حل أي خلاف ينشأ عن تفسير هذا العقد أو تنفيذه ودياً، فإن تعذر ذلك فالاختصاص للمحاكم العراقية المختصة.",
  ),
};

const SALE_DOCUMENT = base("sale", saleBlocks(false), [
  SALE_COMMON.preamble,
  SALE_COMMON.subject,
  SALE_COMMON.price,
  clause(
    "payment",
    "طريقة الدفع",
    "يُدفع الثمن على النحو الآتي: {{sale.payment_terms}}، ويُعدّ توقيع الطرف الأول على هذا العقد إقراراً منه باستلام ما دُفع عند التوقيع.",
  ),
  clause(
    "delivery",
    "التسليم",
    "يلتزم الطرف الأول بتسليم العقار إلى الطرف الثاني خالياً من الشواغل في موعد أقصاه {{sale.delivery_date}}.",
  ),
  clause(
    "registration",
    "نقل الملكية",
    "يلتزم الطرف الأول بالحضور أمام دائرة التسجيل العقاري المختصة لإتمام معاملة نقل ملكية العقار إلى الطرف الثاني خلال مدة لا تتجاوز ثلاثين يوماً من تاريخ استلام كامل الثمن، ويتحمل الطرف الثاني رسوم التسجيل ما لم يُتفق على خلاف ذلك.",
  ),
  SALE_COMMON.inspection,
  SALE_COMMON.warranty,
  SALE_COMMON.taxes,
  SALE_COMMON.commission,
  SALE_COMMON.breach,
  SALE_COMMON.disputes,
]);

const INSTALLMENT_DOCUMENT = base("installment", saleBlocks(true), [
  SALE_COMMON.preamble,
  SALE_COMMON.subject,
  SALE_COMMON.price,
  clause(
    "down-payment",
    "الدفعة المقدمة",
    "دفع الطرف الثاني عند توقيع هذا العقد دفعة مقدمة مقدارها **{{installment.down_payment}}** ({{installment.down_payment_words}})، ويُعدّ توقيع الطرف الأول إقراراً منه باستلامها.",
    { required: true },
  ),
  clause(
    "installments",
    "الأقساط",
    "يُسدَّد المبلغ المتبقي وقدره **{{installment.remaining}}** ({{installment.remaining_words}}) على أقساط عددها {{installment.count}}، مبلغ كل قسط {{installment.amount}} ({{installment.amount_words}})، بدورية {{installment.frequency}}، يستحق أولها في {{installment.first_due}} وآخرها في {{installment.last_due}}، وفق جدول الأقساط الملحق بهذا العقد.\n\nيُعدّ إيصال الاستلام الموقّع من الطرف الأول دليلاً على سداد القسط.",
    { required: true },
  ),
  clause(
    "late",
    "التأخر عن السداد",
    "إذا تأخر الطرف الثاني عن سداد أي قسط في موعده يُنذَر كتابياً، فإن تأخر عن سداد قسطين متتاليين جاز للطرف الأول المطالبة بكامل المبلغ المتبقي دفعة واحدة أو فسخ العقد مع التعويض.",
  ),
  clause(
    "delivery",
    "التسليم",
    "يلتزم الطرف الأول بتسليم العقار إلى الطرف الثاني خالياً من الشواغل في موعد أقصاه {{sale.delivery_date}}.",
  ),
  clause(
    "registration",
    "نقل الملكية",
    "لا تُنقل ملكية العقار في دائرة التسجيل العقاري إلا بعد سداد كامل الأقساط، ويلتزم الطرف الأول بإتمام معاملة النقل خلال ثلاثين يوماً من تاريخ سداد آخر قسط.",
  ),
  SALE_COMMON.inspection,
  SALE_COMMON.warranty,
  SALE_COMMON.taxes,
  SALE_COMMON.commission,
  SALE_COMMON.breach,
  SALE_COMMON.disputes,
]);

// ─── Rent ───────────────────────────────────────────────────────────────

function rentBlocks(): Block[] {
  return [
    letterhead(),
    {
      id: "title",
      type: "heading",
      level: 1,
      required: true,
      text: para("{{contract.title}}"),
    },
    {
      id: "intro",
      type: "text",
      text: rich(
        "إنه في يوم {{contract.date}}، في مدينة {{contract.place}}، وبحضور مكتب {{company.name}}، تم الاتفاق بين كل من:",
      ),
    },
    partiesTable("landlord", "tenant"),
    {
      id: "property-title",
      type: "heading",
      level: 2,
      text: para("أوصاف المأجور"),
    },
    {
      id: "property",
      type: "table",
      header_row: false,
      borders: true,
      widths: [1, 2],
      rows: [
        row("نوع العقار", "{{property.type}}"),
        row("الموقع", "{{property.address}}"),
        row("المساحة", "{{property.area}}"),
        row("عدد الغرف", "{{property.rooms}}"),
        row("عدد الطوابق", "{{property.floors}}"),
      ],
    },
    {
      id: "terms",
      type: "table",
      header_row: false,
      borders: true,
      widths: [1, 2],
      rows: [
        row("مدة الإيجار", "{{rent.duration}}"),
        row("تبدأ في", "{{rent.start_date}}"),
        row("تنتهي في", "{{rent.end_date}}"),
        row("بدل الإيجار", "**{{rent.amount}}** — {{rent.period}}"),
        row("مبلغ التأمين", "{{rent.deposit}}"),
      ],
    },
    {
      id: "preamble",
      type: "text",
      text: rich(
        "وقد اتفق الطرفان، وهما بكامل الأهلية المعتبرة شرعاً وقانوناً، على ما يأتي:",
      ),
    },
    { id: "clauses", type: "clauses", required: true },
    {
      id: "schedule-title",
      type: "heading",
      level: 2,
      text: para("جدول دفعات الإيجار"),
    },
    { id: "schedule", type: "schedule" },
    closing("ثلاث نسخ أصلية، بيد كل طرف نسخة ونسخة لدى المكتب"),
    signatures("landlord", "tenant"),
  ];
}

const RENT_COMMON = {
  preamble: clause(
    "preamble",
    "التمهيد",
    "يُعدّ التمهيد أعلاه وبيانات الطرفين وأوصاف المأجور جزءاً لا يتجزأ من هذا العقد ويُقرأ معه.",
  ),
  duration: clause(
    "duration",
    "مدة الإيجار",
    "مدة الإيجار {{rent.duration}}، تبدأ في {{rent.start_date}} وتنتهي في {{rent.end_date}}.",
    { required: true },
  ),
  rent: clause(
    "rent",
    "بدل الإيجار",
    "بدل الإيجار **{{rent.amount}}** ({{rent.amount_words}})، يُدفع بدورية {{rent.period}}، {{rent.payment_due}}.",
    { required: true },
  ),
  deposit: clause(
    "deposit",
    "التأمين",
    "دفع المستأجر عند توقيع هذا العقد مبلغ تأمين قدره {{rent.deposit}}، يُعاد إليه عند انتهاء العقد وتسليم المأجور بالحالة التي استلمه بها، بعد خصم قيمة أي أضرار أو مستحقات غير مدفوعة.",
  ),
  utilities: clause(
    "utilities",
    "الخدمات والفواتير",
    "يتحمل المستأجر أجور الكهرباء والماء والمولدة والخدمات الأخرى طوال مدة الإيجار، ويلتزم بتسديدها في مواعيدها وتسليم المأجور خالياً من أي ديون عليها.",
  ),
  sublet: clause(
    "sublet",
    "الإيجار من الباطن",
    "لا يحق للمستأجر تأجير المأجور أو جزء منه إلى الغير، أو التنازل عن الإيجار، إلا بموافقة كتابية من المؤجر.",
  ),
  renewal: clause(
    "renewal",
    "انتهاء العقد وتجديده",
    "ينتهي هذا العقد بانتهاء مدته، ويلتزم المستأجر بإخلاء المأجور وتسليمه إلى المؤجر في اليوم التالي لانتهائها، ما لم يتفق الطرفان كتابةً على التجديد قبل انتهاء المدة بمدة معقولة.",
  ),
  breach: clause(
    "breach",
    "الإخلال بالالتزامات",
    "إذا تأخر المستأجر عن دفع بدل الإيجار في موعده أو أخلّ بأي من التزاماته، حق للمؤجر المطالبة بالبدل المستحق أو بفسخ العقد وإخلاء المأجور، وفق أحكام القانون العراقي النافذ.",
  ),
  commission: clause(
    "commission",
    "عمولة المكتب",
    "يستحق مكتب {{company.name}} عمولة قدرها {{contract.commission}} عن هذا العقد، تُدفع وفق ما يأتي: {{contract.commission_terms}}.",
    { hidden: true },
  ),
  disputes: clause(
    "disputes",
    "حل النزاعات",
    "يسعى الطرفان إلى حل أي خلاف ينشأ عن تفسير هذا العقد أو تنفيذه ودياً، فإن تعذر ذلك فالاختصاص للمحاكم العراقية المختصة.",
  ),
};

const RESIDENTIAL_DOCUMENT = base("residential", rentBlocks(), [
  RENT_COMMON.preamble,
  clause(
    "subject",
    "موضوع العقد",
    "أجّر الطرف الأول (المؤجر) إلى الطرف الثاني (المستأجر) العقار الموصوف أعلاه لغرض السكن العائلي فقط، ولا يجوز استعماله لغير هذا الغرض.",
    { required: true },
  ),
  RENT_COMMON.duration,
  RENT_COMMON.rent,
  RENT_COMMON.deposit,
  clause(
    "upkeep",
    "المحافظة على المأجور",
    "يلتزم المستأجر بالمحافظة على المأجور واستعماله استعمال الشخص المعتاد، ولا يجوز له إجراء أي تغيير فيه إلا بموافقة كتابية من المؤجر. الإصلاحات الجسيمة على المؤجر، والإصلاحات البسيطة الناتجة عن الاستعمال على المستأجر.",
  ),
  RENT_COMMON.utilities,
  RENT_COMMON.sublet,
  RENT_COMMON.renewal,
  RENT_COMMON.breach,
  RENT_COMMON.commission,
  RENT_COMMON.disputes,
]);

const COMMERCIAL_DOCUMENT = base("commercial", rentBlocks(), [
  RENT_COMMON.preamble,
  clause(
    "subject",
    "موضوع العقد والغرض من الإيجار",
    "أجّر الطرف الأول (المؤجر) إلى الطرف الثاني (المستأجر) العقار الموصوف أعلاه لغرض **{{rent.permitted_use}}** فقط، ولا يجوز للمستأجر تغيير هذا الغرض أو إضافة نشاط آخر إلا بموافقة كتابية من المؤجر.",
    { required: true },
  ),
  RENT_COMMON.duration,
  RENT_COMMON.rent,
  RENT_COMMON.deposit,
  clause(
    "licenses",
    "الإجازات والتراخيص",
    "يلتزم المستأجر باستحصال الإجازات والتراخيص اللازمة لممارسة نشاطه من الجهات المختصة على نفقته، ويتحمل وحده أي غرامات أو التزامات تترتب على نشاطه.",
  ),
  clause(
    "alterations",
    "التعديلات واللافتات",
    "لا يجوز للمستأجر إجراء تعديلات إنشائية في المأجور إلا بموافقة كتابية من المؤجر، ويجوز له وضع لافتة باسم نشاطه على الواجهة وفق التعليمات النافذة، على أن يزيلها ويعيد المكان إلى حالته عند انتهاء العقد.",
  ),
  RENT_COMMON.utilities,
  RENT_COMMON.sublet,
  RENT_COMMON.renewal,
  RENT_COMMON.breach,
  RENT_COMMON.commission,
  RENT_COMMON.disputes,
]);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

const FACTORY: Record<TemplateKey, ContractDocument> = deepFreeze({
  sale: SALE_DOCUMENT,
  installment_sale: INSTALLMENT_DOCUMENT,
  residential_rent: RESIDENTIAL_DOCUMENT,
  commercial_rent: COMMERCIAL_DOCUMENT,
});

/** Bumped when a factory definition changes, so history shows which one. */
export const FACTORY_REVISION = 1;

/** A fresh, mutable copy of a template's factory definition. */
export function factoryDocument(key: TemplateKey): ContractDocument {
  return deepClone(FACTORY[key]);
}

/**
 * "Restore default design": the factory layout, typography, spacing, bands
 * and page setup, keeping the current clauses as they are.
 */
export function withFactoryDesign(
  key: TemplateKey,
  current: ContractDocument,
): ContractDocument {
  const factory = factoryDocument(key);
  return {
    ...factory,
    clause_settings: {
      ...factory.clause_settings,
      numbering: current.clause_settings.numbering,
      prefix: current.clause_settings.prefix,
    },
    clauses: deepClone(current.clauses),
  };
}
