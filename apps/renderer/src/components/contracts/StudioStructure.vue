<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BLOCK_LABELS,
  clauseNumbers,
  paragraphText,
  type ContractDocument,
} from "@contract-document/index";
import {
  BLOCK_ICONS,
  blockSummary,
  moveInList,
  newClause,
  removeBlock,
} from "../../utils/contractDocument";
import { useConfirm } from "../../composables/useConfirm";
import type { StudioSelection } from "./studio";

/**
 * The document's structure: blocks in order, and the clause list under the
 * clauses block. Rows drag to reorder (or Alt+↑/↓), the eye hides an item
 * from every rendering, and template parts marked required can be hidden
 * but not deleted.
 */
const props = defineProps<{
  document: ContractDocument;
  selection: StudioSelection;
  readonly?: boolean;
  /** Where "restore original clauses" takes the clauses from. */
  reference: ContractDocument | null;
  referenceLabel: string;
}>();
const emit = defineEmits<{
  select: [StudioSelection];
  apply: [ContractDocument, string?];
}>();
const { openConfirm } = useConfirm();

const numbers = computed(() =>
  clauseNumbers(props.document.clauses, props.document.clause_settings),
);
const isSelected = (kind: "block" | "clause", id: string) =>
  props.selection?.kind === kind && props.selection.id === id;

// ─── Drag and drop ──────────────────────────────────────────────────────
const drag = ref<{ kind: "block" | "clause"; index: number } | null>(null);
const over = ref<{ kind: "block" | "clause"; index: number } | null>(null);

