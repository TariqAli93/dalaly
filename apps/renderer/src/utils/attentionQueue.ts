import { dealStageLabel } from "../constants/deals";
import { followupTypeLabel } from "../constants/crm";
import {
  daysSince,
  formatShortDate,
  formatTime,
  pluralizeDays,
} from "./format";
import type {
  BusinessDeal,
  BusinessSummary,
  CommissionRecord,
  Currency,
  DashboardAppointment,
  DashboardCustomer,
  DashboardMatching,
  DashboardOverview,
  OverdueInstallmentRecord,
  TaskRecord,
} from "../types";

/**
 * «يحتاج متابعتك»: ما ينتظر صاحب المكتب من مصادر اللوحة الموجودة، في قائمة
 * واحدة. لا درجة أولوية مقدّرة: الترتيب بالمرتبة المكتوبة على كل سطر (متأخر،
 * اليوم، للتحصيل، تواصل، متابعة) ثم بالتاريخ، الأقدم أولاً. كل سطر التزام
 * مختلف لا يُدمج مع غيره، إلا ما هو السجل نفسه من مصدرين (مهمة معاينة
 * متأخرة تظهر مرة، وزبون بلا تواصل ولديه مطابقات يظهر مرة بسببيه).
 */

export type AttentionTier =
  "overdue" | "today" | "collect" | "contact" | "followup";

export const ATTENTION_TIERS: Array<{ value: AttentionTier; title: string }> = [
  { value: "overdue", title: "متأخر" },
  { value: "today", title: "اليوم" },
  { value: "collect", title: "للتحصيل" },
  { value: "contact", title: "تواصل" },
  { value: "followup", title: "متابعة" },
];

/** ما يفعله الزر الوحيد في السطر. */
export type AttentionAction =
  | { type: "route"; to: string }
  | { type: "collect-commission"; commission: CommissionRecord }
  | { type: "collect-installment"; installment: OverdueInstallmentRecord }
  | { type: "customer"; customer: DashboardCustomer }
  | { type: "viewing"; appointment: DashboardAppointment };

export type AttentionItem = {
  key: string;
  tier: AttentionTier;
  icon: string;
  /** من أو ما المعني: الزبون أو العرض أو الإيجار. */
  title: string;
  /** السجل المرتبط ولماذا يحتاج انتباهاً. */
  reason: string;
  /** التاريخ الذي يرتّب السطر داخل مرتبته؛ null في آخرها. */
  date: string | null;
  /** ما يُكتب في عمود التاريخ ("فات 28/10"، "بعد 12 يوماً"). */
  when: string;
  amount: { value: string; currency: Currency } | null;
  /** رابط العنوان إلى سجله، إن سُمح بفتحه. */
  link: string | null;
  action: AttentionAction;
  actionLabel: string;
};

export type AttentionSources = {
  business: BusinessSummary | null;
  overview: DashboardOverview | null;
  matching: DashboardMatching | null;
  commissions: CommissionRecord[] | null;
};

export type AttentionPermissions = {
  can: (permission: string) => boolean;
  canFollowup: (kind: "sale" | "rental") => boolean;
};

const shortDate = formatShortDate;
const time = formatTime;
/** «يوم واحد»، «يومين»، «5 أيام»، «12 يوماً» بعد «متأخر» أو «بعد». */
const days = (count: number) =>
  count <= 1
    ? "يوم واحد"
    : count === 2
      ? "يومين"
      : count <= 10
        ? `${count} أيام`
        : `${count} يوماً`;

function taskItem(
  task: TaskRecord,
  tier: AttentionTier,
  p: AttentionPermissions,
): AttentionItem {
  const listingLink = task.property_id
    ? `/properties/${task.property_id}`
    : task.rental_id
      ? `/rentals/${task.rental_id}`
      : null;
  const personLink =
    task.person_id && p.can("people.read")
      ? `/clients/${task.person_id}`
      : null;
  const link = personLink ?? listingLink;
  const about = [task.listing_code, task.request_code]
    .filter(Boolean)
    .join(" · ");
  return {
    key: `task:${task.source}:${task.id}`,
    tier,
    icon: tier === "overdue" ? "mdi-alarm" : "mdi-calendar-today",
    title:
      task.person_name ??
      task.listing_name ??
      task.listing_code ??
      followupTypeLabel(task.type),
    reason: [followupTypeLabel(task.type), about, task.notes]
      .filter(Boolean)
      .join(" · "),
    date: task.scheduled_at,
    when: task.scheduled_at
      ? tier === "overdue"
        ? `فات ${shortDate(task.scheduled_at)}`
        : time(task.scheduled_at)
      : "",
    amount: null,
    link,
    action: { type: "route", to: link ?? "/tasks" },
    actionLabel: personLink
      ? "فتح الزبون"
      : listingLink
        ? "فتح العرض"
        : "فتح المهام",
  };
}

