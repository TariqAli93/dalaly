<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from "vue";
import {
  fieldDisplay,
  isEmptyParagraph,
  mergeRuns,
  runsHtml,
  type Marks,
  type Paragraph,
  type RenderContext,
  type RichText,
  type Run,
} from "@contract-document/index";

/**
 * Rich text editing on the contract canvas: a contenteditable area whose
 * only content is text runs (bold, italic, underline) and field tokens
 * (non-editable atoms). The DOM is read back into runs after every input,
 * so nothing but plain text and known fields ever reaches the document;
 * pasting inserts plain text only. Undo and redo belong to the studio.
 *
 * With `single`, the value is one paragraph and Enter does nothing
 * (headings, clause titles, signer lines).
 */
export type EditorApi = {
  insertField: (key: string) => void;
  toggleMark: (mark: "bold" | "italic" | "underline") => void;
};

const props = defineProps<{
  modelValue: RichText;
  ctx: RenderContext;
  label: string;
  single?: boolean;
  readonly?: boolean;
  placeholder?: string;
  /** Mark each paragraph as a flow unit for pagination. */
  units?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [RichText];
  focus: [EditorApi];
  undo: [];
  redo: [];
}>();

const root = useTemplateRef<HTMLDivElement>("root");
let lastJson = "";
let savedRange: Range | null = null;

const editableCtx = () => ({ ...props.ctx, editable: true });

function paragraphHtml(paragraph: Paragraph) {
  return `<div class="dc-p"${props.units ? " data-unit" : ""}>${runsHtml(paragraph, editableCtx())}</div>`;
}

function render() {
  const el = root.value;
  if (!el) return;
  const value = props.modelValue.length ? props.modelValue : [[]];
  el.innerHTML = props.single
    ? runsHtml(value[0] ?? [], editableCtx())
    : value.map(paragraphHtml).join("");
  lastJson = JSON.stringify(props.modelValue);
  markEmpty();
}

function markEmpty() {
  const el = root.value;
  if (!el) return;
  const empty = props.modelValue.every(isEmptyParagraph);
  el.toggleAttribute("data-empty", empty);
}

// ─── DOM → runs ─────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set([
  "DIV",
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "LI",
  "BLOCKQUOTE",
]);

function inlineRuns(nodes: Iterable<ChildNode>, marks: Marks, runs: Run[]) {
  const list = [...nodes];
  list.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\u200b/g, "");
      if (text) runs.push({ type: "text", text, ...marks });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const key = node.dataset.key;
    if (key) {
      runs.push({ type: "field", key, ...marks });
      return;
    }
    const tag = node.tagName;
    if (tag === "BR") {
      // A trailing <br> only keeps an empty line open.
      if (index < list.length - 1)
        runs.push({ type: "text", text: "\n", ...marks });
      return;
    }
    const next: Marks = { ...marks };
    const weight = node.style?.fontWeight;
    if (
      tag === "B" ||
      tag === "STRONG" ||
      weight === "bold" ||
      Number(weight) >= 600
    )
      next.bold = true;
    if (tag === "I" || tag === "EM" || node.style?.fontStyle === "italic")
      next.italic = true;
    if (tag === "U" || node.style?.textDecorationLine?.includes("underline"))
      next.underline = true;
    if (BLOCK_TAGS.has(tag) && runs.length)
      runs.push({ type: "text", text: "\n", ...marks });
    inlineRuns(node.childNodes, next, runs);
  });
}

function toParagraph(nodes: Iterable<ChildNode>): Paragraph {
  const runs: Run[] = [];
  inlineRuns(nodes, {}, runs);
  return mergeRuns(
    runs.map(
      (run) =>
        Object.fromEntries(
          Object.entries(run).filter(
            ([, value]) => value !== false && value !== undefined,
          ),
        ) as Run,
    ),
  );
}

function parse(): RichText {
  const el = root.value!;
  if (props.single) return [toParagraph(el.childNodes)];
  const paragraphs: RichText = [];
  let loose: ChildNode[] = [];
  const flush = () => {
    if (loose.length) paragraphs.push(toParagraph(loose));
    loose = [];
  };
  for (const node of [...el.childNodes]) {
    if (node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName)) {
      flush();
      paragraphs.push(toParagraph(node.childNodes));
    } else loose.push(node);
  }
  flush();
  return paragraphs.length ? paragraphs : [[]];
}

function onInput() {
  const value = parse();
  const json = JSON.stringify(value);
  if (json === lastJson) return;
  lastJson = json;
  emit("update:modelValue", value);
  root.value?.toggleAttribute("data-empty", value.every(isEmptyParagraph));
}

// ─── Commands ───────────────────────────────────────────────────────────

function inside(node: Node | null) {
  return Boolean(node && root.value?.contains(node));
}

