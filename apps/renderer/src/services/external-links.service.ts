import { mapLinkUrl } from "../utils/mapLocation";

export async function openMapLink(value: string) {
  const url = mapLinkUrl(value);
  if (!url) throw new Error("رابط الموقع غير صالح.");
  if (window.dalalyConfig?.openMapLink) {
    const result = await window.dalalyConfig.openMapLink(url.href);
    if (!result.ok) throw new Error("تعذر فتح الرابط.");
    return;
  }
  // The browser demo has no Electron preload bridge.
  if (window.location.protocol === "file:")
    throw new Error("خدمة فتح الروابط غير متوفرة.");
  window.open(url.href, "_blank", "noopener,noreferrer");
}
