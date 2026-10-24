/** What an unnamed listing is called: "عقار P-0001", "إيجار R-0001". */
const UNNAMED_LISTING_LABELS = {
  properties: "عقار",
  rentals: "إيجار",
} as const;

type ListingTable = keyof typeof UNNAMED_LISTING_LABELS;

export function toApiObject<T extends Record<string, unknown>>(
  value: T,
  tableName?: ListingTable,
) {
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [toSnakeCase(key), item]),
  );
  if (tableName && typeof value.code === "string" && value.name == null) {
    result.name = `${UNNAMED_LISTING_LABELS[tableName]} ${value.code}`;
  }
  return result;
}

export function toApiObjects<T extends Record<string, unknown>>(
  values: T[],
  tableName?: ListingTable,
) {
  return values.map((value) => toApiObject(value, tableName));
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
