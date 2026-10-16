import { z } from "zod";
import { documentText, type ContractDocument } from "./legal-content.engine.js";
import { renderReferenceVisual } from "./contract-reference.design.js";

export const layoutSchema = z
  .object({
    font: z.enum(["Tahoma", "Arial", "Amiri"]).default("Tahoma"),
    font_size: z.number().min(10).max(20).default(14),
    line_height: z.number().min(1.3).max(2.5).default(1.9),
    margin_mm: z.number().min(10).max(25).default(18),
    paragraph_spacing: z.number().min(0).max(24).default(8),
    header_style: z.enum(["classic", "band", "stacked"]).default("classic"),
    border_style: z.enum(["none", "solid", "double"]).default("none"),
    signature_style: z.enum(["columns", "stacked"]).default("columns"),
    accent_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#24364b"),
  })
  .strict();
export const brandingSchema = z
  .object({
    show_logo: z.boolean().default(true),
    watermark: z.boolean().default(false),
  })
  .strict();
export type VisualSnapshot = {
  id: number;
  template_code: string;
  name: string;
  version: number;
  renderer_version: 1 | 2;
  layout_config: z.infer<typeof layoutSchema>;
  branding_config: z.infer<typeof brandingSchema>;
};
export const htmlEscape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

// No legal strings or user HTML/CSS live here. Every design renders the same
// complete document model. Store the HTML as well as this visual configuration.
export function renderVisual(d: ContractDocument, v: VisualSnapshot) {
  if (v.renderer_version === 1) return renderLegacyVisual(d, v);
  return {
    content: `مسودة — لم يتم إصدار العقد\n\n${documentText(d)}`,
    html: renderReferenceVisual(
      d,
      layoutSchema.parse(v.layout_config),
      brandingSchema.parse(v.branding_config),
      htmlEscape,
    ),
  };
}

