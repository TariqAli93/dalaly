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

export function formatAmenities(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(([, enabled]) => enabled === true || (typeof enabled === "string" && enabled.trim()))
    .map(([key, enabled]) => {
      const label = AMENITY_LABELS[key] ?? key.replace(/[_-]/g, " ");
      return enabled === true ? label : `${label}: ${String(enabled)}`;
    });
}

export function amenitiesText(value: Record<string, unknown> | null | undefined) {
  return formatAmenities(value).join("، ");
}
