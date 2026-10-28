<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from "vue";
import {
  type Block,
  type BlockType,
  type Clause,
  type ContractDocument,
  type FieldValues,
  type RenderContext,
  type ScheduleRow,
  type TemplateKey,
} from "@contract-document/index";
import PagedSheet from "./PagedSheet.vue";
import ContractPreview from "./ContractPreview.vue";
import StudioBlock from "./StudioBlock.vue";
import StudioStructure from "./StudioStructure.vue";
import StudioInspector from "./StudioInspector.vue";
import VariablePicker from "./VariablePicker.vue";
import type { EditorApi } from "./InlineEditor.vue";
import { ZOOM_STEPS, type StudioSelection } from "./studio";
import { useDocumentHistory } from "../../composables/useDocumentHistory";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  insertBlock,
  newBlock,
  updateBlock,
  updateClause,
} from "../../utils/contractDocument";

/**
 * The contract design studio: document structure at the start edge, the A4
 * canvas in the middle, properties at the end edge, and a toolbar. Used for
 * a template (fields show their names) and for one contract (fields show the
 * contract's values). Every edit goes through the undo history; saving is
 * the parent's (Ctrl+S, or the draft's autosave).
 */
const document = defineModel<ContractDocument>({ required: true });
const props = withDefaults(
  defineProps<{
    template: TemplateKey;
    mode: "template" | "contract";
    values: FieldValues;
    logo: string | null;
    schedule: ScheduleRow[];
    reference: ContractDocument | null;
    referenceLabel: string;
    readonly?: boolean;
    /** Fill the available height (a page of its own). */
    fill?: boolean;
  }>(),
  { readonly: false, fill: false },
);
const emit = defineEmits<{ print: [] }>();
defineSlots<{ actions?: () => unknown; status?: () => unknown }>();

const { notifyInfo } = useSnackbar();
const history = useDocumentHistory(document);
const selection = ref<StudioSelection>(null);
const zoom = ref(1);
const previewing = ref(false);
const printPreview = ref(false);
const pickerOpen = ref(false);
const showStructure = ref(true);
const showInspector = ref(true);
const pages = ref(1);
const oversized = ref(0);
const canvas = useTemplateRef<HTMLElement>("canvas");
let activeEditor: EditorApi | null = null;

const ctx = computed<RenderContext>(() => ({
  template: props.template,
  values: props.values,
  missing: "label",
  logo: props.logo,
  schedule: props.schedule,
}));

function apply(next: ContractDocument, key?: string) {
  if (props.readonly) return;
  history.apply(next, key);
}
function onBlockChange(block: Block, key: string) {
  apply(
    updateBlock(document.value, block.id, () => block),
    key,
  );
}
function onClauseChange(clause: Clause, key: string) {
  apply(
    updateClause(document.value, clause.id, () => clause),
    key,
  );
}
function onFocusEditor(api: EditorApi) {
  activeEditor = api;
}

// ─── Insert ─────────────────────────────────────────────────────────────
function anchorBlockId() {
  const current = selection.value;
  if (current?.kind === "block") return current.id;
  if (current?.kind === "clause")
    return (
      document.value.blocks.find((block) => block.type === "clauses")?.id ??
      null
    );
  return null;
}
function insert(type: Exclude<BlockType, "clauses" | "letterhead">) {
  if (props.readonly) return;
  if (
    type === "schedule" &&
    document.value.blocks.some((block) => block.type === "schedule")
  ) {
    notifyInfo("جدول الدفعات موجود في العقد مسبقاً.");
    return;
  }
  const block = newBlock(type);
  apply(insertBlock(document.value, block, anchorBlockId()));
  selection.value = { kind: "block", id: block.id };
  void nextTick(() =>
    canvas.value
      ?.querySelector<HTMLElement>(`[data-block-id="${block.id}"] .dc-editor`)
      ?.focus(),
  );
}
function insertField(key: string) {
  if (!activeEditor) {
    notifyInfo("ضع المؤشر في نص على الصفحة أولاً، ثم أدرج الحقل.");
    return;
  }
  activeEditor.insertField(key);
}
function mark(name: "bold" | "italic" | "underline") {
  if (!activeEditor) {
    notifyInfo("حدّد نصاً على الصفحة أولاً.");
    return;
  }
  activeEditor.toggleMark(name);
}

// ─── Selection follows into view ────────────────────────────────────────
watch(selection, (current) => {
  if (!current) return;
  void nextTick(() => {
    const selector =
      current.kind === "block"
        ? `[data-block-id="${current.id}"]`
        : `[data-clause-id="${current.id}"]`;
    canvas.value
      ?.querySelector(selector)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
});
function onCanvasMousedown(event: MouseEvent) {
  // A click on the grey around the pages selects the document.
  if (event.target === event.currentTarget) selection.value = null;
}

// ─── Zoom ───────────────────────────────────────────────────────────────
function zoomBy(direction: 1 | -1) {
  const index = ZOOM_STEPS.findIndex((step) => step >= zoom.value - 0.001);
  const next =
    ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))];
  if (next) zoom.value = next;
}
function fitWidth() {
  const width = canvas.value?.clientWidth ?? 800;
  zoom.value = Math.min(
    2,
    Math.max(0.5, Math.floor(((width - 48) / 794) * 100) / 100),
  );
}

