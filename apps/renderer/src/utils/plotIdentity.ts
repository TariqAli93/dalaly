/**
 * هوية القطعة كما يقارنها الخادم (uq_properties_plot_identity): المحافظة
 * والمنطقة والحي بالاسم، ورقم القطعة وحرفها، بعد trim وتوحيد المسافات. بلا
 * رقم قطعة لا هوية ولا تكرار. للتحذير قبل الحفظ فقط؛ الخادم يبقى الحَكَم (409).
 */
export type PlotParts = {
  governorate?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  plotNumber?: string | null;
  plotLetter?: string | null;
};

const part = (value?: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ");

export function plotIdentityKey(parts: PlotParts): string | null {
  const plotNumber = part(parts.plotNumber);
  if (!plotNumber) return null;
  return JSON.stringify([
    part(parts.governorate),
    part(parts.district),
    part(parts.neighborhood),
    plotNumber,
    part(parts.plotLetter),
  ]);
}

export function samePlot(a: PlotParts, b: PlotParts): boolean {
  const key = plotIdentityKey(a);
  return key !== null && key === plotIdentityKey(b);
}
