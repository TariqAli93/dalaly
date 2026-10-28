/**
 * Edits to a contract document as pure functions: each returns a new
 * document and shares every untouched block, so undo keeps whole documents
 * cheaply and Vue re-renders only what changed.
 */
import {
  BLOCK_LABELS,
  newId,
  para,
  paragraphText,
  richText,
  type Block,
  type BlockType,
  type Clause,
  type ContractDocument,
  type RichText,
} from "@contract-document/index";

export function updateBlock(
  document: ContractDocument,
  id: string,
  change: (block: Block) => Block,
): ContractDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) =>
      block.id === id ? change(block) : block,
    ),
  };
}

export function updateClause(
  document: ContractDocument,
  id: string,
  change: (clause: Clause) => Clause,
): ContractDocument {
  return {
    ...document,
    clauses: document.clauses.map((clause) =>
      clause.id === id ? change(clause) : clause,
    ),
  };
}

export function moveInList<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  )
    return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Inserts after `afterId`, or before the signatures when nothing is selected. */
export function insertBlock(
  document: ContractDocument,
  block: Block,
  afterId: string | null,
): ContractDocument {
  const blocks = [...document.blocks];
  let index = afterId ? blocks.findIndex((item) => item.id === afterId) + 1 : 0;
  if (!afterId || index <= 0) {
    const signatures = blocks.findIndex((item) => item.type === "signatures");
    index = signatures >= 0 ? signatures : blocks.length;
  }
  blocks.splice(index, 0, block);
  return { ...document, blocks };
}

export function removeBlock(
  document: ContractDocument,
  id: string,
): ContractDocument {
  return {
    ...document,
    blocks: document.blocks.filter((block) => block.id !== id),
  };
}

const emptyRich = (): RichText => [[]];

export function newBlock(
  type: Exclude<BlockType, "clauses" | "letterhead">,
): Block {
  const id = newId("b");
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: para("عنوان جديد") };
    case "text":
      return { id, type, text: emptyRich() };
    case "table":
      return {
        id,
        type,
        header_row: false,
        borders: true,
        widths: [1, 2],
        rows: [
          [emptyRich(), emptyRich()],
          [emptyRich(), emptyRich()],
        ],
      };
    case "schedule":
      return { id, type };
    case "signatures":
      return {
        id,
        type,
        show_date: false,
        signers: [
          { id: newId("s"), title: para("الطرف الأول"), name: [] },
          { id: newId("s"), title: para("الطرف الثاني"), name: [] },
        ],
      };
    case "image":
      return {
        id,
        type,
        source: "logo",
        data: null,
        width: 35,
        align: "center",
      };
    case "separator":
      return { id, type };
    case "page_break":
      return { id, type };
  }
}

export function newClause(): Clause {
  return {
    id: newId("c"),
    title: para("بند جديد"),
    body: [[]],
    numbered: true,
    origin: null,
  };
}

/** A short line for the structure panel. */
export function blockSummary(block: Block, document: ContractDocument) {
  const short = (value: string) =>
    value.replace(/\s+/g, " ").trim().slice(0, 48) || "فارغ";
  switch (block.type) {
    case "heading":
      return short(paragraphText(block.text, () => "…"));
    case "text":
      return short(richText(block.text, () => "…", " "));
    case "clauses": {
      const visible = document.clauses.filter(
        (clause) => !clause.hidden,
      ).length;
      return `${visible} بنداً ظاهراً من ${document.clauses.length}`;
    }
    case "table":
      return `${block.rows.length} × ${block.rows[0]?.length ?? 0}`;
    case "signatures":
      return `${block.signers.length} موقّعين`;
    case "image":
      return block.source === "logo" ? "شعار المكتب" : "صورة مرفوعة";
    default:
      return BLOCK_LABELS[block.type];
  }
}

export const BLOCK_ICONS: Record<BlockType, string> = {
  letterhead: "mdi-page-layout-header",
  heading: "mdi-format-header-1",
  text: "mdi-format-paragraph",
  clauses: "mdi-format-list-numbered-rtl",
  table: "mdi-table",
  schedule: "mdi-calendar-month-outline",
  signatures: "mdi-draw-pen",
  image: "mdi-image-outline",
  separator: "mdi-minus",
  page_break: "mdi-format-page-break",
};
