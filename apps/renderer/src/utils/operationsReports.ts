/**
 * تقارير العمل كما تُعرض وتُصدَّر: الصفقات والزبائن والعروض والإيجارات، كل
 * تقرير أرقامه الإجمالية ثم جداوله (utils/reportDocument.ts). الروابط إلى
 * السجلات لا تظهر إلا لمن يملك صلاحية فتحها. المعادلات في docs/REPORTS.md.
 */
import { LISTING_AGE_LABELS } from "../constants/reports";
import { dealStageLabel, dealTypeLabel } from "../constants/deals";
import { statusLabel } from "../constants/domain";
import { followupTypeLabel } from "../constants/crm";
import { leaseFrequencyLabel } from "../constants/leases";
import { periodText } from "./periods";
import { formatMoney } from "./format";
import { requestPath, requestPropertyTypeLabel } from "./requestForm";
import type {
  Currency,
  CustomersReport,
  DealsReport,
  LeasesReport,
  ListingsReport,
} from "../types";
import type { ReportDocument, ReportFigure } from "./reportDocument";

export interface OperationsLinks {
  can: (permission: string) => boolean;
}

const currencyLabel = (currency: Currency) =>
  currency === "USD" ? "دولار" : "دينار";
const count = (label: string, value: number): ReportFigure => ({
  label,
  value: String(value),
  kind: "number",
});
const percent = (label: string, value: number | null): ReportFigure =>
  value === null
    ? { label, value: "—", kind: "text" }
    : { label, value: String(value), kind: "percent" };
const daysFigure = (label: string, value: number | null): ReportFigure =>
  value === null
    ? { label, value: "—", kind: "text" }
    : { label, value: `${value} يوماً`, kind: "text" };
const link = (allowed: boolean, to: string) => (allowed ? to : undefined);
function only(entries: Record<string, string | undefined>) {
  const kept = Object.entries(entries).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  return kept.length ? Object.fromEntries(kept) : undefined;
}

