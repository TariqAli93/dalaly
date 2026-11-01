<script setup lang="ts" generic="T extends { id: number }">
import {
  computed,
  nextTick,
  onMounted,
  ref,
  useSlots,
  useTemplateRef,
  watch,
} from "vue";
import { VDataTable, VDataTableServer } from "vuetify/components";
import RowActions from "./RowActions.vue";
import EmptyState from "./EmptyState.vue";
import { openedRows, type GridHeader, type RowAction } from "./grid";
import { LIST_PAGE_SIZES } from "../../constants/domain";
import { isDialogOpen } from "../../utils/dialog";
import type { TableSortItem } from "../../types";

/**
 * شبكة بيانات مكتبية حول v-data-table(-server):
 * - الصف وحدة لوحة المفاتيح (tabindex متنقّل): ↑/↓ وHome/End بين الصفوف،
 *   PgUp/PgDn بين الصفحات، Enter يفتح، Space يحدّد، Shift+F10 يفتح الأوامر.
 * - العودة من السجل تعيد التركيز إلى الصف الذي فُتح (لكل gridKey).
 * - أربع حالات منفصلة: تحميل، لا بيانات، لا نتائج للفلاتر، فشل مع إعادة.
 * - الأعمدة ذات الأولوية 2 و3 تُخفى حين يضيق اللوح؛ الرأس ثابت والتذييل ظاهر.
 */
const props = defineProps<{
  items: T[];
  headers: GridHeader[];
  tableLabel: string;
  gridKey: string;
  loading?: boolean;
  error?: string | null;
  /** مع total يصبح الجدول صفحة من الخادم، والصفحة والترتيب بيد الأب. */
  total?: number;
  selectedId?: number | null;
  hasFilters?: boolean;
  actions?: (item: T) => RowAction[];
  rowLabel: (item: T) => string;
  empty: { icon: string; title: string; text?: string };
  noMatch?: { title: string; text?: string };
  /** قائمة قصيرة داخل سجل (ملف الزبون): كل الصفوف، بلا تذييل صفحات. */
  compact?: boolean;
}>();
const page = defineModel<number>("page", { default: 1 });
const itemsPerPage = defineModel<number>("itemsPerPage", { default: 25 });
const sortBy = defineModel<TableSortItem[]>("sortBy", { default: () => [] });
const emit = defineEmits<{
  open: [T];
  select: [T];
  retry: [];
  clearFilters: [];
  options: [];
}>();

const slots = useSlots();
const root = useTemplateRef<HTMLElement>("root");
const serverMode = computed(() => props.total !== undefined);
const itemSlots = computed(() =>
  Object.keys(slots).filter((name) => name.startsWith("item.")),
);

const priorityClass = (priority: GridHeader["priority"]) =>
  priority && priority > 1 ? `dal-col-p${priority}` : undefined;
const vHeaders = computed(() =>
  props.headers.map((header) => {
    const className = priorityClass(header.priority);
    return {
      key: header.key,
      title: header.title,
      sortable: header.sortable ?? false,
      align: header.align,
      width: header.width,
      headerProps: className ? { class: className } : undefined,
      cellProps: className ? { class: className } : undefined,
    };
  }),
);

const serverBindings = computed(() =>
  serverMode.value
    ? {
        itemsLength: props.total,
        page: page.value,
        "onUpdate:page": (value: number) => (page.value = value),
        itemsPerPage: itemsPerPage.value,
        "onUpdate:itemsPerPage": (value: number) =>
          (itemsPerPage.value = value),
        sortBy: sortBy.value,
        "onUpdate:sortBy": (value: TableSortItem[]) => (sortBy.value = value),
        "onUpdate:options": () => emit("options"),
        itemsPerPageOptions: LIST_PAGE_SIZES,
      }
    : props.compact
      ? { itemsPerPage: -1, hideDefaultFooter: true }
      : { itemsPerPageOptions: LIST_PAGE_SIZES },
);

// ─── التركيز المتنقّل ─────────────────────────────────────────────────
const focusId = ref<number | null>(null);
const rovingId = computed(() =>
  props.items.some((item) => item.id === focusId.value)
    ? focusId.value
    : (props.items[0]?.id ?? null),
);

