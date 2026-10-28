/**
 * Rich text helpers: a small markup for writing the factory templates
 * ("يقر **{{seller.full_name}}** ..."), plain text for searching and
 * DOCX/print margin bands, and the list of fields a document uses.
 */
import type {
  Block,
  ContractDocument,
  Marks,
  Paragraph,
  RichText,
  Run,
} from "./model.js";

/**
 * Markup → paragraph. `**bold**`, `__underline__`, and `{{field.key}}`;
 * marks can wrap fields. Used only by the factory templates.
 */
export function para(markup: string): Paragraph {
  const runs: Run[] = [];
  const marks: Marks = {};
  const pattern = /(\*\*|__|\{\{\s*([a-z0-9_.]+)\s*\}\})/g;
  let last = 0;
  const pushText = (value: string) => {
    if (!value) return;
    runs.push({ type: "text", text: value, ...activeMarks(marks) });
  };
  for (const match of markup.matchAll(pattern)) {
    pushText(markup.slice(last, match.index));
    last = match.index! + match[0].length;
    if (match[0] === "**") marks.bold = !marks.bold;
    else if (match[0] === "__") marks.underline = !marks.underline;
    else runs.push({ type: "field", key: match[2]!, ...activeMarks(marks) });
  }
  pushText(markup.slice(last));
  return mergeRuns(runs);
}

/** Markup with blank lines between paragraphs → rich text. */
export function rich(markup: string): RichText {
  return markup
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => para(paragraph.trim()));
}

function activeMarks(marks: Marks): Marks {
  const active: Marks = {};
  if (marks.bold) active.bold = true;
  if (marks.italic) active.italic = true;
  if (marks.underline) active.underline = true;
  return active;
}

export function sameMarks(a: Marks, b: Marks) {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline)
  );
}

/** Joins neighbouring text runs with the same marks and drops empty ones. */
export function mergeRuns(runs: Run[]): Paragraph {
  const merged: Run[] = [];
  for (const run of runs) {
    if (run.type === "text" && !run.text) continue;
    const previous = merged.at(-1);
    if (
      run.type === "text" &&
      previous?.type === "text" &&
      sameMarks(previous, run)
    )
      merged[merged.length - 1] = {
        ...previous,
        text: previous.text + run.text,
      };
    else merged.push({ ...run });
  }
  return merged;
}

export function paragraphText(
  paragraph: Paragraph,
  value: (key: string) => string = (key) => `{{${key}}}`,
) {
  return paragraph
    .map((run) => (run.type === "text" ? run.text : value(run.key)))
    .join("");
}

export function richText(
  text: RichText,
  value?: (key: string) => string,
  separator = "\n",
) {
  return text
    .map((paragraph) => paragraphText(paragraph, value))
    .join(separator);
}

export function isEmptyParagraph(paragraph: Paragraph) {
  return paragraph.every((run) => run.type === "text" && !run.text.trim());
}

function fieldsInParagraph(paragraph: Paragraph, into: Set<string>) {
  for (const run of paragraph) if (run.type === "field") into.add(run.key);
}
function fieldsInRich(text: RichText, into: Set<string>) {
  for (const paragraph of text) fieldsInParagraph(paragraph, into);
}

export function blockFields(block: Block, into = new Set<string>()) {
  switch (block.type) {
    case "letterhead":
      fieldsInRich(block.start, into);
      fieldsInRich(block.end, into);
      break;
    case "heading":
      fieldsInParagraph(block.text, into);
      break;
    case "text":
      fieldsInRich(block.text, into);
      break;
    case "table":
      for (const row of block.rows)
        for (const cell of row) fieldsInRich(cell, into);
      break;
    case "signatures":
      for (const signer of block.signers) {
        fieldsInParagraph(signer.title, into);
        fieldsInParagraph(signer.name, into);
      }
      break;
  }
  return into;
}

export type FieldUse = {
  key: string;
  /** where the field appears, to jump there from an issue */
  block_id?: string;
  clause_id?: string;
  band?: "header" | "footer";
};

/** Every field a document shows, skipping hidden blocks and clauses. */
export function usedFields(document: ContractDocument): FieldUse[] {
  const uses: FieldUse[] = [];
  const add = (keys: Set<string>, where: Omit<FieldUse, "key">) => {
    for (const key of keys) uses.push({ key, ...where });
  };
  if (document.header.enabled) {
    const keys = new Set<string>();
    fieldsInParagraph(document.header.text, keys);
    add(keys, { band: "header" });
  }
  if (document.footer.enabled) {
    const keys = new Set<string>();
    fieldsInParagraph(document.footer.text, keys);
    add(keys, { band: "footer" });
  }
  for (const block of document.blocks) {
    if (block.hidden) continue;
    if (block.type === "clauses") {
      for (const clause of document.clauses) {
        if (clause.hidden) continue;
        const keys = new Set<string>();
        fieldsInParagraph(clause.title, keys);
        fieldsInRich(clause.body, keys);
        add(keys, { clause_id: clause.id });
      }
    } else add(blockFields(block), { block_id: block.id });
  }
  return uses;
}
