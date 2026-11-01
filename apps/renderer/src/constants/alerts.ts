import type { BusinessAlertKey } from "../types";

/**
 * تنبيهات مركز الإشعارات: عنوان كل تنبيه وأيقونته والصفحة التي تفتح سجلاته.
 * الأعداد من /dashboard/alerts وتعريفاتها في docs/OPERATIONS_DASHBOARD.md.
 * `to` يتلقى can: صفحة التقارير لمن يملكها، وإلا القائمة نفسها.
 */
export const ALERTS: Record<
  BusinessAlertKey,
  {
    title: string;
    icon: string;
    to: (can: (permission: string) => boolean) => string;
  }
> = {
  tasks_overdue: {
    title: "مهام فات موعدها",
    icon: "mdi-clipboard-alert-outline",
    to: () => "/tasks?due=overdue",
  },
  installments_overdue: {
    title: "أقساط إيجار متأخرة",
    icon: "mdi-cash-clock",
    to: () => "/leases?view=overdue",
  },
  tasks_today: {
    title: "مهام اليوم",
    icon: "mdi-calendar-today",
    to: () => "/tasks?due=today",
  },
  deals_stalled: {
    title: "صفقات راكدة منذ 14 يوماً",
    icon: "mdi-timer-sand",
    to: () => "/deals?stalled=1",
  },
  leases_expiring: {
    title: "إيجارات تنتهي خلال 30 يوماً",
    icon: "mdi-calendar-end",
    to: (can) =>
      can("reports.operations") ? "/reports?report=leases&days=30" : "/leases",
  },
  customers_needing_contact: {
    title: "زبائن بلا تواصل منذ 30 يوماً",
    icon: "mdi-account-clock-outline",
    to: (can) =>
      can("reports.operations") ? "/reports?report=customers" : "/people",
  },
};