// ─── الصفقات ───────────────────────────────────────────────────────────
export function dealsDocument(
  report: DealsReport,
  links: OperationsLinks,
  employeeName?: string | null,
): ReportDocument {
  const t = report.totals;
  const notes = [
    "نسبة الإتمام: المكتملة ÷ (المكتملة + التي لم تتم) مما أُغلق خلال الفترة؛ الملغاة لا تُحسب. أُتمّت من الجديدة: ما اكتمل حتى الآن من الصفقات المضافة خلال الفترة. مدة الإتمام: من إضافة الصفقة إلى اكتمالها.",
  ];
  if (report.closed_truncated)
    notes.unshift("أكثر من 1000 صفقة مغلقة: اختر فترة أقصر لتراها كلها.");
  const scope = [
    employeeName,
    report.deal_type ? dealTypeLabel(report.deal_type) : null,
  ].filter(Boolean);
  return {
    title: scope.length ? `الصفقات — ${scope.join(" · ")}` : "الصفقات",
    period: periodText(report.from, report.to),
    fileName: `تقرير-الصفقات-${report.from}-${report.to}`,
    notes,
    sections: [
      {
        currency: "IQD",
        title: "الصفقات",
        figures: [
          count("صفقات جديدة", t.created),
          count("مكتملة", t.won),
          count("لم تتم", t.lost),
          count("ملغاة", t.cancelled),
          count("مفتوحة الآن", t.open_now),
          percent("نسبة الإتمام", t.win_rate),
          percent("أُتمّت من الجديدة", t.cohort_conversion),
          daysFigure("متوسط مدة الإتمام", t.cycle_days_average),
        ],
        tables: [
          {
            title: "الصفقات المفتوحة حسب المرحلة",
            columns: [
              { key: "stage", title: "المرحلة" },
              { key: "deals", title: "الصفقات", kind: "number" },
              {
                key: "days",
                title: "متوسط الأيام في المرحلة",
                kind: "number",
              },
            ],
            rows: report.stages.map((row) => ({
              cells: {
                stage: dealStageLabel(row.stage),
                deals: row.deals,
                days: row.days_in_stage,
              },
            })),
            empty: "لا صفقات مفتوحة.",
          },
          {
            title: "العمولة المتوقعة من الصفقات المفتوحة",
            columns: [
              { key: "currency", title: "العملة" },
              { key: "deals", title: "الصفقات", kind: "number" },
              { key: "expected", title: "العمولة المتوقعة", kind: "money" },
            ],
            rows: report.pipeline.map((row) => ({
              cells: {
                currency: currencyLabel(row.currency),
                deals: row.deals,
                expected: row.expected_commission,
              },
              currency: row.currency,
            })),
          },
          {
            title: "أسباب عدم الإتمام",
            columns: [
              { key: "reason", title: "السبب" },
              { key: "deals", title: "الصفقات", kind: "number" },
              { key: "share", title: "النسبة", kind: "percent" },
            ],
            rows: report.lost_reasons.map((row) => ({
              cells: { reason: row.reason, deals: row.deals, share: row.share },
            })),
            empty: "لا صفقات «لم تتم» خلال الفترة.",
          },
          {
            title: "أداء الموظفين",
            columns: [
              { key: "name", title: "الموظف" },
              { key: "open", title: "مفتوحة", kind: "number" },
              { key: "created", title: "جديدة", kind: "number" },
              { key: "won", title: "مكتملة", kind: "number" },
              { key: "lost", title: "لم تتم", kind: "number" },
              { key: "rate", title: "نسبة الإتمام", kind: "percent" },
              {
                key: "cycle",
                title: "متوسط مدة الإتمام (يوماً)",
                kind: "number",
              },
              {
                key: "iqd",
                title: "عمولات بالدينار",
                kind: "money",
                currency: "IQD",
              },
              {
                key: "usd",
                title: "عمولات بالدولار",
                kind: "money",
                currency: "USD",
              },
            ],
            rows: report.employees.map((row) => ({
              cells: {
                name: row.display_name ?? "بلا موظف مسؤول",
                open: row.open_now,
                created: row.created,
                won: row.won,
                lost: row.lost,
                rate: row.win_rate,
                cycle: row.cycle_days,
                iqd: row.commission_iqd,
                usd: row.commission_usd,
              },
              tone: row.user_id === null ? "muted" : undefined,
            })),
          },
          {
            title: "العمولات المسجّلة خلال الفترة",
            columns: [
              { key: "type", title: "نوع الصفقة" },
              { key: "currency", title: "العملة" },
              { key: "count", title: "العمولات", kind: "number" },
              { key: "amount", title: "المبلغ", kind: "money" },
            ],
            rows: report.commissions.map((row) => ({
              cells: {
                type: dealTypeLabel(row.deal_type),
                currency: currencyLabel(row.currency),
                count: row.commissions,
                amount: row.amount,
              },
              currency: row.currency,
            })),
            empty: "لا عمولات خلال الفترة.",
          },
          {
            title: "الصفقات المغلقة خلال الفترة",
            columns: [
              { key: "closed", title: "أُغلقت", kind: "date" },
              { key: "code", title: "الصفقة" },
              { key: "type", title: "النوع" },
              { key: "stage", title: "النتيجة" },
              { key: "client", title: "الزبون" },
              { key: "user", title: "الموظف" },
              { key: "days", title: "مدتها (يوماً)", kind: "number" },
              { key: "reason", title: "سبب عدم الإتمام" },
              { key: "price", title: "السعر المتفق", kind: "money" },
            ],
            rows: report.closed.map((row) => ({
              cells: {
                closed: row.closed_on,
                code: row.code,
                type: dealTypeLabel(row.deal_type),
                stage: dealStageLabel(row.stage),
                client: row.client_name,
                user: row.user_name,
                days: row.cycle_days,
                reason: row.lost_reason,
                price: row.agreed_price,
              },
              currency: row.currency,
              links: only({
                code: link(links.can("deals.read"), `/deals/${row.id}`),
                client: row.client_person_id
                  ? link(
                      links.can("people.read"),
                      `/clients/${row.client_person_id}`,
                    )
                  : undefined,
              }),
              tone: row.stage === "won" ? undefined : "muted",
            })),
            empty: "لم تُغلق صفقة خلال الفترة.",
          },
        ],
      },
    ],
  };
}

