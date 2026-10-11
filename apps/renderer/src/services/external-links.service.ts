import { googleMapsUrl } from "../utils/googleMapsUrl";

export async function openGoogleMaps(value: string) {
  const url = googleMapsUrl(value);
  if (!url) throw new Error("رابط الموقع غير صالح.");
  if (window.dalalyConfig?.openGoogleMaps) {
    const result = await window.dalalyConfig.openGoogleMaps(url.href);
    if (!result.ok) throw new Error("تعذر فتح الرابط.");
    return;
  }
  // The browser demo has no Electron preload bridge.
  if (window.location.protocol === "file:")
    throw new Error("خدمة فتح الروابط غير متوفرة.");
  window.open(url.href, "_blank", "noopener,noreferrer");
}
