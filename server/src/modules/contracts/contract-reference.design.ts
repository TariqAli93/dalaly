import {
  DOCUMENT_PROCEDURE_NOTE,
  type ContractDocument,
} from "./legal-content.engine.js";
import type { VisualSnapshot } from "./contract-visual.engine.js";

type Fact = { label: string; value: string };
type Escape = (value: unknown) => string;

const skyline = `<svg viewBox="0 0 430 116" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><g fill="currentColor"><path d="M0 100h430v8H0zM38 56h22v44H38zM65 70h35v30H65zM110 45h20v55h-20zM136 68h28v32h-28zM174 59h78v41h-78zM180 58a33 33 0 0 1 66 0zM211 12h3v15h-3zM264 66h32v34h-32zM302 48h28v52h-28zM345 28h13v72h-13zM342 25l9-18 10 18zM347 4h8v5h-8zM377 76h28v24h-28z"/><path d="M19 100V58h4v42zM16 58C-1 51 3 38 21 54 12 33 31 30 23 53 43 34 45 53 24 58 41 60 31 72 23 60 12 73 4 59 16 58zM411 100V58h4v42zM408 58c-17-7-13-20 5-4-9-21 10-24 2-1 20-19 22 0 1 5 17 2 7 14-1 2-11 13-19-1-7-2z"/></g><g fill="white" opacity=".6"><path d="M42 62h4v8h-4zm8 0h4v8h-4zM69 76h5v6h-5zm12 0h5v6h-5zM114 51h4v7h-4zm8 0h4v7h-4zM183 71h5v11h-5zm18 0h5v11h-5zm19 0h5v11h-5zm18 0h5v11h-5zM308 55h5v8h-5zm10 0h5v8h-5zM348 34h6v7h-6z"/></g></svg>`;

