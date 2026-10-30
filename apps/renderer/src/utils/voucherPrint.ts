/**
 * The printed copy of a receipt or payment voucher: an A5 page in Arabic with
 * the office's header, the amount in figures and words, what it is for, and
 * signature lines. Printed or saved as PDF through the platform (Electron's
 * engine); fonts and the logo are embedded, as the print window loads nothing.
 * A voided voucher prints with "ملغى" across it and its void reason.
 */
import { platform } from "../platform";
import { voucherKindLabel, voucherPurposeLabel } from "../constants/accounting";
import { fontFacesFor, officeLogoDataUrl } from "./contractExport";
import { formatAmount, formatDate } from "./format";
import type { VoucherDetail } from "../types";

const escapeHtml = (value: string | null | undefined) =>
  (value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export async function voucherHtml(voucher: VoucherDetail) {
  const [faces, logo] = await Promise.all([
    fontFacesFor(["IBM Plex Sans Arabic"]),
    officeLogoDataUrl(),
  ]);
  const receipt = voucher.kind === "receipt";
  const office = voucher.office;
  const contact = [
    office?.phone_primary,
    office?.phone_secondary,
    office?.address,
    office?.license_number ? `إجازة ${office.license_number}` : null,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");
  const row = (label: string, value: string) =>
    `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
  const details = [
    voucher.deal_code ? `الصفقة ${escapeHtml(voucher.deal_code)}` : "",
    voucher.reference ? `المرجع ${escapeHtml(voucher.reference)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${voucherKindLabel(voucher.kind)} ${escapeHtml(voucher.code)}</title>
<style>
${faces}
@page { size: A5 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "IBM Plex Sans Arabic", Tahoma, sans-serif; color: #111; font-size: 12pt; }
.sheet { position: relative; border: 1.5pt solid #222; border-radius: 6pt; padding: 10mm 12mm; min-height: 120mm; }
header { display: flex; align-items: center; gap: 10mm; border-bottom: 1pt solid #999; padding-bottom: 4mm; }
header img { max-height: 18mm; max-width: 30mm; object-fit: contain; }
header .office { flex: 1; }
header .office strong { font-size: 15pt; display: block; }
header .office span { font-size: 9pt; color: #444; }
.title { display: flex; justify-content: space-between; align-items: baseline; margin: 5mm 0 4mm; }
.title h1 { font-size: 18pt; margin: 0; }
.title .meta { font-size: 11pt; text-align: left; }
.amount { display: flex; gap: 6mm; align-items: center; margin-bottom: 4mm; }
.amount .figure { border: 1.5pt solid #222; border-radius: 4pt; padding: 2mm 5mm; font-size: 15pt; font-weight: 700; direction: ltr; unicode-bidi: isolate; }
.amount .words { font-size: 11pt; }
.row { display: flex; gap: 4mm; padding: 2mm 0; border-bottom: 0.75pt dotted #888; }
.row .label { min-width: 34mm; color: #444; }
.row .value { flex: 1; font-weight: 600; }
.signatures { display: flex; justify-content: space-between; margin-top: 12mm; font-size: 10pt; }
.signatures div { width: 30%; text-align: center; border-top: 0.75pt solid #444; padding-top: 2mm; }
.foot { margin-top: 5mm; font-size: 8pt; color: #666; display: flex; justify-content: space-between; }
.void { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.void span { font-size: 64pt; font-weight: 800; color: rgba(190, 0, 0, 0.22); transform: rotate(-18deg); border: 6pt solid rgba(190, 0, 0, 0.22); padding: 0 10mm; border-radius: 8pt; }
.void-note { color: #a00; font-weight: 600; }
</style>
</head>
<body>
<div class="sheet">
  <header>
    ${logo ? `<img src="${logo}" alt="">` : ""}
    <div class="office">
      <strong>${escapeHtml(office?.company_name || "المكتب")}</strong>
      <span>${contact}</span>
    </div>
  </header>
  <div class="title">
    <h1>${voucherKindLabel(voucher.kind)}</h1>
    <div class="meta">
      <div>الرقم: <bdi>${escapeHtml(voucher.code)}</bdi></div>
      <div>التاريخ: ${escapeHtml(formatDate(voucher.voucher_date))}</div>
    </div>
  </div>
  <div class="amount">
    <div class="figure">${escapeHtml(formatAmount(voucher.amount, voucher.currency))}</div>
    <div class="words">${escapeHtml(voucher.amount_in_words)}</div>
  </div>
  ${row(receipt ? "استلمنا من" : "صرفنا إلى", escapeHtml(voucher.party_name))}
  ${row("وذلك عن", escapeHtml(voucher.description))}
  ${row("الغرض", escapeHtml(voucherPurposeLabel(voucher.kind, voucher.purpose)) + (details ? ` · ${details}` : ""))}
  ${row(receipt ? "قُبض في" : "صُرف من", escapeHtml(voucher.money_account_name))}
  ${voucher.status === "voided" ? row("ملغى", `<span class="void-note">${escapeHtml(voucher.void_reason)}</span>`) : ""}
  <div class="signatures">
    <div>${receipt ? "الدافع" : "المستلم"}</div>
    <div>المحاسب</div>
    <div>المدير</div>
  </div>
  <div class="foot">
    <span>قيد اليومية <bdi>${escapeHtml(voucher.journal_entry_code)}</bdi></span>
    <span>${escapeHtml(voucher.created_by_name ?? "")}</span>
  </div>
  ${voucher.status === "voided" ? '<div class="void"><span>ملغى</span></div>' : ""}
</div>
</body>
</html>`;
}

export async function printVoucher(voucher: VoucherDetail) {
  return platform.printHtml({
    html: await voucherHtml(voucher),
    suggestedName: voucher.code,
  });
}

export async function exportVoucherPdf(voucher: VoucherDetail) {
  return platform.exportPdf({
    html: await voucherHtml(voucher),
    suggestedName: `${voucher.code}.pdf`,
    title: `${voucherKindLabel(voucher.kind)} ${voucher.code}`,
    text: "",
  });
}
