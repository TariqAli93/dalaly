import { statusLabel } from "../constants/domain";
import { formatMoney, formatPlot } from "./format";
import type { PropertyRecord } from "../types";

function line(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return `${label}: ${value}\n`;
}

function governorateOf(p: PropertyRecord) {
  return p.governorate || p.governorate_text || "";
}
function districtOf(p: PropertyRecord) {
  return p.district || p.district_text || "";
}
/** اسم الحي المعروض: المحلول من القائمة أو النص اليدوي أو حقل المدينة القديم. */
export function neighborhoodOf(p: PropertyRecord) {
  return p.neighborhood || p.neighborhood_text || p.city || "";
}

/** نص تفصيلي كامل مناسب للدلال العراقي. */
export function buildPropertyText(p: PropertyRecord) {
  let text = "";
  text += line("كود العرض", p.code);
  text += line("نوع العقار", p.property_type);
  text += line("المحافظة", governorateOf(p));
  text += line("المنطقة", districtOf(p));
  text += line("الحي", neighborhoodOf(p));
  text += line("الجنس", p.legal_type);
  text += line("المساحة", `${p.area_value} ${p.area_unit}`);
  text += line("السعر", `${formatMoney(p.total_price)} دينار`);
  if (p.is_negotiable) text += "السعر قابل للتفاوض\n";
  text += line("الحالة", statusLabel(p.status));
  text += line("الواجهة (متر)", p.frontage);
  text += line("النزال / العمق (متر)", p.nazal);
  text += line("عرض الشارع", p.street_width);
  text += line("عدد الغرف", p.rooms_count);
  text += line("عدد الحمامات", p.bathrooms_count);
  text += line("رقم القطعة", formatPlot(p.plot_number, p.plot_letter));
  text += line("المقاطعة", p.subdistrict_name);
  text += line("المحلة", p.mahalla);
  text += line("الزقاق", p.alley);
  text += line("الدار", p.house_number);
  text += line("أقرب نقطة دالة", p.nearest_landmark);
  text += line("العنوان", p.address_details);
  text += line("اسم المالك", p.owner_name);
  text += line("هاتف المالك", p.owner_phone);
  text += line("ملاحظات", p.notes);
  return text.trim();
}

/** نص جاهز للواتساب (بدون بيانات المالك الحساسة). */
export function buildWhatsappText(p: PropertyRecord) {
  let text = "🏠 عرض عقاري\n\n";
  text += line("النوع", p.property_type);
  text += line("المحافظة", governorateOf(p));
  text += line("المنطقة", districtOf(p));
  text += line("الحي", neighborhoodOf(p));
  text += line("الجنس", p.legal_type);
  text += line("المساحة", `${p.area_value} ${p.area_unit}`);
  text += line("رقم القطعة", formatPlot(p.plot_number, p.plot_letter));
  if (p.frontage || p.nazal)
    text += line("الواجهة × النزال", `${p.frontage || "?"} × ${p.nazal || "?"} م`);
  text += line("السعر", `${formatMoney(p.total_price)} دينار`);
  if (p.is_negotiable) text += "💬 السعر قابل للتفاوض\n";
  if (p.notes) text += line("ملاحظات", p.notes);
  text += `\nكود العرض: ${p.code}`;
  return text.trim();
}

/** وصف مختصر للإعلان. */
export function buildAdText(p: PropertyRecord) {
  const place = [governorateOf(p), districtOf(p), neighborhoodOf(p)]
    .filter(Boolean)
    .join(" - ");
  const parts = [
    `${p.property_type} للبيع`,
    place,
    `${p.area_value} ${p.area_unit}`,
    `${formatMoney(p.total_price)} دينار${p.is_negotiable ? " (قابل للتفاوض)" : ""}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function buildHtmlDocument(title: string, bodyText: string) {
  const rows = bodyText
    .split("\n")
    .filter(Boolean)
    .map((l) => `<div class="row">${escapeHtml(l)}</div>`)
    .join("");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Tahoma,"Segoe UI",Arial,sans-serif;padding:32px;color:#111;line-height:1.9}
    h1{font-size:20px;margin:0 0 16px;border-bottom:2px solid #116466;padding-bottom:8px;color:#116466}
    .row{font-size:15px;padding:4px 0;border-bottom:1px solid #eee}
    @media print{body{padding:12px}}
  </style></head><body><h1>${escapeHtml(title)}</h1>${rows}</body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** طباعة عبر نافذة منفصلة (تدعم العربية بشكل صحيح). */
export function printDocument(title: string, bodyText: string) {
  const html = buildHtmlDocument(title, bodyText);
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // مهلة بسيطة لضمان تحميل المحتوى قبل الطباعة.
  setTimeout(() => win.print(), 250);
}

/**
 * تصدير PDF: في Electron عبر IPC (printToPDF) لحفظ ملف فعلي،
 * وإلا يفتح نافذة الطباعة (يمكن للمستخدم اختيار "حفظ كـ PDF").
 */
export async function exportPdf(filename: string, title: string, bodyText: string) {
  const html = buildHtmlDocument(title, bodyText);
  const bridge = window.dalalyConfig;
  if (bridge?.exportPdf) {
    return bridge.exportPdf({ html, suggestedName: filename });
  }
  printDocument(title, bodyText);
  return { ok: true, fallback: true };
}