function rowProps({ item }: { item: T }) {
  const selected = item.id === props.selectedId;
  return {
    tabindex: item.id === rovingId.value ? 0 : -1,
    "data-row-id": String(item.id),
    "aria-selected": selected ? "true" : "false",
    class: selected ? "dal-row--selected" : undefined,
  };
}

function rowElement(id: number) {
  return root.value?.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`);
}
function focusRow(id: number | null | undefined) {
  if (id === null || id === undefined) return;
  focusId.value = id;
  void nextTick(() => rowElement(id)?.focus());
}
const itemOf = (row: HTMLElement) =>
  props.items.find((item) => item.id === Number(row.dataset.rowId));

// ما فُتح آخر مرة لكل جدول، كي يعود إليه التركيز بعد الرجوع من السجل.
const lastOpened = openedRows;
let restoreId = lastOpened.get(props.gridKey) ?? null;
// بعد الرجوع: ينتظر وصول الصفوف ثم يعيد التركيز إن لم يتحرّك المستخدم بعد.
function tryRestore() {
  if (restoreId === null || !props.items.length) return;
  const active = document.activeElement;
  const untouched =
    !active || active === document.body || active.id === "dal-page-title";
  const id = restoreId;
  restoreId = null;
  // بعد إطار: AppLayout ينقل التركيز إلى عنوان الصفحة عند التنقّل، والصف أَولى.
  if (untouched && props.items.some((item) => item.id === id))
    requestAnimationFrame(() => focusRow(id));
}
onMounted(tryRestore);
watch(() => props.items, tryRestore);

function open(item: T) {
  lastOpened.set(props.gridKey, item.id);
  emit("open", item);
}

// PgUp/PgDn: صفحة أخرى، ثم التركيز على أول صف فيها أو آخره.
let pendingEdge: "first" | "last" | null = null;
watch(
  () => props.items,
  (items) => {
    if (!pendingEdge || !items.length) return;
    focusRow(pendingEdge === "first" ? items[0]!.id : items.at(-1)!.id);
    pendingEdge = null;
  },
);
const pageCount = computed(() =>
  Math.max(
    1,
    Math.ceil((props.total ?? props.items.length) / itemsPerPage.value),
  ),
);

function onKeydown(event: KeyboardEvent) {
  const row = (event.target as HTMLElement).closest<HTMLElement>(
    "tr[data-row-id]",
  );
  if (!row || event.target !== row) return;
  const item = itemOf(row);
  if (!item) return;
  const rows = [
    ...(root.value?.querySelectorAll<HTMLElement>("tr[data-row-id]") ?? []),
  ];
  const index = rows.indexOf(row);
  const moveTo = (target: HTMLElement | undefined) => {
    if (!target) return;
    event.preventDefault();
    focusRow(Number(target.dataset.rowId));
  };
  if (event.key === "ArrowDown") moveTo(rows[index + 1]);
  else if (event.key === "ArrowUp") moveTo(rows[index - 1]);
  else if (event.key === "Home") moveTo(rows[0]);
  else if (event.key === "End") moveTo(rows.at(-1));
  else if (event.key === "PageDown" && serverMode.value) {
    event.preventDefault();
    if (page.value < pageCount.value) {
      pendingEdge = "first";
      page.value += 1;
    } else moveTo(rows.at(-1));
  } else if (event.key === "PageUp" && serverMode.value) {
    event.preventDefault();
    if (page.value > 1) {
      pendingEdge = "last";
      page.value -= 1;
    } else moveTo(rows[0]);
  } else if (event.key === "Enter") {
    event.preventDefault();
    open(item);
  } else if (event.key === " ") {
    event.preventDefault();
    emit("select", item);
  } else if (
    event.key === "ContextMenu" ||
    (event.shiftKey && event.key === "F10")
  ) {
    event.preventDefault();
    const anchor =
      row.querySelector<HTMLElement>("[data-row-menu]") ??
      row.querySelector<HTMLElement>("td:last-child") ??
      row;
    openMenu(item, anchor, true);
  }
}

function isControl(event: MouseEvent) {
  return Boolean((event.target as HTMLElement | null)?.closest("button, a"));
}
function onRowClick(event: MouseEvent, ctx: { item: T }) {
  focusId.value = ctx.item.id;
  if (isControl(event)) return;
  emit("select", ctx.item);
}
function onRowDblclick(event: MouseEvent, ctx: { item: T }) {
  if (isControl(event)) return;
  open(ctx.item);
}

// ─── قائمة الأوامر الواحدة ─────────────────────────────────────────────
const menuOpen = ref(false);
const menuTarget = ref<HTMLElement | null>(null);
const menuItem = ref<T | null>(null) as { value: T | null };
const menuAll = ref(false);
const menuActions = computed(() => {
  if (!menuItem.value || !props.actions) return [];
  const all = props.actions(menuItem.value);
  // من لوحة المفاتيح تظهر كل الأوامر، فالأيقونات في الصف خارج ترتيب Tab.
  const listed = menuAll.value
    ? all
    : all.filter((action) => !action.inline || action.danger);
  return [
    ...listed.filter((action) => !action.danger),
    ...listed.filter((action) => action.danger),
  ];
});
const firstDanger = computed(() =>
  menuActions.value.findIndex((action) => action.danger),
);

function openMenu(item: T, anchor: HTMLElement, all: boolean) {
  menuItem.value = item;
  menuAll.value = all;
  menuTarget.value = anchor;
  focusId.value = item.id;
  menuOpen.value = true;
}
function runMenu(action: RowAction) {
  menuOpen.value = false;
  action.run();
}
// إغلاق القائمة يعيد التركيز إلى صفها، لا إلى بداية الصفحة.
watch(menuOpen, (isOpen) => {
  if (!isOpen && menuItem.value && !isDialogOpen()) focusRow(menuItem.value.id);
});

// اسم الجدول للقارئ الآلي، ووصف مختصر لطريقة التنقّل.
onMounted(() => {
  const table = root.value?.querySelector("table");
  table?.setAttribute("aria-label", props.tableLabel);
});

/** لاستدعاء الأب: تركيز الصف الأول (↓ من البحث مثلاً). */
function focusFirstRow() {
  focusRow(props.items[0]?.id);
}
/** فتح سجل من رابط داخل الخلية: يُحفظ كي يعود إليه التركيز بعد الرجوع. */
function remember(id: number) {
  lastOpened.set(props.gridKey, id);
}
defineExpose({ focusFirstRow, focusRow, remember });
</script>

<template>
  <div ref="root" class="dal-grid" @keydown="onKeydown">
    <v-alert
      v-if="error && items.length"
      type="error"
      variant="tonal"
      density="compact"
      class="dal-grid__alert"
      role="alert"
    >
      {{ error }}
      <template #append>
        <v-btn variant="text" size="small" @click="emit('retry')"
          >إعادة المحاولة</v-btn
        >
      </template>
    </v-alert>

    <component
      :is="serverMode ? VDataTableServer : VDataTable"
      class="dal-grid__table"
      :headers="vHeaders"
      :items="items"
      item-value="id"
      :loading="loading"
      fixed-header
      :row-props="rowProps"
      v-bind="serverBindings"
      @click:row="onRowClick"
      @dblclick:row="onRowDblclick"
    >
      <template v-for="name in itemSlots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps" />
      </template>
      <template v-if="actions" #item.actions="{ item }">
        <RowActions
          :actions="actions(item as T)"
          :label="rowLabel(item as T)"
          @more="(el) => openMenu(item as T, el, false)"
        />
      </template>
      <!-- الهيكل للتحميل الأول وحده: Vuetify يرسم فتحة loading بدل الصفوف كلما
           حُمّل، فكانت كل تصفية تُخفي الصفوف الظاهرة. مع وجود صفوف يكفي شريط التقدّم. -->
      <template v-if="!items.length" #loading>
        <v-skeleton-loader type="table-row@8" />
      </template>
      <template #no-data>
        <EmptyState
          v-if="error"
          icon="mdi-alert-circle-outline"
          title="تعذر تحميل القائمة"
          :text="error"
        >
          <template #actions>
            <v-btn variant="tonal" @click="emit('retry')">إعادة المحاولة</v-btn>
          </template>
        </EmptyState>
        <EmptyState
          v-else-if="hasFilters"
          icon="mdi-filter-off-outline"
          :title="noMatch?.title ?? 'لا نتائج للبحث والفلاتر الحالية'"
          :text="noMatch?.text ?? 'جرّب توسيع البحث أو إزالة بعض الفلاتر.'"
        >
          <template #actions>
            <v-btn variant="tonal" @click="emit('clearFilters')"
              >مسح الفلاتر</v-btn
            >
            <slot name="no-match-actions" />
          </template>
        </EmptyState>
        <EmptyState
          v-else
          :icon="empty.icon"
          :title="empty.title"
          :text="empty.text"
        >
          <template v-if="$slots['empty-actions']" #actions>
            <slot name="empty-actions" />
          </template>
        </EmptyState>
      </template>
    </component>

    <v-menu
      v-model="menuOpen"
      :target="menuTarget ?? undefined"
      location="bottom end"
    >
      <v-list density="compact" min-width="200">
        <template v-for="(action, index) in menuActions" :key="action.key">
          <v-divider v-if="index === firstDanger && index > 0" />
          <v-list-item
            :prepend-icon="action.icon"
            :title="action.label"
            :base-color="action.danger ? 'error' : undefined"
            @click="runMenu(action)"
          />
        </template>
      </v-list>
    </v-menu>
  </div>
</template>

<style scoped>
.dal-grid {
  container: grid / inline-size;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.dal-grid__alert {
  margin: 8px;
  flex: 0 0 auto;
}
/* الجدول يملأ اللوح: يتمرّر جسمه وحده، فيبقى الرأس والتذييل ظاهرين. */
.dal-grid__table {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: transparent;
}
.dal-grid__table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-height: 0;
}
.dal-grid__table :deep(.v-data-table__td) {
  white-space: nowrap;
}
.dal-grid__table :deep(tbody tr[data-row-id]) {
  cursor: default;
}
.dal-grid__table :deep(tbody tr[data-row-id]:focus-visible) {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
/* التحديد خلفية فقط: لا شريط ملوّن على الحافة. aria-selected يحمل المعنى. */
.dal-grid__table :deep(tr.dal-row--selected > td) {
  background: rgba(var(--v-theme-primary), 0.12);
}
.dal-grid__table :deep(.v-data-table-footer) {
  flex: 0 0 auto;
  padding-block: 2px;
}
/* التذييل بارتفاع زر (32px): حجم الصفحة وأزرار التنقّل، لا حقل نموذج. */
.dal-grid__table :deep(.v-data-table-footer__pagination .v-btn) {
  width: 32px;
  height: 32px;
}
/* 24px سطر + 4px + 4px = 32px. الكثافة compact تضيف 8px إلى الحشو العلوي عبر
   --v-input-padding-top، فكان الحقل 36–40px رغم ضبط الارتفاع. */
.dal-grid__table :deep(.v-data-table-footer .v-field) {
  --v-input-control-height: 32px;
  --v-input-padding-top: 0px;
  --v-field-padding-top: 4px;
  --v-field-padding-bottom: 4px;
}
.dal-grid__table :deep(.v-data-table__th) {
  border-bottom-color: var(--dal-stroke);
}
/* أوامر الصف هادئة حتى يُشار إلى صفها أو يُحدَّد: عمود أيقونات كامل بقوة
   النص كان يزاحم البيانات. الأمر الملوّن (مفضّل، حذف) يبقى بلونه، ويبقى
   الباهت بتباين 4.5:1 فلا يختفي. */
.dal-grid__table :deep(tbody .row-actions .v-btn) {
  color: var(--dal-muted);
}
.dal-grid__table
  :deep(
    tbody tr:is(:hover, :focus-within, .dal-row--selected) .row-actions .v-btn
  ) {
  color: rgb(var(--v-theme-on-surface));
}
@container grid (max-width: 70rem) {
  .dal-grid__table :deep(.dal-col-p2) {
    display: none;
  }
}
@container grid (max-width: 54rem) {
  .dal-grid__table :deep(.dal-col-p3) {
    display: none;
  }
}
</style>