function onDragStart(
  kind: "block" | "clause",
  index: number,
  event: DragEvent,
) {
  if (props.readonly) return;
  drag.value = { kind, index };
  event.dataTransfer?.setData("text/plain", `${kind}:${index}`);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
function onDragOver(kind: "block" | "clause", index: number, event: DragEvent) {
  if (drag.value?.kind !== kind) return;
  event.preventDefault();
  over.value = { kind, index };
}
function endDrag() {
  drag.value = null;
  over.value = null;
}
function onDrop(kind: "block" | "clause", index: number) {
  if (drag.value?.kind === kind) move(kind, drag.value.index, index);
  drag.value = null;
  over.value = null;
}

function move(kind: "block" | "clause", from: number, to: number) {
  if (props.readonly) return;
  if (kind === "block")
    emit("apply", {
      ...props.document,
      blocks: moveInList(props.document.blocks, from, to),
    });
  else
    emit("apply", {
      ...props.document,
      clauses: moveInList(props.document.clauses, from, to),
    });
}

function onRowKey(
  kind: "block" | "clause",
  index: number,
  event: KeyboardEvent,
) {
  if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    move(kind, index, index + (event.key === "ArrowUp" ? -1 : 1));
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-structure="${kind}-${index + (event.key === "ArrowUp" ? -1 : 1)}"]`,
        )
        ?.focus(),
    );
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const id =
      kind === "block"
        ? props.document.blocks[index]?.id
        : props.document.clauses[index]?.id;
    if (id) emit("select", { kind, id });
  } else if (event.key === "Delete") {
    if (kind === "block") removeBlockAt(index);
    else removeClauseAt(index);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────
function toggleBlock(index: number) {
  const blocks = props.document.blocks.map((block, i) =>
    i === index ? { ...block, hidden: !block.hidden } : block,
  );
  emit("apply", { ...props.document, blocks });
}
function toggleClause(index: number) {
  const clauses = props.document.clauses.map((clause, i) =>
    i === index ? { ...clause, hidden: !clause.hidden } : clause,
  );
  emit("apply", { ...props.document, clauses });
}
function removeBlockAt(index: number) {
  const block = props.document.blocks[index];
  if (!block || block.required || props.readonly) return;
  emit("apply", removeBlock(props.document, block.id));
  emit("select", null);
}
function removeClauseAt(index: number) {
  const clause = props.document.clauses[index];
  if (!clause || clause.required || props.readonly) return;
  emit("apply", {
    ...props.document,
    clauses: props.document.clauses.filter((_, i) => i !== index),
  });
  emit("select", null);
}
function addClause() {
  const clause = newClause();
  const selectedIndex =
    props.selection?.kind === "clause"
      ? props.document.clauses.findIndex(
          (item) => item.id === props.selection!.id,
        )
      : -1;
  const clauses = [...props.document.clauses];
  clauses.splice(
    selectedIndex >= 0 ? selectedIndex + 1 : clauses.length,
    0,
    clause,
  );
  emit("apply", { ...props.document, clauses });
  emit("select", { kind: "clause", id: clause.id });
}
function restoreClauses() {
  if (!props.reference) return;
  const reference = props.reference;
  openConfirm({
    title: "استعادة البنود الأصلية",
    body: `تُستبدل البنود الحالية كلها ببنود ${props.referenceLabel}، ويمكن التراجع عن ذلك بـ Ctrl+Z.`,
    confirmText: "استعادة البنود",
    color: "warning",
    onConfirm: () => {
      emit("apply", {
        ...props.document,
        clauses: JSON.parse(JSON.stringify(reference.clauses)),
        clause_settings: {
          ...props.document.clause_settings,
          numbering: reference.clause_settings.numbering,
          prefix: reference.clause_settings.prefix,
        },
      });
      emit("select", null);
    },
  });
}

const clauseTitle = (index: number) => {
  const clause = props.document.clauses[index]!;
  return paragraphText(clause.title, () => "…").trim() || "بند بلا عنوان";
};
</script>

<template>
  <nav class="structure" aria-label="بنية العقد">
    <div class="structure__head">
      <span class="dal-section-title">بنية العقد</span>
      <v-btn
        size="small"
        variant="text"
        :color="selection === null ? 'primary' : undefined"
        prepend-icon="mdi-file-cog-outline"
        @click="emit('select', null)"
        >الصفحة</v-btn
      >
    </div>
    <ul class="structure__list" role="list">
      <template v-for="(block, index) in document.blocks" :key="block.id">
        <li
          class="structure__row"
          :class="{
            'structure__row--selected': isSelected('block', block.id),
            'structure__row--hidden': block.hidden,
            'structure__row--over':
              over?.kind === 'block' && over.index === index,
          }"
          :draggable="!readonly"
          tabindex="0"
          :data-structure="`block-${index}`"
          :aria-label="`${BLOCK_LABELS[block.type]}${block.hidden ? '، مخفي' : ''}`"
          @click="emit('select', { kind: 'block', id: block.id })"
          @keydown="onRowKey('block', index, $event)"
          @dragstart="onDragStart('block', index, $event)"
          @dragover="onDragOver('block', index, $event)"
          @drop.prevent="onDrop('block', index)"
          @dragend="endDrag"
        >
          <v-icon class="structure__grip" size="16" icon="mdi-drag-vertical" />
          <v-icon size="18" :icon="BLOCK_ICONS[block.type]" />
          <span class="structure__text">
            <strong>{{ BLOCK_LABELS[block.type] }}</strong>
            <small>{{ blockSummary(block, document) }}</small>
          </span>
          <v-btn
            v-if="!readonly"
            size="x-small"
            variant="text"
            :icon="block.hidden ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            :aria-label="block.hidden ? 'إظهار' : 'إخفاء'"
            :title="block.hidden ? 'إظهار' : 'إخفاء من العقد'"
            @click.stop="toggleBlock(index)"
          />
          <v-menu v-if="!readonly" location="bottom end">
            <template #activator="{ props: menu }">
              <v-btn
                v-bind="menu"
                size="x-small"
                variant="text"
                icon="mdi-dots-vertical"
                aria-label="أوامر"
                @click.stop
              />
            </template>
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-arrow-up"
                title="نقل للأعلى"
                :disabled="index === 0"
                @click="move('block', index, index - 1)"
              />
              <v-list-item
                prepend-icon="mdi-arrow-down"
                title="نقل للأسفل"
                :disabled="index === document.blocks.length - 1"
                @click="move('block', index, index + 1)"
              />
              <v-divider />
              <v-list-item
                prepend-icon="mdi-delete-outline"
                base-color="error"
                :title="
                  block.required ? 'جزء أساسي من القالب (يمكن إخفاؤه)' : 'حذف'
                "
                :disabled="block.required"
                @click="removeBlockAt(index)"
              />
            </v-list>
          </v-menu>
        </li>
        <li v-if="block.type === 'clauses'" class="structure__clauses">
          <ol class="structure__list" role="list">
            <li
              v-for="(clause, ci) in document.clauses"
              :key="clause.id"
              class="structure__row structure__row--clause"
              :class="{
                'structure__row--selected': isSelected('clause', clause.id),
                'structure__row--hidden': clause.hidden,
                'structure__row--over':
                  over?.kind === 'clause' && over.index === ci,
              }"
              :draggable="!readonly"
              tabindex="0"
              :data-structure="`clause-${ci}`"
              :aria-label="`${numbers.get(clause.id) ?? 'بند'}: ${clauseTitle(ci)}${clause.hidden ? '، مخفي' : ''}`"
              @click="emit('select', { kind: 'clause', id: clause.id })"
              @keydown="onRowKey('clause', ci, $event)"
              @dragstart="onDragStart('clause', ci, $event)"
              @dragover="onDragOver('clause', ci, $event)"
              @drop.prevent="onDrop('clause', ci)"
              @dragend="endDrag"
            >
              <v-icon
                class="structure__grip"
                size="16"
                icon="mdi-drag-vertical"
              />
              <span class="structure__text">
                <small class="structure__no">{{
                  numbers.get(clause.id) ?? (clause.hidden ? "مخفي" : "بلا رقم")
                }}</small>
                <strong>{{ clauseTitle(ci) }}</strong>
              </span>
              <v-btn
                v-if="!readonly"
                size="x-small"
                variant="text"
                :icon="
                  clause.hidden ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
                "
                :aria-label="clause.hidden ? 'إظهار البند' : 'إخفاء البند'"
                @click.stop="toggleClause(ci)"
              />
              <v-btn
                v-if="!readonly && !clause.required"
                size="x-small"
                variant="text"
                icon="mdi-close"
                aria-label="حذف البند"
                title="حذف البند"
                @click.stop="removeClauseAt(ci)"
              />
            </li>
          </ol>
          <div v-if="!readonly" class="structure__clause-actions">
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-plus"
              @click="addClause"
              >بند جديد</v-btn
            >
            <v-btn
              v-if="reference"
              size="small"
              variant="text"
              prepend-icon="mdi-restore"
              @click="restoreClauses"
              >البنود الأصلية</v-btn
            >
          </div>
        </li>
      </template>
    </ul>
    <p class="structure__hint">اسحب لإعادة الترتيب، أو Alt مع ↑ و↓.</p>
  </nav>
</template>

<style scoped>
.structure {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.structure__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dal-stroke);
}
.structure__list {
  list-style: none;
  margin: 0;
  padding: 4px;
}
.structure > .structure__list {
  flex: 1 1 auto;
  overflow-y: auto;
}
.structure__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 2px 4px 2px 2px;
  border-radius: var(--dal-radius-control);
  cursor: pointer;
  border: 1px solid transparent;
}
.structure__row:hover {
  background: var(--dal-hover);
}
.structure__row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.structure__row--selected {
  background: var(--dal-selection);
  border-color: rgba(var(--v-theme-primary), 0.35);
}
.structure__row--hidden .structure__text {
  opacity: 0.5;
  text-decoration: line-through;
}
.structure__row--over {
  border-top: 2px solid rgb(var(--v-theme-primary));
}
.structure__grip {
  cursor: grab;
  color: var(--dal-muted);
}
.structure__text {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.3;
}
.structure__text strong,
.structure__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.structure__text strong {
  font-size: 13px;
  font-weight: 600;
}
.structure__text small {
  font-size: 11.5px;
  color: var(--dal-muted);
}
.structure__clauses {
  margin-inline-start: 18px;
  border-inline-start: 2px solid var(--dal-stroke);
}
.structure__row--clause .structure__no {
  color: rgb(var(--v-theme-primary));
}
.structure__clause-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 8px 8px;
}
.structure__hint {
  margin: 0;
  padding: 6px 10px;
  font-size: 11.5px;
  color: var(--dal-muted);
  border-top: 1px solid var(--dal-stroke);
}
</style>