function appointmentItem(item: DashboardAppointment): AttentionItem {
  const link =
    item.kind === "sale"
      ? `/properties/${item.listing_id}`
      : `/rentals/${item.listing_id}`;
  return {
    key: `task:${item.kind === "sale" ? "sale_followup" : "rental_followup"}:${item.id}`,
    tier: "today",
    icon: "mdi-calendar-today",
    title: item.listing_name || item.listing_code,
    reason: [followupTypeLabel(item.type), item.listing_code, item.notes]
      .filter(Boolean)
      .join(" · "),
    date: item.scheduled_at,
    when: time(item.scheduled_at),
    amount: null,
    link,
    action: { type: "route", to: link },
    actionLabel: "فتح الموعد",
  };
}

function installmentItem(
  item: OverdueInstallmentRecord,
  p: AttentionPermissions,
): AttentionItem {
  const link = `/leases/${item.lease_id}`;
  const canCollect = p.can("vouchers.receipt");
  return {
    key: `installment:${item.id}`,
    tier: "overdue",
    icon: "mdi-home-clock-outline",
    title: item.tenant_name ?? item.lease_code,
    reason: `القسط ${item.seq} من الإيجار ${item.lease_code} · متأخر ${days(item.days_overdue)}`,
    date: item.due_date,
    when: `فات ${shortDate(item.due_date)}`,
    amount: { value: item.left, currency: item.currency },
    link,
    action: canCollect
      ? { type: "collect-installment", installment: item }
      : { type: "route", to: link },
    actionLabel: canCollect ? "تحصيل القسط" : "مراجعة القسط",
  };
}

function commissionItem(
  item: CommissionRecord,
  p: AttentionPermissions,
): AttentionItem {
  const link = `/accounting/commissions/${item.id}`;
  const canCollect = p.can("vouchers.receipt");
  return {
    key: `commission:${item.id}`,
    tier: "collect",
    icon: "mdi-percent-circle-outline",
    title: item.payer_name ?? item.code,
    reason: [
      `عمولة ${item.code}`,
      item.deal_code ? `الصفقة ${item.deal_code}` : null,
      "لم تُقبض كلها",
    ]
      .filter(Boolean)
      .join(" · "),
    date: item.commission_date,
    when: shortDate(item.commission_date),
    amount: { value: item.outstanding, currency: item.currency },
    link,
    action: canCollect
      ? { type: "collect-commission", commission: item }
      : { type: "route", to: link },
    actionLabel: canCollect ? "تحصيل" : "فتح العمولة",
  };
}

type ContactRow = NonNullable<
  BusinessSummary["customers"]
>["needing_contact"]["rows"][number];

function contactItem(
  row: ContactRow | null,
  decision: DashboardCustomer | null,
  p: AttentionPermissions,
): AttentionItem {
  const personId = (row?.person_id ?? decision?.person_id)!;
  const link = p.can("people.read") ? `/clients/${personId}` : null;
  const reasons: string[] = [];
  if (decision)
    reasons.push(
      `${decision.total_matches === 1 ? "عرض مطابق" : `${decision.total_matches} عروض مطابقة`} لطلبه`,
    );
  if (row) {
    reasons.push(
      row.last_contact
        ? `آخر تواصل ${pluralizeDays(daysSince(row.last_contact))}`
        : "لم يُتواصل معه",
    );
    const open = [
      row.open_deals ? `صفقات مفتوحة ${row.open_deals}` : null,
      row.open_requests ? `طلبات مفتوحة ${row.open_requests}` : null,
    ].filter(Boolean);
    if (open.length) reasons.push(open.join(" · "));
  }
  const phone = row?.phone ?? decision?.person_phone ?? null;
  if (phone) reasons.push(phone);
  return {
    key: `person:${personId}`,
    tier: "contact",
    icon: decision ? "mdi-account-arrow-left-outline" : "mdi-phone-outline",
    title: row?.person_name ?? decision!.person_name,
    reason: reasons.join(" · "),
    // Never contacted first, then the longest silence.
    date: row
      ? (row.last_contact ?? "0000-01-01")
      : (decision?.last_request_update_at ?? null),
    when: row?.last_contact
      ? shortDate(row.last_contact)
      : row
        ? "لا تواصل"
        : "",
    amount: null,
    link,
    action: decision
      ? { type: "customer", customer: decision }
      : { type: "route", to: link ?? "/people" },
    actionLabel: decision ? "عرض الخيارات" : "فتح الزبون",
  };
}

function viewingItem(
  item: DashboardAppointment,
  p: AttentionPermissions,
): AttentionItem {
  const link =
    item.kind === "sale"
      ? `/properties/${item.listing_id}`
      : `/rentals/${item.listing_id}`;
  const canRecord = p.canFollowup(item.kind);
  return {
    key: `task:${item.kind === "sale" ? "sale_followup" : "rental_followup"}:${item.id}`,
    tier: "followup",
    icon: "mdi-eye-check-outline",
    title: item.listing_name || item.listing_code,
    reason: `معاينة ${item.listing_code} بلا نتيجة مسجّلة`,
    date: item.scheduled_at,
    when: shortDate(item.scheduled_at),
    amount: null,
    link,
    action: canRecord
      ? { type: "viewing", appointment: item }
      : { type: "route", to: link },
    actionLabel: canRecord ? "تسجيل النتيجة" : "فتح العرض",
  };
}