// ─── الزبائن ───────────────────────────────────────────────────────────
export function customersDocument(
  report: CustomersReport,
  links: OperationsLinks,
  employeeName?: string | null,
): ReportDocument {
  const t = report.totals;
  const person = (id: number) =>
    link(links.can("people.read"), `/clients/${id}`);
  const tables: ReportDocument["sections"][number]["tables"] = [
    {
      title: `لهم طلب أو صفقة مفتوحة ولا تواصل منذ ${report.days} يوماً`,
      columns: [
        { key: "person", title: "الزبون" },
        { key: "phone", title: "الهاتف" },
        { key: "user", title: "الموظف المسؤول" },
        { key: "requests", title: "طلبات مفتوحة", kind: "number" },
        { key: "deals", title: "صفقات مفتوحة", kind: "number" },
        { key: "last", title: "آخر تواصل", kind: "date" },
      ],
      rows: report.uncontacted.map((row) => ({
        cells: {
          person: row.person_name,
          phone: row.phone,
          user: row.user_name,
          requests: row.open_requests,
          deals: row.open_deals,
          last: row.last_contact,
        },
        links: only({ person: person(row.person_id) }),
      })),
      empty: "تواصل المكتب مع كل من له طلب أو صفقة مفتوحة.",
    },
    {
      title: "زبائن متكررون (صفقتان مكتملتان أو أكثر)",
      columns: [
        { key: "person", title: "الزبون" },
        { key: "phone", title: "الهاتف" },
        { key: "won", title: "صفقات مكتملة", kind: "number" },
        { key: "last", title: "آخرها", kind: "date" },
      ],
      rows: report.repeat.map((row) => ({
        cells: {
          person: row.person_name,
          phone: row.phone,
          won: row.won_deals,
          last: row.last_won,
        },
        links: only({ person: person(row.person_id) }),
      })),
      empty: "لا زبون له أكثر من صفقة مكتملة.",
    },
    {
      title: "التواصل خلال الفترة حسب النوع",
      columns: [
        { key: "type", title: "النوع" },
        { key: "contacts", title: "مرات التواصل", kind: "number" },
        { key: "customers", title: "الزبائن", kind: "number" },
      ],
      rows: report.contacts_by_type.map((row) => ({
        cells: {
          type: followupTypeLabel(row.type),
          contacts: row.contacts,
          customers: row.customers,
        },
      })),
      empty: "لا تواصل مسجّل خلال الفترة.",
    },
    {
      title: "التواصل خلال الفترة حسب الموظف",
      columns: [
        { key: "name", title: "الموظف" },
        { key: "contacts", title: "مرات التواصل", kind: "number" },
        { key: "customers", title: "الزبائن", kind: "number" },
      ],
      rows: report.contacts_by_user.map((row) => ({
        cells: {
          name: row.display_name ?? "بلا موظف مسؤول",
          contacts: row.contacts,
          customers: row.customers,
        },
      })),
    },
  ];
  if (report.requests)
    tables.push({
      title: "الطلبات وما صار منها صفقات",
      columns: [
        { key: "kind", title: "الطلبات" },
        { key: "open", title: "مفتوحة الآن", kind: "number" },
        { key: "created", title: "جديدة", kind: "number" },
        { key: "with_deal", title: "لها صفقة", kind: "number" },
        { key: "won", title: "صفقتها مكتملة", kind: "number" },
        { key: "rate", title: "نسبة الإتمام", kind: "percent" },
      ],
      rows: report.requests.map((row) => ({
        cells: {
          kind: row.kind === "rental" ? "طلبات إيجار" : "طلبات شراء",
          open: row.open,
          created: row.created,
          with_deal: row.with_deal,
          won: row.won,
          rate: row.conversion,
        },
      })),
    });
  return {
    title: employeeName ? `الزبائن — ${employeeName}` : "الزبائن",
    period: periodText(report.from, report.to),
    fileName: `تقرير-الزبائن-${report.from}-${report.to}`,
    notes: [
      "التواصل: نشاط أو متابعة على عرض تذكر الزبون. «بلا تواصل»: زبون نشِط له صفقة أو طلب مفتوح ولم يُتواصل معه في الأيام الأخيرة من الفترة، أو لم يُتواصل معه قط.",
      ...(report.requests ? [] : ["أرقام الطلبات تحتاج صلاحية عرض الطلبات."]),
    ],
    sections: [
      {
        currency: "IQD",
        title: "الزبائن",
        figures: [
          count("نشِطون", t.active),
          count("زبائن جدد", t.new),
          count("تواصلنا معهم", t.contacted),
          count(`بلا تواصل منذ ${report.days} يوماً`, t.uncontacted),
          count("متكررون", t.repeat),
          percent("الجدد الذين أتمّوا صفقة", t.new_conversion),
        ],
        tables,
      },
    ],
  };
}

