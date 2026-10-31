export type QueryValue = string | number | boolean | null | undefined;

/**
 * `?key=value&…` for an API path, from the filters that are set: an empty
 * string, null or undefined leaves its key out (the API reads a missing
 * filter as "any"). "" when nothing is set.
 */
export function queryString(params: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== null && value !== "")
      query.set(key, String(value));
  const text = query.toString();
  return text ? `?${text}` : "";
}