// ─── Keyboard ───────────────────────────────────────────────────────────
function onKeydown(event: KeyboardEvent) {
  const ctrl = event.ctrlKey || event.metaKey;
  // An editor on the page already handled its own Ctrl+Z / Ctrl+B.
  if (!ctrl || event.altKey || event.defaultPrevented) return;
  const target = event.target as HTMLElement;
  const inField = target.closest("input, textarea, select");
  if (event.code === "KeyP") {
    event.preventDefault();
    printPreview.value = true;
    return;
  }
  if (inField) return;
  if (event.code === "KeyZ") {
    event.preventDefault();
    if (event.shiftKey) history.redo();
    else history.undo();
  } else if (event.code === "KeyY") {
    event.preventDefault();
    history.redo();
  }
}

watch(
  () => props.readonly,
  (readonly) => {
    if (readonly) previewing.value = true;
  },
  { immediate: true },
);

// Open at a zoom where the whole page width is visible.
onMounted(() => {
  const width = canvas.value?.clientWidth ?? 0;
  if (width && width - 48 < 794) fitWidth();
});

defineExpose({ clearHistory: history.clear });
</script>

<template>
  <section
    class="studio dal-panel"
    :class="{ 'studio--fill': fill }"
    aria-label="محرر العقد"
    @keydown="onKeydown"
  >
    <div class="studio__toolbar" role="toolbar" aria-label="أدوات المحرر">
      <template v-if="!readonly">
        <v-btn
          icon="mdi-undo"
          size="small"
          variant="text"
          :disabled="!history.canUndo.value"
          aria-label="تراجع (Ctrl+Z)"
          title="تراجع (Ctrl+Z)"
          @click="history.undo"
        />
        <v-btn
          icon="mdi-redo"
          size="small"
          variant="text"
          :disabled="!history.canRedo.value"
          aria-label="إعادة (Ctrl+Shift+Z)"
          title="إعادة (Ctrl+Shift+Z)"
          @click="history.redo"
        />
        <v-divider vertical class="mx-1" />
        <v-btn
          icon="mdi-format-bold"
          size="small"
          variant="text"
          aria-label="عريض (Ctrl+B)"
          title="عريض (Ctrl+B)"
          :disabled="previewing"
          @mousedown.prevent
          @click="mark('bold')"
        />
        <v-btn
          icon="mdi-format-italic"
          size="small"
          variant="text"
          aria-label="مائل (Ctrl+I)"
          title="مائل (Ctrl+I)"
          :disabled="previewing"
          @mousedown.prevent
          @click="mark('italic')"
        />
        <v-btn
          icon="mdi-format-underline"
          size="small"
          variant="text"
          aria-label="تسطير (Ctrl+U)"
          title="تسطير (Ctrl+U)"
          :disabled="previewing"
          @mousedown.prevent
          @click="mark('underline')"
        />
        <v-divider vertical class="mx-1" />
        <v-btn
          size="small"
          variant="text"
          prepend-icon="mdi-code-braces"
          :disabled="previewing"
          @mousedown.prevent
          @click="pickerOpen = true"
          >حقل</v-btn
        >
        <v-menu location="bottom start">
          <template #activator="{ props: menu }">
            <v-btn
              v-bind="menu"
              size="small"
              variant="text"
              prepend-icon="mdi-plus-box-outline"
              append-icon="mdi-menu-down"
              :disabled="previewing"
              >إدراج</v-btn
            >
          </template>
          <v-list density="compact" min-width="210">
            <v-list-item
              prepend-icon="mdi-format-paragraph"
              title="فقرة نص"
              @click="insert('text')"
            />
            <v-list-item
              prepend-icon="mdi-format-header-1"
              title="عنوان"
              @click="insert('heading')"
            />
            <v-list-item
              prepend-icon="mdi-table"
              title="جدول"
              @click="insert('table')"
            />
            <v-list-item
              prepend-icon="mdi-image-outline"
              title="صورة أو شعار المكتب"
              @click="insert('image')"
            />
            <v-list-item
              prepend-icon="mdi-draw-pen"
              title="قسم توقيعات"
              @click="insert('signatures')"
            />
            <v-list-item
              prepend-icon="mdi-calendar-month-outline"
              title="جدول الدفعات"
              :disabled="mode === 'template' && template === 'sale'"
              @click="insert('schedule')"
            />
            <v-divider />
            <v-list-item
              prepend-icon="mdi-minus"
              title="خط فاصل"
              @click="insert('separator')"
            />
            <v-list-item
              prepend-icon="mdi-format-page-break"
              title="فاصل صفحة"
              @click="insert('page_break')"
            />
          </v-list>
        </v-menu>
        <v-divider vertical class="mx-1" />
      </template>
      <v-btn
        size="small"
        :variant="previewing ? 'tonal' : 'text'"
        :color="previewing ? 'primary' : undefined"
        prepend-icon="mdi-eye-outline"
        :aria-pressed="previewing ? 'true' : 'false'"
        :disabled="readonly"
        @click="previewing = !previewing"
        >معاينة</v-btn
      >
      <v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-printer-eye"
        title="معاينة الطباعة (Ctrl+P)"
        @click="printPreview = true"
        >معاينة الطباعة</v-btn
      >
      <slot name="actions" />
      <v-spacer />
      <span class="studio__status" aria-live="polite">
        <slot name="status" />
        <span
          >{{ pages }}
          {{
            pages === 1
              ? "صفحة"
              : pages === 2
                ? "صفحتان"
                : pages <= 10
                  ? "صفحات"
                  : "صفحة"
          }}</span
        >
        <span
          v-if="oversized"
          class="studio__warn"
          title="عنصر أطول من صفحة كاملة يُقسم عند الطباعة؛ قسّمه إلى فقرات أقصر."
        >
          <v-icon size="14" icon="mdi-alert-outline" /> عنصر أطول من صفحة
        </span>
      </span>
      <v-btn
        icon="mdi-magnify-minus-outline"
        size="small"
        variant="text"
        aria-label="تصغير"
        @click="zoomBy(-1)"
      />
      <v-btn
        size="small"
        variant="text"
        min-width="56"
        aria-label="ملء العرض"
        title="ملء العرض"
        @click="fitWidth"
        >{{ Math.round(zoom * 100) }}%</v-btn
      >
      <v-btn
        icon="mdi-magnify-plus-outline"
        size="small"
        variant="text"
        aria-label="تكبير"
        @click="zoomBy(1)"
      />
      <v-divider vertical class="mx-1" />
      <v-btn
        :icon="showStructure ? 'mdi-dock-right' : 'mdi-dock-right'"
        size="small"
        :variant="showStructure ? 'tonal' : 'text'"
        aria-label="لوحة البنية"
        title="لوحة البنية"
        @click="showStructure = !showStructure"
      />
      <v-btn
        icon="mdi-dock-left"
        size="small"
        :variant="showInspector ? 'tonal' : 'text'"
        aria-label="لوحة الخصائص"
        title="لوحة الخصائص"
        @click="showInspector = !showInspector"
      />
    </div>

    <div
      class="studio__body"
      :class="{
        'studio__body--no-structure': !showStructure,
        'studio__body--no-inspector': !showInspector || previewing,
      }"
    >
      <StudioStructure
        v-show="showStructure"
        class="studio__side"
        :document="document"
        :selection="selection"
        :readonly="readonly || previewing"
        :reference="reference"
        :reference-label="referenceLabel"
        @select="selection = $event"
        @apply="apply"
      />

      <div ref="canvas" class="studio__canvas" @mousedown="onCanvasMousedown">
        <ContractPreview
          v-if="previewing"
          :document="document"
          :ctx="ctx"
          :zoom="zoom"
          @pages="pages = $event"
        />
        <PagedSheet
          v-else
          :document="document"
          :ctx="ctx"
          :zoom="zoom"
          class="studio__sheet"
          @pages="pages = $event"
          @oversized="oversized = $event.length"
        >
          <template v-for="block in document.blocks" :key="block.id">
            <StudioBlock
              v-if="!block.hidden"
              :block="block"
              :document="document"
              :ctx="ctx"
              :selection="selection"
              :readonly="readonly"
              @select="selection = $event"
              @change="onBlockChange"
              @clause-change="onClauseChange"
              @focus-editor="onFocusEditor"
              @undo="history.undo"
              @redo="history.redo"
            />
          </template>
        </PagedSheet>
      </div>

      <StudioInspector
        v-show="showInspector && !previewing"
        class="studio__side studio__side--end"
        :document="document"
        :selection="selection"
        :ctx="ctx"
        :readonly="readonly"
        :reference="reference"
        @apply="apply"
        @select="selection = $event"
        @focus-editor="onFocusEditor"
      />
    </div>

    <VariablePicker
      v-model="pickerOpen"
      :template="template"
      :values="values"
      @pick="insertField"
    />

    <v-dialog v-model="printPreview" fullscreen transition="none">
      <v-card class="print-preview">
        <v-toolbar density="compact" color="surface" class="print-preview__bar">
          <v-toolbar-title class="text-subtitle-1"
            >معاينة الطباعة — {{ pages }}
            {{ pages === 1 ? "صفحة" : "صفحات" }}</v-toolbar-title
          >
          <v-btn
            icon="mdi-magnify-minus-outline"
            aria-label="تصغير"
            @click="zoomBy(-1)"
          />
          <span class="text-body-2">{{ Math.round(zoom * 100) }}%</span>
          <v-btn
            icon="mdi-magnify-plus-outline"
            aria-label="تكبير"
            @click="zoomBy(1)"
          />
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-printer"
            class="mx-2"
            @click="emit('print')"
            >طباعة</v-btn
          >
          <v-btn
            icon="mdi-close"
            aria-label="إغلاق المعاينة"
            @click="printPreview = false"
          />
        </v-toolbar>
        <div class="print-preview__canvas">
          <ContractPreview
            :document="document"
            :ctx="{ ...ctx, missing: mode === 'template' ? 'label' : 'blank' }"
            :zoom="zoom"
          />
        </div>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.studio {
  display: flex;
  flex-direction: column;
  min-height: 520px;
}
.studio--fill {
  height: calc(100dvh - var(--dal-bar-height) - 2 * var(--dal-gutter));
}
.studio__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-height: 44px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--dal-stroke);
}
.studio__status {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-inline-end: 8px;
  font-size: 12.5px;
  color: var(--dal-muted);
  white-space: nowrap;
}
.studio__warn {
  color: rgb(var(--v-theme-warning));
}
.studio__body {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 300px;
  flex: 1 1 auto;
  min-height: 0;
}
.studio__body--no-structure {
  grid-template-columns: 0 minmax(0, 1fr) 300px;
}
.studio__body--no-inspector {
  grid-template-columns: 250px minmax(0, 1fr) 0;
}
.studio__body--no-structure.studio__body--no-inspector {
  grid-template-columns: 0 minmax(0, 1fr) 0;
}
@media (max-width: 1280px) {
  .studio__body {
    grid-template-columns: 220px minmax(0, 1fr) 270px;
  }
}
.studio__side {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-inline-end: 1px solid var(--dal-stroke);
  background: rgb(var(--v-theme-surface));
}
.studio__side--end {
  border-inline-end: 0;
  border-inline-start: 1px solid var(--dal-stroke);
}
.studio__canvas {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  background: var(--dal-canvas);
  display: flex;
  flex-direction: column;
}
.print-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.print-preview__bar {
  border-bottom: 1px solid var(--dal-stroke);
  flex: 0 0 auto;
}
.print-preview__canvas {
  flex: 1 1 auto;
  overflow: auto;
  padding: 24px;
  background: var(--dal-canvas);
  display: flex;
  flex-direction: column;
}
</style>