// ─── العروض ────────────────────────────────────────────────────────────
export function listingsDocument(
  report: ListingsReport,
  links: OperationsLinks,
): ReportDocument {
  const sale = report.kind === "sale";
  const t = report.totals;
  const typeLabel = (value: string) =>
    requestPropertyTypeLabel(sale ? "purchase" : "rental", value);
  const band = (from: number | null, to: number | null) => {
    if (from === null) return "بلا سعر";
    const suffix = sale ? "" : " شهرياً";
    return to === null
      ? `${formatMoney(from)} فأكثر${suffix}`
      : `${formatMoney(from)} – ${formatMoney(to)}${suffix}`;
  };
  const figures: ReportFigure[] = [
    count("متاحة", t.available),
    count(sale ? "بِيعت خلال الفترة" : "أُجِّرت خلال الفترة", t.closed),
    count("بلا نشاط منذ 30 يوماً", t.stale),
  ];
  if (t.open_requests !== null)
    figures.push(count("طلبات مفتوحة", t.open_requests));
  if (t.unmatched_requests !== null)
    figures.push(count("طلبات بلا مطابقة", t.unmatched_requests));
  const tables: ReportDocument["sections"][number]["tables"] = [
    {
      title: "حسب الحالة الآن",
      columns: [
        { key: "status", title: "الحالة" },
        { key: "listings", title: "العروض", kind: "number" },
      ],
      rows: report.statuses.map((row) => ({
        cells: { status: statusLabel(row.status), listings: row.listings },
      })),
    },
    {
      title: "عمر العروض المتاحة",
      columns: [
        { key: "age", title: "منذ إضافته" },
        { key: "listings", title: "العروض", kind: "number" },
      ],
      rows: report.age.map((row) => ({
        cells: {
          age: LISTING_AGE_LABELS[row.bucket] ?? row.bucket,
          listings: row.listings,
        },
      })),
    },
    {
      title: "المعروض والمطلوب حسب النوع",
      columns: [
        { key: "type", title: "النوع" },
        { key: "available", title: "متاح", kind: "number" },
        ...(t.open_requests !== null
          ? [{ key: "requests", title: "مطلوب", kind: "number" as const }]
          : []),
      ],
      rows: report.types.map((row) => ({
        cells: {
          type: typeLabel(row.property_type),
          available: row.available,
          requests: row.requests,
        },
      })),
    },
    {
      title: sale
        ? "المعروض والمطلوب حسب السعر (دينار)"
        : "المعروض والمطلوب حسب الإيجار الشهري (دينار)",
      columns: [
        { key: "band", title: "السعر" },
        { key: "available", title: "متاح", kind: "number" },
        ...(t.open_requests !== null
          ? [
              {
                key: "requests",
                title: "مطلوب (حسب أعلى ميزانية)",
                kind: "number" as const,
              },
            ]
          : []),
      ],
      rows: report.price_bands.map((row) => ({
        cells: {
          band: band(row.from, row.to),
          available: row.available,
          requests: row.requests,
        },
      })),
    },
  ];
  if (report.demand)
    tables.push({
      title: "الطلب حسب المنطقة",
      columns: [
        { key: "governorate", title: "المحافظة" },
        { key: "district", title: "المنطقة" },
        { key: "requests", title: "طلبات مفتوحة", kind: "number" },
        { key: "available", title: "عروض متاحة فيها", kind: "number" },
      ],
      rows: report.demand.map((row) => ({
        cells: { ...row },
      })),
    });
  if (report.unmatched)
    tables.push({
      title: "طلبات لا يطابقها عرض متاح",
      columns: [
        { key: "code", title: "الطلب" },
        { key: "person", title: "الزبون" },
        { key: "phone", title: "الهاتف" },
        { key: "type", title: "النوع" },
        { key: "budget", title: "أعلى ميزانية", kind: "money" },
        { key: "place", title: "المكان" },
        { key: "created", title: "أُضيف", kind: "date" },
      ],
      rows: report.unmatched.map((row) => ({
        cells: {
          code: row.code,
          person: row.person_name,
          phone: row.phone,
          type: typeLabel(row.property_type),
          budget: row.budget_max,
          place: [row.governorate, row.district].filter(Boolean).join(" · "),
          created: row.created_at,
        },
        links: only({
          code: link(
            links.can("requests.read"),
            requestPath(sale ? "purchase" : "rental", row.id),
          ),
          person: link(links.can("people.read"), `/clients/${row.person_id}`),
        }),
      })),
      empty: "كل طلب مفتوح يطابقه عرض متاح.",
    });
  tables.push({
    title: sale ? "بِيعت خلال الفترة" : "أُجِّرت خلال الفترة",
    columns: [
      { key: "date", title: "التاريخ", kind: "date" },
      { key: "code", title: "العرض" },
      { key: "name", title: "الاسم" },
      { key: "type", title: "النوع" },
      { key: "price", title: sale ? "السعر" : "الإيجار الشهري", kind: "money" },
    ],
    rows: report.closed.map((row) => ({
      cells: {
        date: row.closed_on,
        code: row.code,
        name: row.name,
        type: typeLabel(row.property_type),
        price: row.price,
      },
      links: only({
        code: sale
          ? link(links.can("properties.read"), `/properties/${row.id}`)
          : link(links.can("rentals.read"), `/rentals/${row.id}`),
      }),
    })),
    empty: sale ? "لم يُبع عرض خلال الفترة." : "لم يُؤجَّر عرض خلال الفترة.",
  });
  return {
    title: sale ? "عروض البيع" : "عروض الإيجار",
    period: periodText(report.from, report.to),
    fileName: `${sale ? "عروض-البيع" : "عروض-الإيجار"}-${report.from}-${report.to}`,
    notes: [
      sale
        ? "بِيعت خلال الفترة: عروض حالتها الآن مباعة وتغيّرت إلى مباع خلال الفترة. بلا نشاط: متاح لم يُعدَّل ولم تُسجَّل عليه متابعة منذ 30 يوماً."
        : "أُجِّرت خلال الفترة: عروض حالتها الآن مؤجرة وتغيّرت إلى مؤجر خلال الفترة. الإيجار الشهري: السنوي ÷ 12 ونصف السنوي ÷ 6.",
      ...(t.open_requests === null
        ? ["أرقام الطلب تحتاج صلاحية عرض الطلبات."]
        : []),
    ],
    sections: [
      {
        currency: "IQD",
        title: sale ? "عروض البيع" : "عروض الإيجار",
        figures,
        tables,
      },
    ],
  };
}