// Version 1 remains available for old snapshots; new documents use version 2.
function renderLegacyVisual(d: ContractDocument, v: VisualSnapshot) {
  const l = layoutSchema.parse(v.layout_config),
    b = brandingSchema.parse(v.branding_config);
  const e = htmlEscape,
    o = d.data.office;
  const officeAgreement = d.data.agreement_mode === "office";
  const partyLabel = (p: ContractDocument["data"]["parties"][number]) =>
    officeAgreement
      ? `${p.role === "seller" || p.role === "lessor" ? "الطرف الأول" : "الطرف الثاني"}: ${p.label}`
      : p.label;
  const facts = (rows: Array<{ label: string; value: string }>) =>
    `<dl>${rows
      .filter((r) => !officeAgreement || r.value.trim())
      .map((r) => `<div><dt>${e(r.label)}</dt><dd>${e(r.value)}</dd></div>`)
      .join("")}</dl>`;
  const logo =
    b.show_logo &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
      o.logo_data_uri ?? "",
    )
      ? `<img class="logo" src="${e(o.logo_data_uri)}" alt="${e(o.name)}">`
      : "";
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${e(d.data.title)}</title><style>
@page{size:A4;margin:${l.margin_mm}mm;@bottom-center{direction:ltr;content:counter(page) " / " counter(pages);font-family:Tahoma,Arial;font-size:10px}}*{box-sizing:border-box}body{font-family:'${l.font}',Tahoma,Arial,sans-serif;font-size:${l.font_size}px;line-height:${l.line_height};color:#17212b;margin:0;direction:rtl}main{border:${l.border_style === "none" ? "0" : l.border_style === "double" ? "4px double" : "1px solid"} ${l.accent_color};padding:${l.border_style === "none" ? 0 : 12}px}header{border-bottom:2px solid ${l.accent_color};padding:12px;display:flex;gap:16px;align-items:center;${l.header_style === "stacked" ? "flex-direction:column;text-align:center;" : ""}${l.header_style === "band" ? `background:${l.accent_color};color:white;` : ""}}.logo{max-width:90px;max-height:90px}h1{font-size:1.45em;text-align:center}h2{font-size:1.1em;color:${l.accent_color};break-after:avoid}.meta{font-size:.85em}dl{margin:0}dl>div{display:flex;gap:8px;break-inside:avoid}dt{font-weight:bold;min-width:95px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.party,.asset,.clause{margin-bottom:${l.paragraph_spacing}px}.clause p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.clause h3{font-size:1em;margin:0;break-after:avoid}.signatures{display:${l.signature_style === "columns" ? "flex" : "block"};flex-wrap:wrap;justify-content:space-around;gap:32px;margin-top:36px;break-inside:avoid}.warning{border:2px solid #975500;padding:12px;color:#7c4600;white-space:pre-wrap}.watermark{position:fixed;top:45%;left:10%;right:10%;text-align:center;font-size:48px;opacity:.05;z-index:-1}footer{margin-top:16px;font-size:.75em;text-align:center;border-top:1px solid #aaa} @media screen{body{background:#eceff1;padding:16px}main{background:white;max-width:210mm;margin:auto;min-height:297mm;padding:24px}} @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #aaa;text-align:right;padding:6px;overflow-wrap:anywhere}tr{break-inside:avoid} .signatures>div{flex:1 1 150px;min-height:90px}
.sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

</style></head><body>${b.watermark ? `<div class="watermark">${e(o.name)}</div>` : ""}<main><header>${logo}<div><strong>${e(o.name)}</strong><div>${e(o.role ?? "مكتب الوساطة العقارية")}</div>${o.owner_name ? `<div>صاحب المكتب: ${e(o.owner_name)}</div>` : ""}<div>${e(o.address)}</div><div>${e([o.phone, o.phone_secondary].filter(Boolean).join(" / "))}</div><div>${e(o.email)} ${e(o.additional_contact)}</div><div>${e(o.license_number)}</div></div></header>
${d.ready ? "" : `<p class="warning">${e("مسودة غير معتمدة — لا تصلح للإصدار")}<br>${d.warnings.map(e).join("<br>")}</p>`}
<aside data-draft="true"><p class="warning">مسودة — لم يتم إصدار العقد</p></aside><h1>${e(d.data.title)}</h1><p class="meta">${e(d.data.code)}</p>${facts(d.data.dates)}
<div class="sections">
${d.data.parties
  .map(
    (p) =>
      `<section class="party"><h2>${e(partyLabel(p))}</h2>${facts([
        { label: "الاسم", value: p.name },
        { label: "رقم الهوية", value: p.identity_number },
        { label: "رقم بطاقة السكن", value: p.residence_card_number ?? "" },
        { label: "الهاتف", value: p.phone },
        { label: "العنوان", value: p.address },
      ])}</section>`,
  )
  .join("")}
  </div>
  <div class="sections">
${d.data.assets.map((a) => `<section class="asset">${facts(a.details)}</section>`).join("")}${facts(d.data.financial)}
${d.sections.map((s) => `<section><h2>${e(s.title)}</h2>${officeAgreement ? "" : `<p class="meta">${e("الإصدار")} ${s.version} · ${e(s.approval_status === "approved" ? "معتمد" : "غير معتمد")}</p>`}${s.clauses.map((c, i) => `<article class="clause"><h3>${i + 1}. ${e(c.title)}</h3><p>${e(c.text)}</p></article>`).join("")}</section>`).join("")}
${d.data.additional_conditions ? `<section class="clause"><h2>${e("الشروط الإضافية المتفق عليها")}</h2><p>${e(d.data.additional_conditions)}</p></section>` : ""}
</div>
${d.data.agreement_terms?.length ? `<section><h2>تفاصيل الاتفاق</h2>${facts(d.data.agreement_terms)}</section>` : ""}
${d.data.explanation ? `<section class="clause"><p>${e(d.data.explanation)}</p></section>` : ""}
<h2>${e("المستمسكات المستخدمة")}</h2>${d.data.attachments.map((a) => `<div>${e(a.party)}: ${e(a.name)} ${e(a.number)}</div>`).join("")}
<section class="signatures">${d.data.parties.map((p) => `<div>${e("توقيع")} ${e(p.label)}<br>____________________</div>`).join("")}${(d.data.witnesses ?? []).map((w) => `<div>الشاهد: ${e(w.name)}<br>التوقيع: ____________________</div>`).join("")}<div>${e(o.name)}<br>${e(o.owner_name ?? "")}<br>توقيع صاحب المكتب أو الموظف المخول والختم<br>____________________</div></section>
${d.data.procedure_labels?.length ? `<section><h2>متابعة الإجراءات بعد الاتفاق</h2><p>تُملأ وفق الإجراءات المنجزة فعلاً. طباعة هذا الاتفاق لا تثبت اكتمالها.</p><table><thead><tr><th>الإجراء</th><th>التاريخ والمرجع</th></tr></thead><tbody>${d.data.procedure_labels.map((label) => `<tr><td>${e(label)}</td><td>________________</td></tr>`).join("")}</tbody></table></section>` : ""}
${officeAgreement ? "" : `<footer>${e(d.data.code)} · ${e(v.template_code)} · ${e("الإصدار المرئي")} ${v.version}</footer>`}</main></body></html>`;
  return { content: `مسودة — لم يتم إصدار العقد\n\n${documentText(d)}`, html };
}
