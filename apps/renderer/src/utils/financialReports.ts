/**
 * كل تقرير مالي كما يُعرض ويُصدَّر: الأرقام الإجمالية أولاً ثم الجداول، لكل
 * عملة قسمها. الروابط إلى السجلات (زبون، صفقة، عمولة، قيد) لا تظهر إلا لمن
 * يملك صلاحية فتحها؛ رابط الحساب يفتح دفتره في التقارير نفسها.
 */
import { AGING_LABELS, payerRoleLabel } from "../constants/reports";
import { dealTypeLabel } from "../constants/deals";
import { formatDate } from "./format";
import { minorToAmount, signedAmountToMinor } from "./money";
import type {
  AccountStatement,
  BalanceSheetReport,
  BalanceSheetRow,
  CashFlowReport,
  CommissionsReport,
  Currency,
  IncomeStatementReport,
  IncomeStatementRow,
  PayablePersonRow,
  PayablesReport,
  ReceivablesReport,
  TrialBalanceReport,
} from "../types";
import type {
  ReportColumn,
  ReportDocument,
  ReportRow,
  ReportSection,
  ReportTable,
} from "./reportDocument";

export interface ReportLinks {
  can: (permission: string) => boolean;
  /** An account's ledger in the reports, for a period or up to a day. */
  ledger: (accountId: number, range: { from?: string; to: string }) => string;
}

