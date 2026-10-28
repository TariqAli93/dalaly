<script setup lang="ts">
import { computed } from "vue";
import {
  blockHtml,
  blockStyleCss,
  clauseNumbers,
  safeImageSource,
  signerColumns,
  type Block,
  type Clause,
  type ContractDocument,
  type Paragraph,
  type RenderContext,
  type RichText,
} from "@contract-document/index";
import InlineEditor, { type EditorApi } from "./InlineEditor.vue";
import type { StudioSelection } from "./studio";

/**
 * One block on the editing canvas. The markup and classes match the shared
 * HTML renderer, so the canvas paginates like the printed contract; text
 * areas are InlineEditors, and computed blocks (schedule, rule, page break,
 * image) are the renderer's own HTML.
 */
const props = defineProps<{
  block: Block;
  document: ContractDocument;
  ctx: RenderContext;
  selection: StudioSelection;
  readonly?: boolean;
}>();
const emit = defineEmits<{
  select: [StudioSelection];
  change: [Block, string];
  clauseChange: [Clause, string];
  focusEditor: [EditorApi];
  undo: [];
  redo: [];
}>();

const style = computed(() => blockStyleCss(props.block.style));
const selected = computed(
  () =>
    props.selection?.kind === "block" && props.selection.id === props.block.id,
);
const numbers = computed(() =>
  clauseNumbers(props.document.clauses, props.document.clause_settings),
);
const titleStyle = computed(() =>
  blockStyleCss(props.document.clause_settings.title_style),
);
const bodyStyle = computed(() =>
  blockStyleCss(props.document.clause_settings.body_style),
);
const staticHtml = computed(() =>
  ["schedule", "separator", "page_break", "image"].includes(props.block.type)
    ? blockHtml(props.block, props.document, props.ctx)
    : "",
);
const logo = computed(() =>
  props.block.type === "letterhead" && props.block.logo
    ? safeImageSource(props.ctx.logo)
    : null,
);

function select() {
  emit("select", { kind: "block", id: props.block.id });
}

function patch<T extends Block>(change: Partial<T>, key: string) {
  emit(
    "change",
    { ...props.block, ...change } as Block,
    `${props.block.id}:${key}`,
  );
}

function setCell(row: number, column: number, value: RichText) {
  if (props.block.type !== "table") return;
  const rows = props.block.rows.map((cells, r) =>
    r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells,
  );
  patch({ rows }, `cell-${row}-${column}`);
}

function setSigner(index: number, field: "title" | "name", value: Paragraph) {
  if (props.block.type !== "signatures") return;
  const signers = props.block.signers.map((signer, i) =>
    i === index ? { ...signer, [field]: value } : signer,
  );
  patch({ signers }, `signer-${index}-${field}`);
}

function clauseSelected(clause: Clause) {
  return props.selection?.kind === "clause" && props.selection.id === clause.id;
}
function selectClause(clause: Clause) {
  emit("select", { kind: "clause", id: clause.id });
}
function setClause(clause: Clause, change: Partial<Clause>, key: string) {
  emit("clauseChange", { ...clause, ...change }, `${clause.id}:${key}`);
}

const visibleClauses = computed(() =>
  props.document.clauses.filter((clause) => !clause.hidden),
);
const columns = computed(() =>
  props.block.type === "signatures"
    ? signerColumns(props.block.signers.length)
    : 1,
);
const tableWidths = computed(() => {
  if (props.block.type !== "table") return [];
  const total = props.block.widths.reduce((sum, width) => sum + width, 0) || 1;
  return props.block.widths.map(
    (width) => `${((width / total) * 100).toFixed(2)}%`,
  );
});

const editorEvents = {
  focus: (api: EditorApi) => emit("focusEditor", api),
  undo: () => emit("undo"),
  redo: () => emit("redo"),
};
</script>