<style>
/* Editing affordances on the canvas; none of this reaches print. */
.studio__sheet .st-block {
  cursor: text;
  outline: 1px solid transparent;
  outline-offset: 3px;
  border-radius: 2px;
  transition: outline-color 80ms;
}
.studio__sheet .st-block:hover {
  outline-color: rgba(var(--v-theme-primary), 0.25);
}
.studio__sheet .st-selected,
.studio__sheet .st-selected:hover {
  outline: 1.5px solid rgba(var(--v-theme-primary), 0.7);
}
.studio__sheet .st-clauses.st-selected {
  outline-style: dashed;
}
.studio__sheet .st-static {
  cursor: pointer;
  position: relative;
}
.studio__sheet .st-static--break {
  border-top: 1px dashed #9aa5ab;
  min-height: 14px;
  margin-block: 6px;
}
.studio__sheet .st-break-label {
  position: absolute;
  top: -9px;
  inset-inline-start: 50%;
  padding: 0 6px;
  font-size: 9pt;
  color: #6b7780;
  background: #fff;
}
.studio__sheet .st-placeholder,
.studio__sheet .dc-image-missing {
  color: #8a8a8a;
  font-size: 0.85em;
}
.studio__sheet .st-inline {
  display: inline;
}
.dc-editor {
  outline: none;
  min-height: 1em;
}
.dc-editor[data-empty]::before {
  content: attr(data-placeholder);
  color: #a0a0a0;
  position: absolute;
  pointer-events: none;
}
.dc-editor--single {
  display: inline-block;
  min-width: 2ch;
}
.dc-editor .dc-field,
.inspector__band .dc-field {
  background: rgba(31, 78, 95, 0.09);
  border-radius: 3px;
  padding: 0 2px;
  box-shadow: inset 0 -1px 0 rgba(31, 78, 95, 0.35);
  cursor: default;
  user-select: all;
}
.dc-editor .dc-field--missing {
  background: rgba(154, 91, 0, 0.1);
  box-shadow: inset 0 -1px 0 rgba(154, 91, 0, 0.5);
}
</style>
