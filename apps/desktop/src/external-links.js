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

export function safeGoogleMapsUrl(value) {
  const safe = safeExternalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.protocol !== "https:" || url.port) return null;
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
