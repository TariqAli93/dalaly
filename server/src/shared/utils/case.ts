export function toApiObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [toSnakeCase(key), item])
  );
}

export function toApiObjects<T extends Record<string, unknown>>(values: T[]) {
  return values.map((value) => toApiObject(value));
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
