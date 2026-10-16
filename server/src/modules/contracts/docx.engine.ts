import AdmZip from "adm-zip";
import {
  DOMParser,
  XMLSerializer,
  type Element,
  type Node,
} from "@xmldom/xmldom";
import { createHash } from "node:crypto";
import path from "node:path";
import { DocumentError } from "../../shared/errors.js";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const STRICT_W = "http://purl.oclc.org/ooxml/wordprocessingml/main";
const word = (node: Node) =>
  node.namespaceURI === W || node.namespaceURI === STRICT_W;
export const MAX_DOCX_BYTES = 12 * 1024 * 1024;
export const VARIABLE_ALIASES: Record<string, string> = {
  seller_name: "seller.full_name",
  buyer_name: "buyer.full_name",
  tenant_name: "lessee.full_name",
  landlord_name: "lessor.full_name",
  property_address: "property.address",
  contract_amount: "contract.amount",
  contract_date: "contract.date",
  paid_amount: "contract.paid_amount",
  remaining_amount: "contract.remaining_amount",
  office_name: "office.name",
  contract_code: "contract.code",
  start_date: "contract.start_date",
  end_date: "contract.end_date",
  notes: "contract.notes",
  company_name: "office.name",
  company_address: "office.address",
  company_phone: "office.phone",
};
export const DOCUMENT_VARIABLES = [
  ...Object.keys(VARIABLE_ALIASES),
  "legal_formulation",
  "additional_conditions",
  "assets_summary",
  "parties_summary",
  "agreement_terms",
  "witnesses",
  "office_role",
  "contract.type",
  "contract.transaction_kind",
  "contract.jurisdiction",
  "contract.registration_reference",
  "contract.intended_use",
  "contract.date",
  "contract.amount",
  "contract.paid_amount",
  "contract.remaining_amount",
  "contract.start_date",
  "contract.end_date",
  "contract.notes",
  "contract.code",
  ...["seller", "buyer", "lessor", "lessee"].flatMap((role) =>
    [
      "full_name",
      "identity_number",
      "residence_card_number",
      "phone",
      "address",
      "email",
    ].map((field) => `${role}.${field}`),
  ),
  ...[
    "name",
    "address",
    "phone",
    "phone_secondary",
    "email",
    "license_number",
    "additional_contact",
    "involvement",
    "owner_name",
  ].map((field) => `office.${field}`),
  ...[
    "address",
    "addresses",
    "names",
    "total",
    "code",
    "name",
    "type",
    "area",
    "price",
    "legal_type",
    "plot_number",
    "plot_letter",
    "subdistrict_number",
    "subdistrict_name",
    "mahalla",
    "alley",
    "house_number",
    "area_unit",
    "area_value",
    "rent_period",
  ].map((field) => `property.${field}`),
];
export function documentError(message: string) {
  return new DocumentError(message);
}
export const sha256 = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
export function decodeUpload(data: string) {
  const raw = data.replace(/^data:[^;,]+;base64,/, "");
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) ||
    raw.length % 4 !== 0 ||
    raw.length > Math.ceil(MAX_DOCX_BYTES / 3) * 4
  )
    throw documentError("الملف غير صالح أو يتجاوز ١٢ ميغابايت.");
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > MAX_DOCX_BYTES)
    throw documentError("الملف فارغ أو أكبر من الحد المسموح.");
  return buffer;
}
export function parseXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw documentError("تعريفات الكيانات الخارجية غير مسموحة في DOCX.");
  // Bound nesting before parsing untrusted XML, including styles and drawings.
  let depth = 0;
  for (const tag of xml.matchAll(/<\/?[A-Za-z_][^>]*>/g)) {
    if (tag[0].startsWith("</")) depth--;
    else if (!tag[0].endsWith("/>")) depth++;
    if (depth > 128)
      throw documentError("بنية XML متداخلة أكثر من الحد المسموح.");
  }
  try {
    return new DOMParser({
      onError: () => {
        throw documentError("بنية XML في الملف غير صالحة.");
      },
    }).parseFromString(xml, "application/xml");
  } catch {
    throw documentError("بنية XML في الملف غير صالحة.");
  }
}
function descendants(root: Node) {
  const nodes: Node[] = [];
  const stack: Node[] = [root];
  while (stack.length) {
    const node = stack.pop()!;
    nodes.push(node);
    for (let child = node.lastChild; child; child = child.previousSibling)
      stack.push(child);
  }
  return nodes;
}
function paragraphs(xml: string) {
  const document = parseXml(xml);
  const groups = descendants(document)
    .filter((n) => word(n) && n.localName === "p")
    .map((p) => {
      const runs: Element[] = [];
      // Text boxes can contain nested paragraphs: each paragraph owns its text.
      const walk = (node: Node) => {
        for (let child = node.firstChild; child; child = child.nextSibling) {
          if (word(child) && child.localName === "p") continue;
          if (word(child) && child.localName === "t")
            runs.push(child as Element);
          else if (
            word(child) &&
            ["br", "tab", "cr"].includes(child.localName ?? "")
          ) {
            const barrier = document.createElementNS(
              p.namespaceURI!,
              `${p.prefix || "w"}:t`,
            );
            barrier.textContent = "\n";
            runs.push(barrier);
          } else walk(child);
        }
      };
      walk(p);
      return runs;
    });
  return { document, groups };
}
function tokens(text: string) {
  const matches = Array.from(text.matchAll(/{{\s*([a-zA-Z][\w.]*)\s*}}/g));
  if (/{{|}}/.test(text.replace(/{{\s*([a-zA-Z][\w.]*)\s*}}/g, "")))
    throw documentError(
      "متغير ناقص أو مقسّم بين فقرات؛ استخدم {{variable}} داخل فقرة واحدة.",
    );
  return matches;
}
export function validateVariables(text: string, document = false) {
  const known = document
    ? DOCUMENT_VARIABLES
    : DOCUMENT_VARIABLES.filter(
        (v) =>
          ![
            "legal_formulation",
            "additional_conditions",
            "assets_summary",
            "parties_summary",
            "agreement_terms",
            "witnesses",
            "office_role",
          ].includes(v),
      );
  for (const match of tokens(text))
    if (!known.includes(match[1]))
      throw documentError(`متغير غير معروف: ${match[1]}`);
}
export function validateContractVariables(variables: string[], kind: string) {
  if (kind === "general") return;
  const incompatible =
    kind === "rental"
      ? ["seller.", "buyer.", "seller_name", "buyer_name"]
      : ["lessor.", "lessee.", "landlord_name", "tenant_name"];
  const invalid = variables.find((key) =>
    incompatible.some((prefix) => key === prefix || key.startsWith(prefix)),
  );
  if (invalid)
    throw documentError(`المتغير ${invalid} لا يطابق نوع العقد المحدد.`);
}
export function openDocx(buffer: Buffer) {
  if (
    buffer.length < 4 ||
    buffer.length > MAX_DOCX_BYTES ||
    buffer.readUInt16LE(0) !== 0x4b50
  )
    throw documentError("اختر ملف DOCX صالحاً لا يتجاوز ١٢ ميغابايت.");
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    if (entries.length > 2048)
      throw documentError("عدد أجزاء الملف يتجاوز الحد المسموح.");
    let total = 0;
    const names = new Set<string>();
    for (const entry of entries) {
      const name = entry.entryName;
      if (names.has(name) || /(^\/|\\|:|(^|\/)\.\.?($|\/))/.test(name))
        throw documentError("مسارات DOCX غير آمنة أو مكررة.");
      names.add(name);
      total += entry.header.size;
      if (
        entry.header.flags & 1 ||
        entry.header.size > 16 * 1024 * 1024 ||
        total > 60 * 1024 * 1024 ||
        entry.header.size >
          Math.max(1024 * 1024, entry.header.compressedSize * 1000)
      )
        throw documentError("الملف مشفر أو يتجاوز حدود فك الضغط الآمن.");
      if (/vba|activeX|embeddings|\.exe$|\.dll$|\.bin$/i.test(name))
        throw documentError(
          "القوالب ذات الماكرو أو العناصر التنفيذية غير مدعومة.",
        );
      if (/\.svg$/i.test(name)) {
        const dom = parseXml(entry.getData().toString("utf8"));
        for (const node of descendants(dom)) {
          if (node.nodeType !== 1) continue;
          const element = node as Element;
          if (
            ["script", "foreignObject", "style"].includes(
              element.localName ?? "",
            )
          )
            throw documentError("صورة SVG تحتوي على محتوى نشط غير مدعوم.");
          for (let i = 0; i < element.attributes.length; i++) {
            const attr = element.attributes.item(i)!;
            if (
              /^on/i.test(attr.name) ||
              /url\(/i.test(attr.value) ||
              ((attr.localName === "href" || attr.localName === "src") &&
                !attr.value.startsWith("#"))
            )
              throw documentError("صور SVG ذات الموارد الخارجية غير مسموحة.");
          }
        }
      }
      if (/\.(xml|rels)$/i.test(name)) {
        const xml = entry.getData().toString("utf8");
        const dom = parseXml(xml);
        if (/macroEnabled|vbaProject|altChunk/i.test(xml))
          throw documentError("الملف يحتوي على محتوى نشط غير مدعوم.");
        const instruction = descendants(dom)
          .filter((node) => word(node) && node.localName === "instrText")
          .map((node) => node.textContent ?? "")
          .join("");
        if (
          /\b(DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK)\b/i.test(instruction)
        )
          throw documentError("حقول المستند الخارجية غير مسموحة.");
        for (const node of descendants(dom)) {
          if (node.nodeType !== 1) continue;
          const element = node as Element;
          if (
            element.localName === "Relationship" &&
            element.getAttribute("TargetMode")?.toLowerCase() === "external"
          )
            throw documentError(
              "القالب يحتوي على روابط أو موارد خارجية؛ ضمّن الموارد داخل DOCX أولاً.",
            );
          if (element.localName === "Relationship") {
            const target = decodeURIComponent(
              element.getAttribute("Target") ?? "",
            );
            const base =
              name === "_rels/.rels"
                ? ""
                : path.posix.dirname(name.replace("/_rels/", "/"));
            const resolved = path.posix.normalize(
              path.posix.join(base, target),
            );
            if (
              /^(\/|\\|[a-z][a-z0-9+.-]*:)/i.test(target) ||
              target.includes("\\") ||
              resolved === ".." ||
              resolved.startsWith("../")
            )
              throw documentError("مرجع ملف خارج حزمة DOCX غير مسموح.");
          }
          if (word(element) && ["ins", "del"].includes(element.localName ?? ""))
            throw documentError(
              "اقبل أو ارفض التغييرات المتعقبة في Word قبل استيراد القالب.",
            );
          if (
            word(element) &&
            element.localName === "instrText" &&
            /\b(DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK)\b/i.test(
              element.textContent ?? "",
            )
          )
            throw documentError("حقول المستند الخارجية غير مسموحة.");
          if (
            word(element) &&
            /\b(DDE|DDEAUTO|INCLUDETEXT|INCLUDEPICTURE|LINK)\b/i.test(
              element.getAttributeNS(element.namespaceURI!, "instr") ?? "",
            )
          )
            throw documentError("حقول المستند الخارجية غير مسموحة.");
        }
      }
    }
    if (
      !["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every(
        (name) => names.has(name),
      )
    )
      throw documentError("الملف ليس مستند DOCX كاملاً.");
    const types = parseXml(zip.readAsText("[Content_Types].xml"));
    if (
      !descendants(types).some(
        (node) =>
          node.nodeType === 1 &&
          (node as Element).getAttribute("PartName") === "/word/document.xml" &&
          (node as Element).getAttribute("ContentType") ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      )
    )
      throw documentError("نوع المستند غير مدعوم.");
    return zip;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 400) throw error;
    throw documentError("تعذر قراءة DOCX؛ قد يكون الملف تالفاً.");
  }
}
const textPart = (name: string) =>
  /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name);
