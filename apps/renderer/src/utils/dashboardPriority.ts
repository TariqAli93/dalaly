import type { DashboardMatching, DashboardOverview } from "../types";

/** أقسام اللوحة التي يفتحها مؤشر أو أولوية. */
export type DashboardSection =
  "matches" | "appointments" | "customers" | "risks" | "viewings" | "stale";

/** رقم في شريط الملخّص؛ value = null أثناء تحميل قسمه. */
export type KpiItem = {
  key: string;
  label: string;
  value: number | null;
  note?: string;
  icon: string;
  tone: "primary" | "warning" | "error" | "success";
  target: DashboardSection;
};

export type PriorityItem = {
  key: "appointments" | "viewings" | "matches" | "unmatched" | "stale";
  title: string;
  detail: string;
  count: number;
  /** ما يجعله عاجلاً، كلمة واحدة على الشريحة. */
  urgency: string;
  tone: "error" | "warning" | "primary";
  /** أقرب موعد مرتبط به، إن وُجد. */
  due: string | null;
  target: DashboardSection;
  action: string;
};

/**
 * الأعمال المعلّقة مرتّبة بالأدلة المسجّلة، لا بدرجات تقديرية:
 * 1. مواعيد متابعة اليوم: التزام بوقت محدد.
 * 2. معاينات مضى موعدها ولم يُسجَّل بعدها شيء على العرض.
 * 3. طلبات لها عروض متاحة تحقق شروطها الأساسية: فرصة بيع أو إيجار.
 * 4. طلبات مفتوحة بلا أي عرض مطابق: زبون قد يذهب لمكتب آخر.
 * 5. عروض متاحة بلا تعديل ولا متابعة منذ مدة الركود.
 * لا يظهر إلا ما عدده أكبر من صفر، وما لم يُحمَّل قسمه بعد لا يدخل الترتيب.
 */
export function priorityItems(
  overview: DashboardOverview | null,
  matching: DashboardMatching | null,
): PriorityItem[] {
  const items: PriorityItem[] = [];
  const today = overview?.appointments?.today ?? 0;
  if (today) {
    const first = overview!.appointments!.items[0];
    items.push({
      key: "appointments",
      title: "مواعيد متابعة اليوم",
      detail: "اتصالات ومعاينات مسجّلة على العروض والإيجارات لهذا اليوم.",
      count: today,
      urgency: "اليوم",
      tone: "error",
      due: first?.scheduled_at ?? null,
      target: "appointments",
      action: "عرض المواعيد",
    });
  }
  const viewings = overview?.viewings_without_outcome;
  if (viewings?.total) {
    items.push({
      key: "viewings",
      title: "سجّل نتيجة المعاينات",
      detail: `معاينات مضى موعدها خلال آخر ${viewings.days} يوماً ولم تُسجَّل بعدها أي متابعة على العرض.`,
      count: viewings.total,
      urgency: "متأخرة",
      tone: "warning",
      due: viewings.items[0]?.scheduled_at ?? null,
      target: "viewings",
      action: "مراجعة المعاينات",
    });
  }
  if (matching) {
    const counts = [matching.counts.sale, matching.counts.rental];
    const withMatches = counts.reduce(
      (sum, c) => sum + (c?.with_matches ?? 0),
      0,
    );
    const without = counts.reduce(
      (sum, c) => sum + (c?.without_matches ?? 0),
      0,
    );
    if (withMatches)
      items.push({
        key: "matches",
        title: "اعرض العروض المطابقة على أصحاب الطلبات",
        detail: "عروض متاحة تحقق النوع والموقع والميزانية التي طلبها الزبون.",
        count: withMatches,
        urgency: "فرصة",
        tone: "primary",
        due: null,
        target: "matches",
        action: "فتح المطابقات",
      });
    if (without)
      items.push({
        key: "unmatched",
        title: "ابحث عن عروض للطلبات العالقة",
        detail:
          "لا يوجد عرض متاح يحقق شروطها الأساسية. ابحث عن عرض أو راجع الشروط مع الزبون.",
        count: without,
        urgency: "خطر",
        tone: "warning",
        due: null,
        target: "risks",
        action: "عرض الطلبات",
      });
  }
  const stale =
    (overview?.stale_listings.sale?.total ?? 0) +
    (overview?.stale_listings.rental?.total ?? 0);
  if (stale)
    items.push({
      key: "stale",
      title: "حرّك العروض الراكدة",
      detail: `عروض متاحة لم تُعدَّل ولم تُسجَّل عليها متابعة منذ ${overview!.stale_days} يوماً. حدّث السعر أو تواصل مع المالك.`,
      count: stale,
      urgency: "ركود",
      tone: "warning",
      due: null,
      target: "stale",
      action: "عرض العروض",
    });
  return items;
}
