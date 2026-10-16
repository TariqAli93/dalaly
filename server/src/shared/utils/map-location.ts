export type Coordinates = { lat: number; lng: number };

export function coordinateNumber(value: unknown): number | null {
  if (value == null || (typeof value === "string" && !value.trim()))
    return null;
  if (typeof value !== "number" && typeof value !== "string") return NaN;
  if (
    typeof value === "string" &&
    !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())
  )
    return NaN;
  return Number(value);
}

export function validCoordinates(
  latitude: unknown,
  longitude: unknown,
): Coordinates | null {
  const lat = coordinateNumber(latitude);
  const lng = coordinateNumber(longitude);
  return lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

// Exact hosts and paths protect both external links and redirect resolution.
export function googleMapsUrl(value: string): URL | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    const host = url.hostname;
    if (
      (host === "www.google.com" || host === "google.com") &&
      /^\/maps(?:\/|$)/.test(url.pathname)
    )
      return url;
    if (host === "maps.google.com" || host === "maps.app.goo.gl") return url;
    if (host === "goo.gl" && /^\/maps(?:\/|$)/.test(url.pathname)) return url;
  } catch {
    /* Invalid URLs are rejected. */
  }
  return null;
}

function pair(value: string): Coordinates | null {
  const match = value
    .trim()
    .match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))$/);
  return match ? validCoordinates(match[1], match[2]) : null;
}

export function parseGoogleMapsUrl(value: string): Coordinates | null {
  const url = googleMapsUrl(value);
  if (!url || url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl")
    return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname + url.hash);
  } catch {
    return null;
  }
  // A place's pin takes precedence over the @lat,lng viewport center.
  const place = path.match(/!3d([+-]?[\d.]+)!4d([+-]?[\d.]+)/);
  if (place) return validCoordinates(place[1], place[2]);
  for (const key of ["query", "q", "destination", "ll", "center"]) {
    const point = pair(url.searchParams.get(key) ?? "");
    if (point) return point;
  }
  const at = path.match(/@([+-]?[\d.]+),([+-]?[\d.]+)(?:,|\/|$)/);
  if (at) return validCoordinates(at[1], at[2]);
  const segment = path.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1];
  return segment ? pair(segment) : null;
}

export function mapLinkUrl(value: string): URL | null {
  const legacy = googleMapsUrl(value);
  if (legacy) return legacy;
  if (value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["openstreetmap.org", "www.openstreetmap.org"].includes(url.hostname) &&
      ["/", "/search", "/search/", "/directions", "/directions/"].includes(
        url.pathname,
      )
    )
      return url;
  } catch {
    /* Invalid URLs are rejected. */
  }
  return null;
}

export function parseMapLink(value: string): Coordinates | null {
  const url = mapLinkUrl(value);
  if (!url) return null;
  if (!["openstreetmap.org", "www.openstreetmap.org"].includes(url.hostname))
    return parseGoogleMapsUrl(value);
  // A saved pin is more precise than the map viewport in the hash.
  const lat = url.searchParams.get("mlat");
  const lng = url.searchParams.get("mlon");
  if (lat !== null || lng !== null) return validCoordinates(lat, lng);
  const viewport = url.hash.match(
    /^#map=\d+(?:\.\d+)?\/([^/]+)\/([^/&]+)(?:&.*)?$/,
  );
  return viewport ? validCoordinates(viewport[1], viewport[2]) : null;
}

export function buildMapLink(point: Coordinates): string {
  const lat = point.lat.toFixed(8);
  const lng = point.lng.toFixed(8);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
