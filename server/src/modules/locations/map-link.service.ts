import {
  mapLinkUrl,
  parseMapLink,
  type Coordinates,
} from "../../shared/utils/map-location.js";

export async function resolveMapLink(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<Coordinates | null> {
  let url = mapLinkUrl(value);
  if (!url) return null;
  const embedded = parseMapLink(url.href);
  if (embedded) return embedded;
  // Full coordinate-free links need manual selection; only short redirects are resolved.
  if (url.hostname !== "maps.app.goo.gl" && url.hostname !== "goo.gl")
    return null;
  const signal = AbortSignal.timeout(6000);
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetcher(url.href, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html" },
    });
    await response.body?.cancel();
    if (![301, 302, 303, 307, 308].includes(response.status)) return null;
    const redirect = response.headers.get("location");
    if (!redirect) return null;
    url = mapLinkUrl(new URL(redirect, url).href);
    if (!url) return null;
    const point = parseMapLink(url.href);
    if (point) return point;
  }
  return null;
}