const MONTHS = [
  "كانون الثاني",
  "شباط",
  "آذار",
  "نيسان",
  "أيار",
  "حزيران",
  "تموز",
  "آب",
  "أيلول",
  "تشرين الأول",
  "تشرين الثاني",
  "كانون الأول",
];
/** "2026-10" → «تشرين الأول 2026». */
export const monthLabel = (month: string) =>
  `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

const periodText = (from: string, to: string) =>
  `من ${formatDate(from)} إلى ${formatDate(to)}`;
const dayText = (day: string) => `في ${formatDate(day)}`;
const isZero = (value: string) => /^-?0(\.0+)?$/.test(value);
const negative = (value: string) => value.startsWith("-");

function personLink(links: ReportLinks, id: number | null) {
  return id && links.can("people.read") ? `/clients/${id}` : undefined;
}
function only(entries: Record<string, string | undefined>) {
  const kept = Object.entries(entries).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  return kept.length ? Object.fromEntries(kept) : undefined;
}

const ACCOUNT_COLUMNS: ReportColumn[] = [
  { key: "code", title: "الرمز" },
  { key: "name", title: "الحساب" },
];

// ─── ميزان المراجعة ─────────────────────────────────────────────────────
export function trialBalanceDocument(
  report: TrialBalanceReport,
  links: ReportLinks,
): ReportDocument {
  const range = { from: report.from, to: report.to };
  return {
    title: "ميزان المراجعة",
    period: periodText(report.from, report.to),
    fileName: `ميزان-المراجعة-${report.to}`,
    notes: [
      "رصيد أول المدة موجب للمدين وسالب للدائن. القيود المرحَّلة وحدها تدخل الميزان.",
    ],
    sections: report.sections.map((section) => ({
      currency: section.currency,
      warning: section.balanced
        ? null
        : "مجموع المدين لا يساوي مجموع الدائن: راجع القيود.",
      figures: [
        { label: "مجموع المدين في المدة", value: section.totals.debit },
        { label: "مجموع الدائن في المدة", value: section.totals.credit },
        {
          label: "الأرصدة المدينة آخر المدة",
          value: section.totals.closing_debit,
        },
        {
          label: "الأرصدة الدائنة آخر المدة",
          value: section.totals.closing_credit,
        },
      ],
      tables: [
        {
          title: "الحسابات",
          columns: [
            ...ACCOUNT_COLUMNS,
            { key: "heading", title: "المجموعة" },
            { key: "opening", title: "أول المدة", kind: "money" },
            { key: "debit", title: "مدين", kind: "money" },
            { key: "credit", title: "دائن", kind: "money" },
            { key: "closing_debit", title: "رصيد مدين", kind: "money" },
            { key: "closing_credit", title: "رصيد دائن", kind: "money" },
          ],
          rows: section.rows.map((row) => ({
            cells: {
              code: row.code,
              name: row.name,
              heading: row.heading_name,
              opening: row.opening,
              debit: row.debit,
              credit: row.credit,
              closing_debit: row.closing_debit,
              closing_credit: row.closing_credit,
            },
            links: { name: links.ledger(row.account_id, range) },
          })),
          total: {
            name: "المجموع",
            opening: section.totals.opening,
            debit: section.totals.debit,
            credit: section.totals.credit,
            closing_debit: section.totals.closing_debit,
            closing_credit: section.totals.closing_credit,
          },
          empty: "لا قيود مرحَّلة حتى نهاية المدة.",
        },
      ],
    })),
  };
}

// ─── الإيرادات والمصروفات ──────────────────────────────────────────────
export function incomeStatementDocument(
  report: IncomeStatementReport,
  links: ReportLinks,
): ReportDocument {
  const range = { from: report.from, to: report.to };
  const monthColumns: ReportColumn[] = report.months.map((month) => ({
    key: month,
    title: monthLabel(month),
    kind: "money",
  }));
  const accountTable = (
    title: string,
    rows: IncomeStatementRow[],
    total: string,
  ): ReportTable => ({
    title,
    columns: [
      ...ACCOUNT_COLUMNS,
      ...monthColumns,
      { key: "amount", title: "المجموع", kind: "money" },
    ],
    rows: rows.map((row) => ({
      cells: {
        code: row.code,
        name: row.name,
        amount: row.amount,
        ...Object.fromEntries(
          row.by_month.map((item) => [item.month, item.amount]),
        ),
      },
      links: { name: links.ledger(row.account_id, range) },
    })),
    total: { name: "المجموع", amount: total },
    empty: "لا حركة في المدة.",
  });
  return {
    title: "الإيرادات والمصروفات",
    period: periodText(report.from, report.to),
    fileName: `الإيرادات-والمصروفات-${report.from}-${report.to}`,
    notes: [
      "الإيراد: الدائن ناقص المدين في حسابات الإيرادات؛ المصروف: المدين ناقص الدائن في حسابات المصروفات. أمانات العملاء وثمن العقار ليست إيراداً.",
    ],
    sections: report.sections.map((section) => {
      const tables: ReportTable[] = [
        accountTable("الإيرادات", section.revenue, section.totals.revenue),
        accountTable("المصروفات", section.expenses, section.totals.expenses),
      ];
      if (section.by_month.length)
        tables.push({
          title: "شهراً بشهر",
          columns: [
            { key: "month", title: "الشهر" },
            { key: "revenue", title: "الإيرادات", kind: "money" },
            { key: "expenses", title: "المصروفات", kind: "money" },
            { key: "net", title: "الصافي", kind: "money" },
          ],
          rows: section.by_month.map((row) => ({
            cells: {
              month: monthLabel(row.month),
              revenue: row.revenue,
              expenses: row.expenses,
              net: row.net,
            },
          })),
          total: {
            month: "المجموع",
            revenue: section.totals.revenue,
            expenses: section.totals.expenses,
            net: section.totals.net,
          },
        });
      if (section.expense_categories.length)
        tables.push({
          title: "المصروفات المدفوعة بسندات، حسب التصنيف",
          columns: [
            { key: "category", title: "التصنيف" },
            { key: "amount", title: "المبلغ", kind: "money" },
          ],
          rows: section.expense_categories.map((row) => ({
            cells: {
              category: row.category_name ?? "بلا تصنيف",
              amount: row.amount,
            },
          })),
        });
      return {
        currency: section.currency,
        figures: [
          { label: "الإيرادات", value: section.totals.revenue },
          { label: "المصروفات", value: section.totals.expenses },
          {
            label: "صافي الربح",
            value: section.totals.net,
            tone: negative(section.totals.net) ? "bad" : "good",
          },
        ],
        tables,
      } satisfies ReportSection;
    }),
  };
}

// ─── الميزانية العمومية ────────────────────────────────────────────────
export function balanceSheetDocument(
  report: BalanceSheetReport,
  links: ReportLinks,
): ReportDocument {
  const range = { to: report.as_of };
  const side = (
    title: string,
    rows: BalanceSheetRow[],
    total: string,
    extra: ReportRow[] = [],
  ): ReportTable => ({
    title,
    columns: [
      ...ACCOUNT_COLUMNS,
      { key: "heading", title: "المجموعة" },
      { key: "balance", title: "الرصيد", kind: "money" },
    ],
    rows: [
      ...rows.map((row) => ({
        cells: {
          code: row.code,
          name: row.name,
          heading: row.heading_name,
          balance: row.balance,
        },
        links: { name: links.ledger(row.account_id, range) },
      })),
      ...extra,
    ],
    total: { name: "المجموع", balance: total },
    empty: "لا أرصدة.",
  });
  return {
    title: "الميزانية العمومية",
    period: dayText(report.as_of),
    fileName: `الميزانية-${report.as_of}`,
    notes: [
      "الأرباح غير المقفلة: كل الإيرادات ناقص كل المصروفات حتى هذا اليوم، إذ لا يُقيد إقفال سنوي.",
    ],
    sections: report.sections.map((section) => ({
      currency: section.currency,
      warning: section.balanced
        ? null
        : "الأصول لا تساوي الالتزامات وحقوق الملكية: راجع القيود.",
      figures: [
        { label: "الأصول", value: section.totals.assets },
        { label: "الالتزامات", value: section.totals.liabilities },
        { label: "حقوق الملكية", value: section.totals.equity },
        {
          label: "أرباح لم تُقفل",
          value: section.totals.earnings,
          tone: negative(section.totals.earnings) ? "bad" : "good",
        },
      ],
      tables: [
        side("الأصول", section.assets, section.totals.assets),
        side("الالتزامات", section.liabilities, section.totals.liabilities),
        side(
          "حقوق الملكية",
          section.equity,
          addText(section.totals.equity, section.totals.earnings),
          [
            {
              cells: {
                name: "أرباح لم تُقفل",
                balance: section.totals.earnings,
              },
              tone: "strong",
            },
          ],
        ),
      ],
    })),
  };
}

/** Two balances added exactly. */
const addText = (a: string, b: string) =>
  minorToAmount(
    (signedAmountToMinor(a) ?? 0n) + (signedAmountToMinor(b) ?? 0n),
  );

// ─── التدفق النقدي ─────────────────────────────────────────────────────
export function cashFlowDocument(
  report: CashFlowReport,
  links: ReportLinks,
): ReportDocument {
  const range = { from: report.from, to: report.to };
  return {
    title: "التدفق النقدي",
    period: periodText(report.from, report.to),
    fileName: `التدفق-النقدي-${report.from}-${report.to}`,
    notes: [
      "كل قيد مسّ صندوقاً أو مصرفاً يُوزَّع على أسطره الأخرى: الدائن فيها مقبوض، والمدين مدفوع. التحويل بين صندوق ومصرف لا يغيّر المجموع.",
    ],
    sections: report.sections.map((section) => ({
      currency: section.currency,
      warning: section.balanced
        ? null
        : "أول المدة مع صافي الحركة لا يساوي آخرها: راجع القيود.",
      figures: [
        { label: "أول المدة", value: section.totals.opening },
        { label: "المقبوض", value: section.totals.money_in, tone: "good" },
        { label: "المدفوع", value: section.totals.money_out, tone: "bad" },
        { label: "صافي الحركة", value: section.totals.net },
        { label: "آخر المدة", value: section.totals.closing },
      ],
      tables: [
        {
          title: "حسب الغرض",
          columns: [
            { key: "category", title: "الغرض (الجهة المقابلة)" },
            { key: "money_in", title: "مقبوض", kind: "money" },
            { key: "money_out", title: "مدفوع", kind: "money" },
            { key: "net", title: "الصافي", kind: "money" },
          ],
          rows: section.categories.map((row) => ({
            cells: {
              category: row.category_name,
              money_in: row.money_in,
              money_out: row.money_out,
              net: row.net,
            },
          })),
          total: {
            category: "المجموع",
            money_in: section.totals.money_in,
            money_out: section.totals.money_out,
            net: section.totals.net,
          },
          empty: "لا مقبوض ولا مدفوع في المدة.",
        },
        {
          title: "الصناديق والمصارف",
          columns: [
            ...ACCOUNT_COLUMNS,
            { key: "opening", title: "أول المدة", kind: "money" },
            { key: "money_in", title: "داخل", kind: "money" },
            { key: "money_out", title: "خارج", kind: "money" },
            { key: "closing", title: "آخر المدة", kind: "money" },
          ],
          rows: section.accounts.map((row) => ({
            cells: {
              code: row.code,
              name: row.name,
              opening: row.opening,
              money_in: row.money_in,
              money_out: row.money_out,
              closing: row.closing,
            },
            links: { name: links.ledger(row.account_id, range) },
          })),
          total: {
            name: "المجموع",
            opening: section.totals.opening,
            closing: section.totals.closing,
          },
        },
      ],
    })),
  };
}

// ─── العمولات ──────────────────────────────────────────────────────────
export function commissionsDocument(
  report: CommissionsReport,
  links: ReportLinks,
  employeeName?: string | null,
): ReportDocument {
  const notes = [
    "العمولات المسجّلة بتاريخها في المدة. المحصَّل والمدفوع من الحصص: السندات غير الملغاة حتى نهاية المدة. الملغاة تظهر ولا تدخل المجاميع.",
  ];
  if (report.truncated)
    notes.unshift("أكثر من 2000 عمولة: ضيّق المدة لترى كلها.");
  return {
    title: employeeName ? `العمولات — ${employeeName}` : "العمولات",
    period: periodText(report.from, report.to),
    fileName: `العمولات-${report.from}-${report.to}`,
    notes,
    sections: report.sections.map((section) => ({
      currency: section.currency,
      figures: [
        { label: "المسجّل", value: section.totals.recorded },
        { label: "المحصَّل", value: section.totals.collected, tone: "good" },
        {
          label: "المتبقي على الزبائن",
          value: section.totals.outstanding,
          tone: isZero(section.totals.outstanding) ? undefined : "warn",
        },
        { label: "حصص الموظفين", value: section.totals.shares },
        { label: "المدفوع من الحصص", value: section.totals.shares_paid },
        { label: "صافي المكتب", value: section.totals.office_net },
        ...(section.totals.cancelled_count
          ? [
              {
                label: `ملغاة (${section.totals.cancelled_count})`,
                value: section.totals.cancelled_amount,
              },
            ]
          : []),
      ],
      tables: [
        {
          title: "العمولات",
          columns: [
            { key: "date", title: "التاريخ", kind: "date" },
            { key: "code", title: "العمولة" },
            { key: "deal", title: "الصفقة" },
            { key: "payer", title: "الدافع" },
            { key: "amount", title: "المبلغ", kind: "money" },
            { key: "collected", title: "المحصَّل", kind: "money" },
            { key: "outstanding", title: "المتبقي", kind: "money" },
            { key: "shares", title: "الحصص", kind: "money" },
          ],
          rows: section.rows.map((row) => ({
            cells: {
              date: row.commission_date,
              code: row.status === "active" ? row.code : `${row.code} (ملغاة)`,
              deal: `${row.deal_code} · ${dealTypeLabel(row.deal_type)}`,
              payer: `${payerRoleLabel(row.payer_role, row.deal_type)}: ${row.payer_name ?? "—"}`,
              amount: row.amount,
              collected: row.collected,
              outstanding: row.outstanding,
              shares: row.shares,
            },
            links: only({
              code: links.can("commissions.read")
                ? `/accounting/commissions/${row.id}`
                : undefined,
              deal: links.can("deals.read")
                ? `/deals/${row.deal_id}`
                : undefined,
              payer: personLink(links, row.payer_person_id),
            }),
            tone: row.status === "active" ? undefined : "muted",
          })),
          total: {
            code: "المجموع",
            amount: section.totals.recorded,
            collected: section.totals.collected,
            outstanding: section.totals.outstanding,
            shares: section.totals.shares,
          },
          empty: "لا عمولات في المدة.",
        },
        {
          title: "حسب نوع الصفقة",
          columns: [
            { key: "type", title: "النوع" },
            { key: "count", title: "العدد", kind: "number" },
            { key: "recorded", title: "المسجّل", kind: "money" },
            { key: "collected", title: "المحصَّل", kind: "money" },
          ],
          rows: section.by_deal_type.map((row) => ({
            cells: {
              type: dealTypeLabel(row.deal_type),
              count: row.count,
              recorded: row.recorded,
              collected: row.collected,
            },
          })),
        },
        {
          title: "حسب الموظف",
          columns: [
            { key: "name", title: "الموظف" },
            { key: "commissions", title: "العمولات", kind: "number" },
            { key: "shares", title: "حصصه", kind: "money" },
            { key: "paid", title: "المدفوع", kind: "money" },
            { key: "owed", title: "المتبقي له", kind: "money" },
          ],
          rows: section.employees.map((row) => ({
            cells: {
              name: row.display_name,
              commissions: row.commissions,
              shares: row.shares,
              paid: row.paid,
              owed: row.owed,
            },
          })),
          empty: "لا حصص لموظفين في المدة.",
        },
      ],
    })),
  };
}

// ─── الذمم المدينة ─────────────────────────────────────────────────────
export function receivablesDocument(
  report: ReceivablesReport,
  links: ReportLinks,
): ReportDocument {
  return {
    title: "الذمم المدينة",
    period: dayText(report.as_of),
    fileName: `الذمم-المدينة-${report.as_of}`,
    notes: [
      "ما على كل زبون للمكتب من حسابات الذمم المدينة. يُعمَّر بأقدم قيد أولاً: كل دفعة تسدد أقدم ما عليه، وما بقي يُحسب بعمره في هذا اليوم.",
    ],
    sections: report.sections.map((section) => ({
      currency: section.currency,
      figures: [
        { label: "الإجمالي", value: section.totals.total },
        ...(["current", "days_31_60", "days_61_90", "over_90"] as const).map(
          (key) => ({
            label: AGING_LABELS[key],
            value: section.totals[key],
            tone:
              key === "over_90" && !isZero(section.totals[key])
                ? ("bad" as const)
                : undefined,
          }),
        ),
      ],
      tables: [
        {
          title: "الزبائن",
          columns: [
            { key: "person", title: "الزبون" },
            { key: "phone", title: "الهاتف" },
            { key: "last_date", title: "آخر حركة", kind: "date" },
            { key: "current", title: AGING_LABELS.current, kind: "money" },
            {
              key: "days_31_60",
              title: AGING_LABELS.days_31_60,
              kind: "money",
            },
            {
              key: "days_61_90",
              title: AGING_LABELS.days_61_90,
              kind: "money",
            },
            { key: "over_90", title: AGING_LABELS.over_90, kind: "money" },
            { key: "total", title: "المجموع", kind: "money" },
          ],
          rows: section.rows.map((row) => ({
            cells: {
              person: row.person_name ?? "بلا زبون",
              phone: row.phone,
              last_date: row.last_date,
              current: row.current,
              days_31_60: row.days_31_60,
              days_61_90: row.days_61_90,
              over_90: row.over_90,
              total: row.total,
            },
            links: only({ person: personLink(links, row.person_id) }),
          })),
          total: { person: "المجموع", ...section.totals },
          empty: "لا ذمم على الزبائن.",
        },
      ],
    })),
  };
}

// ─── الذمم الدائنة ─────────────────────────────────────────────────────
export function payablesDocument(
  report: PayablesReport,
  links: ReportLinks,
): ReportDocument {
  const people = (
    title: string,
    rows: PayablePersonRow[],
    total: string,
    empty: string,
  ): ReportTable => ({
    title,
    columns: [
      { key: "person", title: "الزبون" },
      { key: "phone", title: "الهاتف" },
      { key: "amount", title: "المبلغ", kind: "money" },
    ],
    rows: rows.map((row) => ({
      cells: {
        person: row.person_name ?? "بلا زبون",
        phone: row.phone,
        amount: row.amount,
      },
      links: only({ person: personLink(links, row.person_id) }),
    })),
    total: { person: "المجموع", amount: total },
    empty,
  });
  return {
    title: "الذمم الدائنة",
    period: dayText(report.as_of),
    fileName: `الذمم-الدائنة-${report.as_of}`,
    notes: [
      "أمانات العملاء مال الملاك والبائعين وتأمينات المستأجرين يحفظه المكتب، وليست إيراداً.",
    ],
    sections: report.sections.map((section) => ({
      currency: section.currency,
      warning:
        section.totals.employee_shares === section.totals.employee_shares_ledger
          ? null
          : `حصص الموظفين في القيود ${section.totals.employee_shares_ledger} تختلف عن المتبقي من حصص العمولات: قيد يدوي على حساب العمولات المستحقة.`,
      figures: [
        { label: "أمانات العملاء", value: section.totals.client_funds },
        { label: "ذمم دائنة أخرى", value: section.totals.payables },
        {
          label: "حصص الموظفين غير المدفوعة",
          value: section.totals.employee_shares,
        },
      ],
      tables: [
        people(
          "أمانات العملاء",
          section.client_funds,
          section.totals.client_funds,
          "لا أمانات محفوظة.",
        ),
        people(
          "ذمم دائنة أخرى",
          section.payables,
          section.totals.payables,
          "لا ذمم أخرى.",
        ),
        {
          title: "حصص الموظفين",
          columns: [
            { key: "name", title: "الموظف" },
            { key: "shares", title: "حصصه", kind: "money" },
            { key: "paid", title: "المدفوع", kind: "money" },
            { key: "owed", title: "المتبقي له", kind: "money" },
          ],
          rows: section.employees.map((row) => ({
            cells: {
              name: row.display_name,
              shares: row.shares,
              paid: row.paid,
              owed: row.owed,
            },
          })),
          total: { name: "المجموع", owed: section.totals.employee_shares },
          empty: "لا حصص غير مدفوعة.",
        },
      ],
    })),
  };
}

// ─── دفتر حساب ─────────────────────────────────────────────────────────
export function ledgerDocument(
  statement: AccountStatement,
  links: ReportLinks,
): ReportDocument {
  const account = statement.account;
  const currency: Currency = account.currency ?? "IQD";
  const notes = [
    account.normal_side === "debit"
      ? "الرصيد = المدين − الدائن."
      : "الرصيد = الدائن − المدين.",
  ];
  if (statement.truncated)
    notes.unshift("أكثر من 2000 سطر: ضيّق المدة لترى كلها.");
  return {
    title: `دفتر حساب ${account.code} ${account.name}`,
    period: statement.from
      ? periodText(statement.from, statement.to ?? statement.from)
      : statement.to
        ? `حتى ${formatDate(statement.to)}`
        : "كل المدة",
    fileName: `دفتر-${account.code}`,
    notes,
    sections: [
      {
        currency,
        figures: [
          { label: "أول المدة", value: statement.opening_balance },
          { label: "آخر المدة", value: statement.closing_balance },
        ],
        tables: [
          {
            title: "الحركات",
            columns: [
              { key: "date", title: "التاريخ", kind: "date" },
              { key: "code", title: "القيد" },
              { key: "description", title: "البيان" },
              { key: "debit", title: "مدين", kind: "money" },
              { key: "credit", title: "دائن", kind: "money" },
              { key: "balance", title: "الرصيد", kind: "money" },
            ],
            rows: statement.lines.map((line) => ({
              cells: {
                date: line.entry_date,
                code: line.code,
                description: line.memo
                  ? `${line.description} — ${line.memo}`
                  : line.description,
                debit: isZero(line.debit) ? null : line.debit,
                credit: isZero(line.credit) ? null : line.credit,
                balance: line.balance,
              },
              links: links.can("accounting.read")
                ? { code: `/accounting/journal/${line.entry_id}` }
                : undefined,
            })),
            empty: "لا حركة على الحساب في المدة.",
          },
        ],
      },
    ],
  };
}
