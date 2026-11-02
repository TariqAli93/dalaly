/** أقسام اللوحة التي يمرّر إليها مؤشر. */
export type DashboardSection = "matches" | "queue";

/**
 * رقم في شريط الملخّص؛ value = null أثناء تحميل قسمه. `to` يفتح قائمته
 * الكاملة، وإلا `target` يمرّر إلى قسمه في اللوحة.
 */
export type KpiItem = {
  key: string;
  label: string;
  value: number | null;
  note?: string;
  icon: string;
  tone: "primary" | "warning" | "error" | "success";
  to?: string;
  target?: DashboardSection;
};
