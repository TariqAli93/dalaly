export function toApiObject<T extends Record<string, unknown>>(value: T, tableName?: string) {
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [toSnakeCase(key), item])
  );
  if (tableName && typeof value.code === "string" && value.name == null) {
    result.name = `${tableName} ${value.code}`;
  }
  return result;
}

export function toApiObjects<T extends Record<string, unknown>>(values: T[], tableName?: string) {
  return values.map((value) => toApiObject(value, tableName));
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