function leaseItem(
  item: NonNullable<BusinessSummary["leases"]>["expiring"]["items"][number],
): AttentionItem {
  const link = `/leases/${item.id}`;
  return {
    key: `lease:${item.id}`,
    tier: "followup",
    icon: "mdi-calendar-end",
    title: item.tenant_name ?? item.code,
    reason: `الإيجار ${item.code} ينتهي ${shortDate(item.end_date)}: جدّد أو أنهِ`,
    date: item.end_date,
    when: `بعد ${days(item.days_left)}`,
    amount: null,
    link,
    action: { type: "route", to: link },
    actionLabel: "فتح الإيجار",
  };
}

function dealItem(item: BusinessDeal, stalledDays: number): AttentionItem {
  const link = `/deals/${item.id}`;
  return {
    key: `deal:${item.id}`,
    tier: "followup",
    icon: "mdi-handshake-outline",
    title: item.title ?? item.client_name ?? item.code,
    reason: `الصفقة ${item.code} في «${dealStageLabel(item.stage)}» ${pluralizeDays(daysSince(item.stage_changed_at))} بلا تقدّم (الحدّ ${stalledDays} يوماً)`,
    date: item.stage_changed_at,
    when: shortDate(item.stage_changed_at),
    amount: null,
    link,
    action: { type: "route", to: link },
    actionLabel: "فتح الصفقة",
  };
}

const TIER_ORDER = Object.fromEntries(
  ATTENTION_TIERS.map((tier, index) => [tier.value, index]),
);

/** الأسطر مرتّبة: المرتبة، ثم التاريخ الأقدم، ثم ما بلا تاريخ. */
export function attentionItems(
  sources: AttentionSources,
  permissions: AttentionPermissions,
): AttentionItem[] {
  const { business, overview, matching, commissions } = sources;
  const items: AttentionItem[] = [];
  const seen = new Set<string>();
  const add = (item: AttentionItem) => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    items.push(item);
  };

  for (const task of business?.tasks?.overdue.items ?? [])
    add(taskItem(task, "overdue", permissions));
  for (const item of business?.leases?.overdue.items ?? [])
    add(installmentItem(item, permissions));
  if (business?.tasks) {
    for (const task of business.tasks.today.items)
      add(taskItem(task, "today", permissions));
  } else {
    // Without the tasks section, the listing follow-ups due today.
    const today = new Date().toDateString();
    for (const item of overview?.appointments?.items ?? [])
      if (new Date(item.scheduled_at).toDateString() === today)
        add(appointmentItem(item));
  }
  for (const item of commissions ?? []) add(commissionItem(item, permissions));

  // A customer waiting on matches and on a call is one line with both reasons.
  const decisions = new Map(
    (matching?.customers.items ?? [])
      .filter((customer) => customer.total_matches > 0)
      .map((customer) => [customer.person_id, customer]),
  );
  for (const row of business?.customers?.needing_contact.rows ?? []) {
    add(contactItem(row, decisions.get(row.person_id) ?? null, permissions));
    decisions.delete(row.person_id);
  }
  for (const customer of decisions.values())
    add(contactItem(null, customer, permissions));

  for (const item of overview?.viewings_without_outcome?.items ?? [])
    add(viewingItem(item, permissions));
  for (const item of business?.leases?.expiring.items ?? [])
    add(leaseItem(item));
  const deals = business?.deals;
  for (const item of deals?.stalled.items ?? [])
    add(dealItem(item, deals!.stalled_days));

  return items.sort((a, b) => {
    const tier = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tier) return tier;
    if (a.date === b.date) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  });
}

/**
 * عدد كل مرتبة كما يعرفه الخادم (لا عدد الأسطر المحمّلة فقط، خمسة من كل
 * قائمة)، فلا يبدو أن «متأخر» ثلاثة وهو تسعة.
 */
export function attentionTotals(
  sources: AttentionSources & { commissionTotal: number | null },
): Record<AttentionTier, number> {
  const { business, overview, matching } = sources;
  const contactRows = business?.customers?.needing_contact.rows ?? [];
  const decisionsOnly = (matching?.customers.items ?? []).filter(
    (customer) =>
      customer.total_matches > 0 &&
      !contactRows.some((row) => row.person_id === customer.person_id),
  ).length;
  return {
    overdue:
      (business?.tasks?.overdue.total ?? 0) +
      (business?.leases?.overdue.total ?? 0),
    today: business?.tasks
      ? business.tasks.today.total
      : (overview?.appointments?.today ?? 0),
    collect: sources.commissionTotal ?? 0,
    contact: (business?.customers?.needing_contact.total ?? 0) + decisionsOnly,
    followup:
      (overview?.viewings_without_outcome?.total ?? 0) +
      (business?.leases?.expiring.total ?? 0) +
      (business?.deals?.stalled.total ?? 0),
  };
}
