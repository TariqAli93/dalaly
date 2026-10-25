export const AMENITY_OPTIONS = [
  { title: "موقف سيارة", key: "parking" },
  { title: "مصعد", key: "elevator" },
  { title: "مفروش", key: "furnished" },
  { title: "مولدة", key: "generator" },
  { title: "ماء", key: "water" },
  { title: "حراسة", key: "security" },
  { title: "حديقة", key: "garden" },
  { title: "مسبح", key: "pool" },
  { title: "تكييف", key: "air_conditioning" },
];

const AMENITY_LABELS = Object.fromEntries(
  AMENITY_OPTIONS.map((item) => [item.key, item.title]),
);

const AMENITY_KEYS_BY_TITLE = Object.fromEntries(
  AMENITY_OPTIONS.map((item) => [item.title, item.key]),
);

/**
 * يفصل مميزات طلب محفوظ إلى مفاتيح القائمة وما سواها. الطلبات القديمة كُتبت
 * نصاً حراً ("مصعد") فلا تطابق مفاتيح العروض ("elevator")؛ ما يطابق اسم خيار
 * يُحوَّل إلى مفتاحه، والباقي يُعاد كما هو كي لا يُحذف دون علم المستخدم.
 */
export function splitAmenityKeys(
  value: Record<string, unknown> | null | undefined,
) {
  const known = new Set<string>();
  const other: string[] = [];
  for (const [key, enabled] of Object.entries(value ?? {})) {
    if (!enabled) continue;
    const name = key.trim();
    if (AMENITY_LABELS[name]) known.add(name);
    else if (AMENITY_KEYS_BY_TITLE[name])
      known.add(AMENITY_KEYS_BY_TITLE[name]);
    else if (name) other.push(name);
  }
  return { known: [...known], other };
}

export function formatAmenities(
  value: Record<string, unknown> | null | undefined,
) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(
      ([, enabled]) =>
        enabled === true || (typeof enabled === "string" && enabled.trim()),
    )
    .map(([key, enabled]) => {
      const label = AMENITY_LABELS[key] ?? key.replace(/[_-]/g, " ");
      return enabled === true ? label : `${label}: ${String(enabled)}`;
    });
}

export function amenitiesText(
  value: Record<string, unknown> | null | undefined,
) {
  return formatAmenities(value).join("، ");
}