// ─── الإيجارات السارية ─────────────────────────────────────────────────
export function leasesDocument(
  report: LeasesReport,
  links: OperationsLinks,
): ReportDocument {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  return {
    title: "الإيجارات السارية",
    period: periodText(report.from, report.to),
    fileName: `تقرير-الإيجارات-${report.from}-${report.to}`,
    notes: [
      "السارية والتي لم تبدأ وما ينتهي قريباً: بحسب اليوم. المستحق والمقبوض: أقساط الإيجارات التي يقبضها المكتب، المستحقة خلال الفترة. انتهت خلال الفترة: بيوم إنهائها أو آخر يوم فيها؛ نسبة التجديد: المجدَّدة منها ÷ كلها.",
    ],
    sections: [
      {
        currency: "IQD",
        title: "الإيجارات",
        figures: [
          count("سارية اليوم", sum(report.in_force.map((row) => row.current))),
          count("لم تبدأ", sum(report.in_force.map((row) => row.upcoming))),
          count(`تنتهي خلال ${report.days} يوماً`, report.expiring.length),
          count("انتهت خلال الفترة", report.ended.ended),
          count("جُدِّدت منها", report.ended.renewed),
          percent("نسبة التجديد", report.ended.renewal_rate),
          count("أُنهيت مبكراً", report.ended.terminated),
          count("إيجارات جديدة", report.brokerage.activated),
          count("صفقات إيجار مكتملة", report.brokerage.rent_deals_won),
        ],
        tables: [
          {
            title: "السارية والإيجار الشهري",
            columns: [
              { key: "currency", title: "العملة" },
              { key: "current", title: "سارية", kind: "number" },
              { key: "upcoming", title: "لم تبدأ", kind: "number" },
              { key: "rent", title: "الإيجار شهرياً", kind: "money" },
            ],
            rows: report.in_force.map((row) => ({
              cells: {
                currency: currencyLabel(row.currency),
                current: row.current,
                upcoming: row.upcoming,
                rent: row.monthly_rent,
              },
              currency: row.currency,
            })),
            empty: "لا إيجارات سارية.",
          },
          {
            title: "الأقساط المستحقة خلال الفترة",
            columns: [
              { key: "currency", title: "العملة" },
              { key: "count", title: "الأقساط", kind: "number" },
              { key: "amount", title: "المستحق", kind: "money" },
              { key: "paid", title: "المقبوض", kind: "money" },
              { key: "rate", title: "نسبة التحصيل", kind: "percent" },
            ],
            rows: report.due.map((row) => ({
              cells: {
                currency: currencyLabel(row.currency),
                count: row.installments,
                amount: row.amount,
                paid: row.paid,
                rate: row.collection_rate,
              },
              currency: row.currency,
            })),
            empty: "لا أقساط مستحقة خلال الفترة يقبضها المكتب.",
          },
          {
            title: "المتأخر اليوم",
            columns: [
              { key: "currency", title: "العملة" },
              { key: "count", title: "الأقساط", kind: "number" },
              { key: "left", title: "المتبقي", kind: "money" },
              { key: "oldest", title: "أطول تأخير (يوماً)", kind: "number" },
            ],
            rows: report.overdue.map((row) => ({
              cells: {
                currency: currencyLabel(row.currency),
                count: row.installments,
                left: row.left,
                oldest: row.oldest_days,
              },
              currency: row.currency,
            })),
            empty: "لا أقساط متأخرة.",
          },
          {
            title: `تنتهي خلال ${report.days} يوماً`,
            columns: [
              { key: "code", title: "الإيجار" },
              { key: "tenant", title: "المستأجر" },
              { key: "landlord", title: "المؤجر" },
              { key: "end", title: "آخر يوم", kind: "date" },
              { key: "left", title: "الأيام المتبقية", kind: "number" },
              { key: "rent", title: "بدل الإيجار", kind: "money" },
              { key: "frequency", title: "دورية الدفع" },
            ],
            rows: report.expiring.map((row) => ({
              cells: {
                code: row.code,
                tenant: row.tenant_name,
                landlord: row.landlord_name,
                end: row.end_date,
                left: row.days_left,
                rent: row.rent_amount,
                frequency: leaseFrequencyLabel(row.frequency),
              },
              currency: row.currency,
              links: only({
                code: link(links.can("leases.read"), `/leases/${row.id}`),
                tenant: row.tenant_person_id
                  ? link(
                      links.can("people.read"),
                      `/clients/${row.tenant_person_id}`,
                    )
                  : undefined,
              }),
            })),
            empty: "لا إيجار ينتهي قريباً.",
          },
          {
            title: "عمولات صفقات الإيجار خلال الفترة",
            columns: [
              { key: "currency", title: "العملة" },
              { key: "count", title: "العمولات", kind: "number" },
              { key: "amount", title: "المبلغ", kind: "money" },
            ],
            rows: report.brokerage.commissions.map((row) => ({
              cells: {
                currency: currencyLabel(row.currency),
                count: row.commissions,
                amount: row.amount,
              },
              currency: row.currency,
            })),
            empty: "لا عمولات على صفقات إيجار خلال الفترة.",
          },
        ],
      },
    ],
  };
}
