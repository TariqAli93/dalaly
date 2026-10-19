export function isSameDocumentNavigation(current, target) {
  try {
    const from = new URL(current),
      to = new URL(target);
    if (!["file:", "http:", "https:"].includes(from.protocol)) return false;
    from.hash = "";
    to.hash = "";
    return from.href === to.href;
  } catch {
    return false;
  }
}

export function safeExternalUrl(value) {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function safeMapLinkUrl(value) {
  const safe = safeExternalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.protocol !== "https:" || url.port) return null;
  if (
    ["openstreetmap.org", "www.openstreetmap.org"].includes(url.hostname) &&
    ["/", "/search", "/search/", "/directions", "/directions/"].includes(
      url.pathname,
    )
  )
    return url.href;
  // Previously saved Google links remain safe to open; there is no Google SDK.
  if (
    ["google.com", "www.google.com"].includes(url.hostname) &&
    /^\/maps(?:\/|$)/.test(url.pathname)
  )
    return url.href;
  if (["maps.google.com", "maps.app.goo.gl"].includes(url.hostname))
    return url.href;
  if (url.hostname === "goo.gl" && /^\/maps(?:\/|$)/.test(url.pathname))
    return url.href;
  return null;
}