const icon = (
  name: "document" | "person" | "calendar" | "location" | "money" | "contact",
) => {
  const paths = {
    document: '<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8"/>',
    person:
      '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3M7 18h3"/>',
    location:
      '<path d="M12 23S4 15 4 9a8 8 0 0 1 16 0c0 6-8 14-8 14z"/><circle cx="12" cy="9" r="3"/>',
    money:
      '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 11c0 4 16 4 16 0M4 16c0 4 16 4 16 0"/>',
    contact:
      '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m2 6 10 8L22 6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${paths[name]}</svg>`;
};

export function renderReferenceVisual(
  d: ContractDocument,
  l: VisualSnapshot["layout_config"],
  b: VisualSnapshot["branding_config"],
  e: Escape,
) {
  const o = d.data.office;
  const officeAgreement = d.data.agreement_mode === "office";
  const present = (rows: Fact[]) =>
    rows.filter((r) => !officeAgreement || r.value.trim());
  const image = (uri?: string) =>
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(uri ?? "")
      ? uri
      : null;
  const table = (rows: Fact[], className = "") =>
    `<table class="facts ${className}"><tbody>${present(rows)
      .map(
        (r) =>
          `<tr${r.value.length > 320 ? ' class="long-row"' : ""}><th scope="row">${e(r.label)}</th><td>${/هاتف|رقم الهوية|رقم بطاقة/.test(r.label) ? `<bdi dir="ltr">${e(r.value)}</bdi>` : e(r.value)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  const heading = (number: number, title: string) =>
    `<h2 class="section-heading"><span class="section-number">${number}</span><span class="section-label">${e(title)}</span></h2>`;
  const title =
    d.data.contract_type === "rental" ? "عقد إيجار عقار" : "عقد بيع عقار";
  const originalTitle = d.data.title;
  // Existing custom accent choices still apply. Historical built-in palettes
  // adopt the reference navy without rewriting their stored configurations.
  const navy = ["#24364b", "#176b66", "#222222"].includes(
    l.accent_color.toLowerCase(),
  )
    ? "#142F50"
    : l.accent_color;
  const logo =
    b.show_logo && image(o.logo_data_uri)
      ? `<img class="office-logo" src="${e(o.logo_data_uri)}" alt="${e(o.name)}">`
      : "";
  const contacts = [o.phone, o.phone_secondary].filter(Boolean);
  const metadata: Fact[] = [
    { label: "رقم العقد", value: d.data.code },
    ...d.data.dates,
    ...(o.address ? [{ label: "عنوان المكتب", value: o.address }] : []),
    { label: "نوع العقد", value: originalTitle },
  ];
  const signatureLabel = (role: string) =>
    role === "seller" || role === "lessor"
      ? "الطرف الأول"
      : role === "buyer" || role === "lessee"
        ? "الطرف الثاني"
        : "";
  const orderedParties = [...d.data.parties].sort(
    (a, b) =>
      Number(b.role === "seller" || b.role === "lessor") -
      Number(a.role === "seller" || a.role === "lessor"),
  );
  const parties = orderedParties
    .map((p) => {
      const first = p.role === "seller" || p.role === "lessor";
      const label = signatureLabel(p.role);
      return `<article class="party-card ${first ? "tone-gold" : "tone-blue"}"><h3>${icon("person")}<span>${e(p.label)}${label ? ` (${e(label)})` : ""}</span></h3>${table(
        [
          { label: "الاسم الكامل", value: p.name },
          { label: "رقم الهوية", value: p.identity_number },
          { label: "رقم بطاقة السكن", value: p.residence_card_number ?? "" },
          { label: "رقم الهاتف", value: p.phone },
          { label: "عنوان السكن", value: p.address },
        ],
      )}</article>`;
    })
    .join("");
  const assets = d.data.assets
    .map((a) => {
      const photo = image(a.image_data_uri);
      return `<article class="asset-card${photo ? " asset-card--photo" : ""}" data-asset-id="${e(a.id)}">${table(a.details)}${photo ? `<figure class="property-photo"><img src="${e(photo)}" alt="${e(a.details.find((r) => r.label === "العقار")?.value ?? "صورة العقار")}"></figure>` : ""}</article>`;
    })
    .join("");
  const financial = present(d.data.financial)
    .map((r, i) => {
      const amount =
        /المبلغ|الأجرة|سعر|المدفوع|الدفعة|المتبقي|عمولة|وساطة/.test(r.label);
      return `<article class="financial-card ${["tone-blue", "tone-gold", "tone-green"][i % 3]}${amount ? " financial-card--amount" : " financial-card--details"}"><h3>${icon(amount ? "money" : "contact")}${e(r.label)}</h3><div class="financial-value">${e(r.value)}</div></article>`;
    })
    .join("");
  const legal = d.sections
    .map(
      (s) =>
        `<section class="legal-section" data-legal-template-id="${e(s.template_id)}"><h3 class="legal-title">${e(s.title)}</h3>${officeAgreement ? "" : `<p class="revision-meta">الإصدار ${e(s.version)} · ${e(s.approval_status === "approved" ? "معتمد" : "غير معتمد")}</p>`}${s.clauses.map((c, i) => `<article class="clause" data-clause-code="${e(c.code)}"><h4><span class="clause-number">${i + 1}</span>${e(c.title)}</h4><p class="clause-body">${e(c.text)}</p></article>`).join("")}</section>`,
    )
    .join("");
  const attachments = `<table class="attachments"><thead><tr><th scope="col">ت</th><th scope="col">نوع المستمسك</th><th scope="col">الطرف</th><th scope="col">الرقم</th></tr></thead><tbody>${d.data.attachments.map((a, i) => `<tr><td>${i + 1}</td><td>${e(a.name)}</td><td>${e(a.party)}</td><td>${e(a.number)}</td></tr>`).join("")}</tbody></table>`;
  const signatures = orderedParties
    .map(
      (p) =>
        `<article class="signature-panel ${p.role === "seller" || p.role === "lessor" ? "tone-gold" : "tone-blue"}"><h3>${e(p.label)}${signatureLabel(p.role) ? `<span>(${e(signatureLabel(p.role))})</span>` : ""}</h3><p class="signatory-name">${e(p.name)}</p><div class="signature-line"></div><p class="signature-caption">الاسم والتوقيع / البصمة</p></article>`,
    )
    .join("");
  const extraConditions = d.data.additional_conditions
    ? `<article class="clause additional-conditions"><h3 class="legal-title">الشروط الإضافية المتفق عليها</h3><p class="clause-body">${e(d.data.additional_conditions)}</p></article>`
    : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${e(title)} · ${e(d.data.code)}</title><style>
@page{
size:A4;
margin:${l.margin_mm}mm;
@bottom-center{
content:"الصفحة " counter(page) " من " counter(pages);
font-family:Tahoma,Arial;
font-size:9px;
color:${navy};
direction:rtl}
}

*{
box-sizing:border-box}
html{
direction:rtl}
body{
margin:0;
color:#10263F;
font-family:'${l.font}',Tahoma,Arial,sans-serif;
font-size:${l.font_size}px;
line-height:${l.line_height};
background:white}
.paper{
--navy:${navy};
--gold:#B99756;
--gray:#F1F4F7;
position:relative;
isolation:isolate}
.page-frame{
border:1px solid var(--gold);
border-radius:10px;
pointer-events:none;
z-index:-1}
.icon{
width:20px;
height:20px;
flex:none;
vertical-align:middle}
.letterhead{
display:grid;
grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);
gap:18px;
align-items:center;
padding:0 0 12px;
border-bottom:1px solid var(--gold);
break-inside:avoid}
.office-identity{
display:flex;
align-items:center;
gap:14px;
min-width:0}
.office-logo{
width:76px;
max-height:96px;
object-fit:contain;
flex:none}
.office-name{
font-family:Amiri,'Times New Roman',Tahoma,serif;
font-size:2.1em;
font-weight:700;
line-height:1.25;
margin:0;
color:var(--navy);
overflow-wrap:anywhere}
.office-role{
color:#9B7733;
font-size:1.04em;
font-weight:700}
.office-details{
font-size:.78em;
line-height:1.65;
overflow-wrap:anywhere}
.office-details p{
margin:3px 0}
.phone-list{
direction:ltr;
unicode-bidi:isolate;
display:inline-block}
.header-decoration{
align-self:end;
color:#B6C5D3;
text-align:center}
.header-decoration svg{
width:100%;
display:block}
.header-decoration p{
font-size:.75em;
color:var(--navy);
margin:0;
border-bottom:1px solid var(--gold);
padding-bottom:5px}
.title-block{
margin:14px auto 12px;
text-align:center;
break-inside:avoid}
.title-banner{
display:inline-block;
position:relative;
max-width:100%;
min-width:64%;
background:var(--navy);
color:#fff;
border:2px solid var(--gold);
border-radius:11px;
box-shadow:inset 0 0 0 3px #ffffff19;
padding:8px 30px 12px}
.title-banner:before,.title-banner:after{
content:"";
position:absolute;
top:50%;
width:13px;
height:13px;
background:var(--gold);
transform:translateY(-50%) rotate(45deg);
z-index:-1}
.title-banner:before{
right:-8px}
.title-banner:after{
left:-8px}
h1{
font-family:Amiri,'Times New Roman',Tahoma,serif;
font-size:2.4em;
line-height:1.2;
margin:0}
.title-ribbon{
position:relative;
background:#E4CF9E;
color:#10263F;
border:1px solid #B9975640;
border-radius:5px;
display:table;
padding:2px 22px;
margin:-8px auto 0;
min-width:30%;
font-weight:700;
font-size:.9em}
.metadata{
display:flex;
flex-wrap:wrap;
gap:0;
background:var(--gray);
border-radius:8px;
padding:10px 4px;
font-size:.8em;
break-inside:avoid}
.meta-item{
display:flex;
align-items:center;
gap:8px;
flex:1 1 110px;
padding:1px 10px;
border-inline-start:1px solid #CBD5DF;
min-width:0}
.meta-item:last-child{
border-inline-start:0}
.meta-item small{
display:block;
font-weight:700}
.meta-item strong{
display:block;
overflow-wrap:anywhere;
font-size:1.02em}
.contract-section{
margin-top:${Math.max(8, l.paragraph_spacing + 4)}px}
.section-heading{
display:flex;
align-items:center;
gap:0;
font-size:1em;
line-height:1.4;
font-weight:700;
background:linear-gradient(90deg,#F1F4F7,#D6E0E8);
border-radius:6px;
margin:0 0 7px;
min-height:28px;
break-after:avoid}
.section-number{
background:var(--navy);
color:white;
border:1px solid var(--gold);
border-radius:6px;
align-self:stretch;
display:grid;
place-items:center;
min-width:30px;
padding:1px 6px;
font-size:1.15em;
box-shadow:0 1px 2px #142f5020}
.section-label{
position:relative;
background:var(--navy);
color:white;
border-top:1px solid var(--gold);
border-bottom:1px solid var(--gold);
padding:2px 12px 2px 24px;
clip-path:polygon(0 50%,12px 0,100% 0,100% 100%,12px 100%)}
.section-content{
border:1px solid #DCE4EB;
border-radius:8px;
padding:9px;
box-shadow:0 2px 4px #142f5008}
.party-grid{
display:grid;
grid-template-columns:repeat(2,minmax(0,1fr));
gap:12px}
.party-card{
padding:8px;
border-radius:7px;
min-width:0;
break-inside:avoid}
.party-card h3{
display:flex;
gap:8px;
align-items:center;
font-size:1em;
line-height:1.5;
margin:0 0 5px;
color:var(--navy)}
.party-card.tone-gold h3{
color:#916C27}
.tone-gold{
background:#F5EFE4}
.tone-blue{
background:#EAF3FB}
.tone-green{
background:#EDF4EC}
.facts,.attachments,.procedures{
width:100%;
border-collapse:separate;
border-spacing:0;
table-layout:fixed;
font-size:.83em;
line-height:1.45;
border:1px solid #D4DEE7;
border-radius:5px}
.facts th,.facts td,.attachments th,.attachments td,.procedures th,.procedures td{
padding:4px 7px;
border-bottom:1px solid #DCE4EB;
vertical-align:top;
text-align:right;
white-space:pre-wrap;
overflow-wrap:anywhere}
.facts th{
width:34%;
background:#F1F4F7;
color:#142F50;
font-weight:700}
.facts td{
background:#ffffffc9}
.facts tr:last-child>*{
border-bottom:0}
.facts tr{
break-inside:avoid}
.facts .long-row{
break-inside:auto}
.asset-card{
margin-bottom:9px;
min-width:0}
.asset-card:last-child{
margin-bottom:0}
.asset-card--photo{
display:grid;
grid-template-columns:minmax(0,1fr) 25%;
gap:10px;
align-items:start}
.property-photo{
margin:0;
border:1px solid #D4DEE7;
border-radius:6px;
padding:2px;
break-inside:avoid}
.property-photo img{
display:block;
width:100%;
height:auto;
max-height:180px;
object-fit:contain;
border-radius:4px}
.financial-grid{
display:grid;
grid-template-columns:repeat(3,minmax(0,1fr));
gap:10px}
.financial-card{
min-width:0;
border-radius:7px;
padding:9px 11px;
text-align:center;
break-inside:avoid}
.financial-card h3{
display:flex;
align-items:center;
justify-content:center;
gap:6px;
font-size:.83em;
margin:0 0 5px;
font-weight:700}
.financial-card .icon{
width:19px;
height:19px}
.financial-value{
white-space:pre-wrap;
overflow-wrap:anywhere;
line-height:1.55}
.financial-card--amount .financial-value{
font-size:1.25em;
font-weight:700;
direction:rtl}
.financial-card--details{
grid-column:1/-1;
text-align:right;
font-size:.87em;
background:#F1F4F7}
.financial-card--details h3{
justify-content:flex-start}
.legal-section{
margin-bottom:${l.paragraph_spacing}px;
break-inside:auto}
.legal-title{
font-size:.95em;
margin:8px 0 5px;
color:var(--navy);
break-after:avoid;
line-height:1.5}
.revision-meta{
font-size:.75em;
margin:0 0 5px}
.clause{
margin:0 0 ${l.paragraph_spacing}px;
break-inside:auto}
.clause h4{
font-size:.92em;
margin:0 0 3px;
line-height:1.5;
break-after:avoid}
.clause-number{
display:inline-block;
background:var(--navy);
color:white;
border-radius:3px;
min-width:20px;
text-align:center;
font-family:Tahoma,Arial;
margin-inline-end:6px;
font-size:.84em}
.clause-body{
margin:0;
white-space:pre-wrap;
overflow-wrap:anywhere;
line-height:${l.line_height};
orphans:3;
widows:3}
.additional-conditions{
margin-top:10px}
.agreement-facts{
margin:10px 0}
.legal-notice{
border-inline-start:3px solid var(--gold);
background:#F5EFE4;
padding:7px 10px;
font-size:.83em;
line-height:1.7;
margin:10px 0 0;
white-space:pre-wrap;
overflow-wrap:anywhere;
break-inside:auto;
orphans:3;
widows:3}
.attachments th{
background:#E3E9EF;
color:var(--navy)}
.attachments td{
background:white}
.attachments th:first-child{
width:6%}
.attachments th:nth-child(2){
width:43%}
.attachments th:nth-child(3){
width:20%}
.attachments tr{
break-inside:avoid}
.attachments tbody tr:last-child td{
border-bottom:0}
thead{
display:table-header-group}
.signatures{
display:${l.signature_style === "stacked" ? "flex" : "grid"};
${l.signature_style === "stacked" ? "flex-direction:column;" : "grid-template-columns:repeat(3,minmax(0,1fr));"}gap:12px;
break-inside:avoid}
.signature-panel{
padding:8px 12px;
border-radius:6px;
text-align:center;
min-width:0}
.signature-panel h3{
font-size:.89em;
line-height:1.45;
margin:0}
.signature-panel h3 span{
display:block;
font-size:.92em}
.signatory-name{
font-size:.8em;
line-height:1.4;
margin:4px 0 0;
overflow-wrap:anywhere}
.signature-line{
height:30px;
border-bottom:1px solid #738393;
margin:0 12px 4px}
.signature-caption{
font-size:.72em;
line-height:1.4;
margin:0}
.office-signature{
background:#E3E9EF}
.witnesses{
display:flex;
gap:12px;
flex-wrap:wrap;
margin-top:10px}
.witnesses .signature-panel{
flex:1 1 180px;
background:#F1F4F7;
break-inside:avoid}
.procedures{
margin-top:6px}
.procedures th{
background:#F1F4F7}
.procedures td:nth-child(2){
width:34%}
.procedures tr{
break-inside:avoid}
.procedure-note{
font-size:.78em;
margin:4px 0}
.document-footer{
display:flex;
align-items:end;
justify-content:space-between;
gap:12px;
border-top:1px solid var(--gold);
padding-top:7px;
margin-top:14px;
font-size:.7em;
line-height:1.55;
break-inside:avoid}
.footer-office{
flex:1;
min-width:0;
overflow-wrap:anywhere}
.footer-code{
font-weight:700;
direction:ltr;
unicode-bidi:isolate}
.footer-decoration{
color:#BCCBD8;
width:26%;
min-width:70px;
flex:none}
.footer-decoration svg{
width:100%;
display:block}
.warning{
color:#79591F;
border:1px solid #B99756;
background:#FCF8EF;
border-radius:5px;
padding:6px 10px;
font-size:.82em;
line-height:1.65;
margin:8px 0;
white-space:pre-wrap}
.draft-status{
margin:7px 0 0;
color:#79591F;
font-size:.72em;
text-align:left}
.watermark{
position:fixed;
inset:45% 10% auto;
text-align:center;
font-size:48px;
opacity:.04;
pointer-events:none;
z-index:-1;
overflow-wrap:anywhere}
.layout-double .section-content{
border-style:double;
border-width:3px}
.layout-band .letterhead{
border-bottom-width:3px}
.layout-stacked .letterhead{
grid-template-columns:1fr}
.layout-stacked .header-decoration svg{
display:none}

@media screen{
body{
background:#E8EDF1;
padding:12px}
.paper{
background:#fff;
width:210mm;
max-width:none;
min-height:297mm;
margin:0 auto;
padding:calc(${l.margin_mm}mm + 4px);
box-shadow:0 3px 14px #142f501c}
.page-frame{
position:absolute;
inset:${l.margin_mm}mm}
}

@media print{
body{
-webkit-print-color-adjust:exact;
print-color-adjust:exact}
.paper{
padding:4px;
width:auto;
box-shadow:none}
.page-frame{
position:fixed;
inset:0}
.section-content{
box-shadow:none}
.document-footer{
margin-bottom:0}
.party-grid{
display:table;
width:100%;
border-spacing:6px 0;
table-layout:fixed}
.party-card{
display:table-cell;
width:50%}
.financial-grid{
display:flex;
flex-wrap:wrap}
.financial-card{
flex:1 1 28%}
.financial-card--details{
flex-basis:100%}
.signatures{
break-inside:avoid}
.property-photo{
max-width:100%}
}

</style></head><body><main class="paper layout-${e(l.header_style)} layout-${e(l.border_style)}" data-renderer-version="2"><div class="page-frame" aria-hidden="true"></div>${b.watermark ? `<div class="watermark">${e(o.name)}</div>` : ""}<header class="letterhead"><div class="office-identity">${logo}<div><p class="office-name">${e(o.name)}</p>${o.role ? `<div class="office-role">${e(o.role)}</div>` : ""}<div class="office-details">${o.license_number ? `<p>رقم الإجازة: ${e(o.license_number)}</p>` : ""}${o.owner_name ? `<p>صاحب المكتب: ${e(o.owner_name)}</p>` : ""}${o.address ? `<p>${icon("location")} ${e(o.address)}</p>` : ""}${contacts.length ? `<p><span class="phone-list">${contacts.map(e).join(" &nbsp; | &nbsp; ")}</span></p>` : ""}${o.email ? `<p>${icon("contact")} ${e(o.email)}</p>` : ""}</div></div></div><div class="header-decoration">${skyline}${o.additional_contact ? `<p>${e(o.additional_contact)}</p>` : ""}</div></header>${d.ready ? "" : `<p class="warning">مسودة غير معتمدة — لا تصلح للإصدار<br>${d.warnings.map(e).join("<br>")}</p>`}<aside data-draft="true"><p class="draft-status">مسودة — لم يتم إصدار العقد</p></aside><div class="title-block"><div class="title-banner"><h1>${e(title)}</h1></div><div class="title-ribbon">${e(originalTitle)}</div></div><div class="metadata">${present(
    metadata,
  )
    .map(
      (r, i) =>
        `<div class="meta-item">${icon(i === 0 ? "document" : /تاريخ|مدة/.test(r.label) ? "calendar" : "location")}<span><small>${e(r.label)}</small><strong>${e(r.value)}</strong></span></div>`,
    )
    .join("")}</div>
<section class="contract-section">${heading(1, "أطراف العقد")}<div class="section-content party-grid">${parties}</div></section>
<section class="contract-section">${heading(2, "تفاصيل العقار")}<div class="section-content">${assets}</div></section>
<section class="contract-section">${heading(3, "التفاصيل المالية")}<div class="section-content financial-grid">${financial}</div></section>
<section class="contract-section legal-content">${heading(4, "البنود والشروط الرئيسية")}<div class="section-content">${legal}${extraConditions}${d.data.agreement_terms?.length ? `<div class="agreement-facts"><h3 class="legal-title">تفاصيل الاتفاق</h3>${table(d.data.agreement_terms)}</div>` : ""}${d.data.explanation ? `<p class="legal-notice">${e(d.data.explanation)}</p>` : ""}</div></section>
<section class="contract-section">${heading(5, "المستمسكات المرفقة")}<div class="section-content">${attachments}</div></section>
<section class="contract-section">${heading(6, "التواقيع")}<div class="section-content"><div class="signatures">${signatures}<article class="signature-panel office-signature"><h3>${e(o.name)}</h3>${o.owner_name ? `<p class="signatory-name">${e(o.owner_name)}</p>` : ""}<div class="signature-line"></div><p class="signature-caption">توقيع صاحب المكتب أو الموظف المخول والختم</p></article></div>${d.data.witnesses?.length ? `<div class="witnesses">${d.data.witnesses.map((w) => `<article class="signature-panel"><h3>الشاهد</h3><p class="signatory-name">${e(w.name)}</p><div class="signature-line"></div><p class="signature-caption">التوقيع</p></article>`).join("")}</div>` : ""}</div></section>
${d.data.procedure_labels?.length ? `<section class="contract-section procedure-section"><h3 class="legal-title">متابعة الإجراءات بعد الاتفاق</h3><p class="procedure-note">${e(DOCUMENT_PROCEDURE_NOTE)}</p><table class="procedures"><thead><tr><th scope="col">الإجراء</th><th scope="col">التاريخ والمرجع</th></tr></thead><tbody>${d.data.procedure_labels.map((label) => `<tr><td>${e(label)}</td><td>________________</td></tr>`).join("")}</tbody></table></section>` : ""}
<footer class="document-footer"><div class="footer-office"><strong>${e(o.name)}</strong>${o.address ? `<div>${e(o.address)}</div>` : ""}${!officeAgreement ? `<div>${e(d.data.title)}</div>` : ""}</div><div class="footer-decoration">${skyline}</div><div class="footer-code">${e(d.data.code)}</div></footer></main></body></html>`;
}