export function inspectDocx(buffer: Buffer, requireFormulation = false) {
  const zip = openDocx(buffer);
  const variables = new Set<string>();
  const text: string[] = [];
  for (const entry of zip.getEntries().filter((e) => textPart(e.entryName))) {
    for (const group of paragraphs(entry.getData().toString("utf8")).groups) {
      const line = group.map((n) => n.textContent ?? "").join("");
      validateVariables(line, true);
      for (const token of tokens(line)) variables.add(token[1]);
      if (entry.entryName === "word/document.xml") text.push(line);
    }
  }
  if (requireFormulation && !variables.has("legal_formulation"))
    throw documentError(
      "أضف {{legal_formulation}} إلى القالب لإدراج الصيغة القانونية.",
    );
  return {
    variables: [...variables],
    text: text.join("\n"),
    hash: sha256(buffer),
  };
}
export function fillDocx(buffer: Buffer, values: Record<string, string>) {
  const zip = openDocx(buffer);
  let expandedCharacters = 0;
  for (const entry of zip.getEntries().filter((e) => textPart(e.entryName))) {
    const { document, groups } = paragraphs(entry.getData().toString("utf8"));
    let changed = false;
    for (const group of groups) {
      const original = group.map((n) => n.textContent ?? "");
      const text = original.join("");
      const replacements = tokens(text);
      expandedCharacters += text.length;
      for (const match of replacements) {
        if (!Object.hasOwn(values, match[1]))
          throw documentError(`لا توجد قيمة للمتغير: ${match[1]}`);
        expandedCharacters += values[match[1]].length - match[0].length;
      }
      if (expandedCharacters > 8 * 1024 * 1024)
        throw documentError(
          "حجم النص بعد تعبئة المتغيرات يتجاوز الحد المسموح.",
        );
      // Reverse order keeps offsets stable even when two variables share a run.
      for (const match of replacements.reverse()) {
        const key = match[1];
        if (!Object.hasOwn(values, key))
          throw documentError(`لا توجد قيمة للمتغير: ${key}`);
        let offset = 0;
        const start = match.index!,
          end = start + match[0].length;
        let first = true;
        group.forEach((node, index) => {
          const nodeStart = offset,
            nodeEnd = offset + original[index].length;
          offset = nodeEnd;
          if (nodeEnd <= start || nodeStart >= end) return;
          const current = node.textContent ?? "";
          const from = Math.max(0, start - nodeStart),
            to = Math.min(original[index].length, end - nodeStart);
          node.textContent =
            current.slice(0, from) +
            (first ? values[key] : "") +
            current.slice(to);
          node.setAttributeNS(
            "http://www.w3.org/XML/1998/namespace",
            "xml:space",
            "preserve",
          );
          first = false;
          changed = true;
        });
      }
      // Multiline wording inherits the placeholder's existing run formatting.
      for (const node of group) {
        if (!node.parentNode || !(node.textContent ?? "").includes("\n"))
          continue;
        const lines = node.textContent!.split(/\r?\n/);
        node.textContent = lines.shift()!;
        let anchor: Node = node;
        for (const line of lines) {
          const br = document.createElementNS(
            node.namespaceURI!,
            `${node.prefix || "w"}:br`,
          );
          const next = node.cloneNode(false) as Element;
          next.textContent = line;
          anchor.parentNode!.insertBefore(br, anchor.nextSibling);
          br.parentNode!.insertBefore(next, br.nextSibling);
          anchor = next;
        }
      }
    }
    if (changed)
      zip.updateFile(
        entry.entryName,
        Buffer.from(new XMLSerializer().serializeToString(document)),
      );
  }
  return zip.toBuffer();
}
export function annotateDocx(buffer: Buffer, note: string) {
  const zip = openDocx(buffer);
  const dom = parseXml(zip.readAsText("word/document.xml"));
  const body = descendants(dom).find((n) => word(n) && n.localName === "body");
  if (!body) throw documentError("محتوى المستند غير صالح.");
  const namespace = body.namespaceURI!,
    prefix = body.prefix || "w";
  const p = dom.createElementNS(namespace, `${prefix}:p`);
  const pr = dom.createElementNS(namespace, `${prefix}:pPr`);
  pr.appendChild(dom.createElementNS(namespace, `${prefix}:bidi`));
  p.appendChild(pr);
  const r = dom.createElementNS(namespace, `${prefix}:r`);
  const t = dom.createElementNS(namespace, `${prefix}:t`);
  t.textContent = note;
  r.appendChild(t);
  p.appendChild(r);
  body.insertBefore(p, body.firstChild);
  zip.updateFile(
    "word/document.xml",
    Buffer.from(new XMLSerializer().serializeToString(dom)),
  );
  return zip.toBuffer();
}