<template>
  <!-- Letterhead -->
  <div
    v-if="block.type === 'letterhead'"
    class="dc-block dc-letterhead st-block"
    :class="{ 'st-selected': selected }"
    data-unit
    :data-block-id="block.id"
    :style="style"
    @mousedown="select"
  >
    <div class="dc-lh-start">
      <InlineEditor
        :model-value="block.start"
        :ctx="ctx"
        :readonly="readonly"
        label="الجانب الأيمن من الترويسة"
        v-on="editorEvents"
        @update:model-value="patch({ start: $event }, 'start')"
      />
    </div>
    <div class="dc-lh-logo">
      <img
        v-if="logo"
        :src="logo"
        alt=""
        :style="{ width: `${block.logo_width}mm` }"
      />
      <span v-else-if="block.logo" class="st-placeholder">شعار المكتب</span>
    </div>
    <div class="dc-lh-end">
      <InlineEditor
        :model-value="block.end"
        :ctx="ctx"
        :readonly="readonly"
        label="الجانب الأيسر من الترويسة"
        v-on="editorEvents"
        @update:model-value="patch({ end: $event }, 'end')"
      />
    </div>
  </div>

  <!-- Heading -->
  <div
    v-else-if="block.type === 'heading'"
    class="dc-block dc-h st-block"
    :class="[`dc-h${block.level}`, { 'st-selected': selected }]"
    data-unit
    data-keep
    :data-block-id="block.id"
    :style="style"
    @mousedown="select"
  >
    <InlineEditor
      :model-value="[block.text]"
      :ctx="ctx"
      :readonly="readonly"
      single
      label="عنوان"
      placeholder="عنوان"
      v-on="editorEvents"
      @update:model-value="patch({ text: $event[0] ?? [] }, 'text')"
    />
  </div>

  <!-- Paragraph -->
  <div
    v-else-if="block.type === 'text'"
    class="dc-block dc-text st-block"
    :class="{ 'st-selected': selected }"
    :data-block-id="block.id"
    :style="style"
    @mousedown="select"
  >
    <InlineEditor
      :model-value="block.text"
      :ctx="ctx"
      :readonly="readonly"
      units
      label="فقرة"
      v-on="editorEvents"
      @update:model-value="patch({ text: $event }, 'text')"
    />
  </div>

  <!-- Clauses -->
  <div
    v-else-if="block.type === 'clauses'"
    class="dc-block dc-clauses st-clauses"
    :class="{ 'st-selected': selected }"
    :data-block-id="block.id"
    :style="style"
  >
    <div
      v-for="clause in visibleClauses"
      :key="clause.id"
      class="dc-clause st-block"
      :class="{ 'st-selected': clauseSelected(clause) }"
      :data-clause-id="clause.id"
      @mousedown.stop="selectClause(clause)"
    >
      <div class="dc-clause-title dc-p" data-unit data-keep :style="titleStyle">
        <span
          v-if="numbers.get(clause.id)"
          class="dc-clause-no"
          contenteditable="false"
          >{{ numbers.get(clause.id)
          }}{{ clause.title.length ? ":" : "" }}</span
        >
        <InlineEditor
          class="st-inline"
          :model-value="[clause.title]"
          :ctx="ctx"
          :readonly="readonly"
          single
          label="عنوان البند"
          placeholder="عنوان البند"
          v-on="editorEvents"
          @update:model-value="
            setClause(clause, { title: $event[0] ?? [] }, 'title')
          "
        />
      </div>
      <div class="dc-clause-body" :style="bodyStyle">
        <InlineEditor
          :model-value="clause.body"
          :ctx="ctx"
          :readonly="readonly"
          units
          label="نص البند"
          placeholder="نص البند"
          v-on="editorEvents"
          @update:model-value="setClause(clause, { body: $event }, 'body')"
        />
      </div>
    </div>
    <p v-if="!visibleClauses.length" class="st-placeholder dc-p" data-unit>
      لا توجد بنود ظاهرة. أضف بنداً من لوحة البنية.
    </p>
  </div>

  <!-- Table -->
  <div
    v-else-if="block.type === 'table'"
    class="dc-block dc-table-wrap st-block"
    :class="{ 'st-selected': selected }"
    data-unit
    :data-block-id="block.id"
    :style="style"
    @mousedown="select"
  >
    <table class="dc-table" :class="{ 'dc-table--borders': block.borders }">
      <colgroup>
        <col
          v-for="(width, index) in tableWidths"
          :key="index"
          :style="{ width }"
        />
      </colgroup>
      <tbody>
        <tr v-for="(row, r) in block.rows" :key="r">
          <component
            :is="block.header_row && r === 0 ? 'th' : 'td'"
            v-for="(cell, c) in row"
            :key="c"
          >
            <InlineEditor
              :model-value="cell"
              :ctx="ctx"
              :readonly="readonly"
              :label="`خلية الصف ${r + 1} العمود ${c + 1}`"
              placeholder=" "
              v-on="editorEvents"
              @update:model-value="setCell(r, c, $event)"
            />
          </component>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Signatures -->
  <div
    v-else-if="block.type === 'signatures'"
    class="dc-block dc-signatures st-block"
    :class="{ 'st-selected': selected }"
    data-unit
    :data-block-id="block.id"
    :style="[`grid-template-columns:repeat(${columns},1fr)`, style]"
    @mousedown="select"
  >
    <div
      v-for="(signer, index) in block.signers"
      :key="signer.id"
      class="dc-signer"
    >
      <div class="dc-signer-title">
        <InlineEditor
          :model-value="[signer.title]"
          :ctx="ctx"
          :readonly="readonly"
          single
          label="صفة الموقّع"
          v-on="editorEvents"
          @update:model-value="setSigner(index, 'title', $event[0] ?? [])"
        />
      </div>
      <div class="dc-signer-name">
        <InlineEditor
          :model-value="[signer.name]"
          :ctx="ctx"
          :readonly="readonly"
          single
          label="اسم الموقّع"
          placeholder="الاسم"
          v-on="editorEvents"
          @update:model-value="setSigner(index, 'name', $event[0] ?? [])"
        />
      </div>
      <div class="dc-sign-line">التوقيع: ...............................</div>
      <div v-if="block.show_date" class="dc-sign-line">
        التاريخ: ....../....../.........
      </div>
    </div>
  </div>

  <!-- Computed blocks: the shared renderer's HTML (escaped). -->
  <div
    v-else
    class="st-static"
    :class="{
      'st-selected': selected,
      'st-static--break': block.type === 'page_break',
    }"
    @mousedown="select"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- escaped by the shared renderer -->
    <div v-html="staticHtml" />
    <span v-if="block.type === 'page_break'" class="st-break-label"
      >فاصل صفحة</span
    >
  </div>
</template>