function onSelectionChange() {
  const selection = document.getSelection();
  if (selection?.rangeCount && inside(selection.anchorNode))
    savedRange = selection.getRangeAt(0).cloneRange();
}

function restoreSelection() {
  const el = root.value!;
  el.focus();
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  if (savedRange && inside(savedRange.startContainer)) {
    selection.addRange(savedRange);
    return savedRange;
  }
  const range = document.createRange();
  const last = el.lastElementChild && !props.single ? el.lastElementChild : el;
  range.selectNodeContents(last);
  range.collapse(false);
  selection.addRange(range);
  return range;
}

function insertField(key: string) {
  if (props.readonly) return;
  const range = restoreSelection();
  range.deleteContents();
  const span = document.createElement("span");
  const shown = fieldDisplay(key, props.ctx);
  span.className = `dc-field${shown.missing ? " dc-field--missing" : ""}`;
  span.dataset.key = key;
  span.contentEditable = "false";
  span.textContent = shown.text;
  // A placeholder <br> in an empty paragraph would follow the field.
  const container = range.startContainer;
  if (
    container instanceof HTMLElement &&
    container.childNodes.length === 1 &&
    container.firstChild?.nodeName === "BR"
  )
    container.firstChild.remove();
  range.insertNode(span);
  const space = document.createTextNode(" ");
  span.after(space);
  const selection = document.getSelection()!;
  const after = document.createRange();
  after.setStartAfter(space);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
  savedRange = after.cloneRange();
  onInput();
}

function toggleMark(mark: "bold" | "italic" | "underline") {
  if (props.readonly) return;
  restoreSelection();
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand(mark);
  onInput();
}

const api: EditorApi = { insertField, toggleMark };

function onFocus() {
  document.execCommand("styleWithCSS", false, "false");
  emit("focus", api);
}

function onKeydown(event: KeyboardEvent) {
  const ctrl = event.ctrlKey || event.metaKey;
  // event.code, not key: on an Arabic layout Ctrl+B arrives as «لا».
  if (ctrl && !event.altKey) {
    if (
      event.code === "KeyB" ||
      event.code === "KeyI" ||
      event.code === "KeyU"
    ) {
      event.preventDefault();
      toggleMark(
        event.code === "KeyB"
          ? "bold"
          : event.code === "KeyI"
            ? "italic"
            : "underline",
      );
      return;
    }
    if (event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) emit("redo");
      else emit("undo");
      return;
    }
    if (event.code === "KeyY") {
      event.preventDefault();
      emit("redo");
      return;
    }
  }
  if (event.key === "Enter" && props.single) event.preventDefault();
  if (event.key === "Escape") (event.target as HTMLElement).blur();
}

function onBeforeInput(event: InputEvent) {
  if (
    event.inputType === "historyUndo" ||
    event.inputType === "historyRedo" ||
    event.inputType === "insertFromDrop" ||
    (props.single && event.inputType === "insertParagraph")
  )
    event.preventDefault();
}

function onPaste(event: ClipboardEvent) {
  event.preventDefault();
  if (props.readonly) return;
  let text = event.clipboardData?.getData("text/plain") ?? "";
  if (props.single) text = text.replace(/\s*\n\s*/g, " ");
  // Plain text only: formatting and markup from the clipboard never enter.
  document.execCommand("insertText", false, text.replace(/\r\n?/g, "\n"));
  onInput();
}

watch(
  () => props.modelValue,
  (value) => {
    if (JSON.stringify(value) !== lastJson) render();
  },
);

// New values (another party picked, a term typed): update the tokens in
// place, so the caret stays where it is.
watch(
  () => props.ctx.values,
  () => {
    for (const span of root.value?.querySelectorAll<HTMLElement>(
      "[data-key]",
    ) ?? []) {
      const shown = fieldDisplay(span.dataset.key!, props.ctx);
      if (span.textContent !== shown.text) span.textContent = shown.text;
      span.classList.toggle("dc-field--missing", shown.missing);
    }
  },
);

onMounted(() => {
  render();
  document.addEventListener("selectionchange", onSelectionChange);
});
onBeforeUnmount(() =>
  document.removeEventListener("selectionchange", onSelectionChange),
);

defineExpose({ insertField, toggleMark, focus: () => root.value?.focus() });
</script>

<template>
  <div
    ref="root"
    class="dc-editor"
    :class="{ 'dc-editor--single': single }"
    :contenteditable="readonly ? 'false' : 'true'"
    role="textbox"
    :aria-multiline="single ? 'false' : 'true'"
    :aria-label="label"
    :data-placeholder="placeholder ?? 'اكتب هنا…'"
    spellcheck="false"
    @input="onInput"
    @focus="onFocus"
    @keydown="onKeydown"
    @beforeinput="onBeforeInput"
    @paste="onPaste"
    @drop.prevent
  />
</template>
