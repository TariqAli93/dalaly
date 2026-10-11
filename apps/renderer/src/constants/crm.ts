export function personStatusLabel(value: string) {
  return (
    (
      { active: "نشط", inactive: "غير نشط", archived: "مؤرشف" } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}
export function contractStatusLabel(value: string) {
  return (
    (
      {
        active: "صادر",
        draft: "مسودة",
        completed: "مكتمل",
        cancelled: "ملغى",
        expired: "منتهي",
      } as Record<string, string>
    )[value] ?? value
  );
}
export function contractTypeLabel(value: string) {
  return value === "sale" ? "بيع" : "إيجار";
}
