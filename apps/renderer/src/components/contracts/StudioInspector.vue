<script setup lang="ts">
import { computed } from "vue";
import {
  BLOCK_LABELS,
  BUNDLED_FONTS,
  SYSTEM_FONTS,
  fieldLabel,
  newId,
  para,
  richText,
  type Align,
  type Block,
  type BlockStyle,
  type BorderStyle,
  type Clause,
  type ClauseSettings,
  type ContractDocument,
  type PageBand,
  type RenderContext,
  type RichText,
  type Theme,
} from "@contract-document/index";
import InlineEditor, { type EditorApi } from "./InlineEditor.vue";
import {
  moveInList,
  updateBlock,
  updateClause,
} from "../../utils/contractDocument";
import { readFileAsDataUrl } from "../../utils/files";
import { useSnackbar } from "../../composables/useSnackbar";
import type { StudioSelection } from "./studio";

/**
 * Properties of the selection: a block's typography, spacing, border,
 * background, width and visibility plus its own settings; a clause's
 * numbering and visibility; or, with nothing selected, the page, theme,
 * header and footer and clause numbering.
 */
const props = defineProps<{
  document: ContractDocument;
  selection: StudioSelection;
  ctx: RenderContext;
  readonly?: boolean;
  /** Clause wording to restore one clause from. */
  reference: ContractDocument | null;
}>();
const emit = defineEmits<{
  apply: [ContractDocument, string?];
  select: [StudioSelection];
  focusEditor: [EditorApi];
}>();
const { notifyError } = useSnackbar();

const block = computed<Block | null>(() =>
  props.selection?.kind === "block"
    ? (props.document.blocks.find((item) => item.id === props.selection!.id) ??
      null)
    : null,
);
const clause = computed<Clause | null>(() =>
  props.selection?.kind === "clause"
    ? (props.document.clauses.find((item) => item.id === props.selection!.id) ??
      null)
    : null,
);

const FONT_ITEMS = [
  { title: "خط المستند", value: null },
  ...BUNDLED_FONTS.map((font) => ({
    title: font,
    value: font,
    props: { subtitle: "مرفق ببرنامج دلالي" },
  })),
  ...SYSTEM_FONTS.map((font) => ({
    title: font,
    value: font,
    props: { subtitle: "من خطوط ويندوز" },
  })),
];
const ALIGNS: Array<{ value: Align; icon: string; label: string }> = [
  { value: "start", icon: "mdi-format-align-right", label: "محاذاة لليمين" },
  { value: "center", icon: "mdi-format-align-center", label: "توسيط" },
  { value: "end", icon: "mdi-format-align-left", label: "محاذاة لليسار" },
  { value: "justify", icon: "mdi-format-align-justify", label: "ضبط" },
];
const BORDER_SIDES = [
  { title: "بلا حدود", value: "none" },
  { title: "إطار كامل", value: "all" },
  { title: "أعلى", value: "top" },
  { title: "أسفل", value: "bottom" },
  { title: "أعلى وأسفل", value: "block" },
];
const BORDER_STYLES = [
  { title: "متصل", value: "solid" },
  { title: "متقطع", value: "dashed" },
  { title: "مزدوج", value: "double" },
];

const number = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// ─── Block edits ────────────────────────────────────────────────────────

function applyBlock(change: (block: Block) => Block, key: string) {
  if (!block.value || props.readonly) return;
  emit(
    "apply",
    updateBlock(props.document, block.value.id, change),
    `${block.value.id}:${key}`,
  );
}
function patchBlock(change: Partial<Block>, key = "props") {
  applyBlock((current) => ({ ...current, ...change }) as Block, key);
}
function setStyle(change: Partial<BlockStyle>) {
  applyBlock(
    (current) => {
      const style: BlockStyle = { ...(current.style ?? {}), ...change };
      for (const key of Object.keys(style) as Array<keyof BlockStyle>)
        if (style[key] === undefined || style[key] === null) delete style[key];
      return { ...current, style };
    },
    `style-${Object.keys(change).join(",")}`,
  );
}
const style = computed<BlockStyle>(() => block.value?.style ?? {});
const borderSides = computed(() => style.value.border?.sides ?? "none");
function setBorder(change: Partial<BorderStyle> | "none") {
  if (change === "none") return setStyle({ border: null });
  const current: BorderStyle = style.value.border ?? {
    width: 1,
    color: "#333333",
    style: "solid",
    sides: "all",
  };
  setStyle({ border: { ...current, ...change } });
}

function resizeTable(rows: number, columns: number) {
  applyBlock((current) => {
    if (current.type !== "table") return current;
    const nextRows = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: columns }, (_, c) => current.rows[r]?.[c] ?? [[]]),
    );
    const widths = Array.from(
      { length: columns },
      (_, c) => current.widths[c] ?? 1,
    );
    return { ...current, rows: nextRows, widths };
  }, "table-size");
}
function moveRow(index: number, direction: 1 | -1) {
  applyBlock((current) => {
    if (current.type !== "table") return current;
    return {
      ...current,
      rows: moveInList(current.rows, index, index + direction),
    };
  }, "rows");
}
function removeRow(index: number) {
  applyBlock((current) => {
    if (current.type !== "table" || current.rows.length <= 1) return current;
    return { ...current, rows: current.rows.filter((_, i) => i !== index) };
  }, "rows");
}
function rowSummary(row: RichText[]) {
  const label = row
    .map((cell) => richText(cell, (key) => `«${fieldLabel(key)}»`, " "))
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
  return label.slice(0, 40) || "صف فارغ";
}
function setWidth(index: number, value: unknown) {
  applyBlock((current) => {
    if (current.type !== "table") return current;
    const widths = current.widths.map((width, i) =>
      i === index ? Math.min(10, Math.max(0.1, number(value) ?? width)) : width,
    );
    return { ...current, widths };
  }, `width-${index}`);
}

function addSigner() {
  applyBlock((current) => {
    if (current.type !== "signatures" || current.signers.length >= 8)
      return current;
    return {
      ...current,
      signers: [
        ...current.signers,
        { id: newId("s"), title: para("موقّع"), name: [] },
      ],
    };
  }, "signers");
}
function removeSigner(index: number) {
  applyBlock((current) => {
    if (current.type !== "signatures" || current.signers.length <= 1)
      return current;
    return {
      ...current,
      signers: current.signers.filter((_, i) => i !== index),
    };
  }, "signers");
}

async function uploadImage(files: File | File[] | null) {
  const file = Array.isArray(files) ? files[0] : files;
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    notifyError("اختر صورة PNG أو JPEG لتظهر في PDF وWord معاً.");
    return;
  }
  if (file.size > 1_500_000) {
    notifyError("حجم الصورة أكبر من 1.5 ميغابايت. صغّرها ثم أعد المحاولة.");
    return;
  }
  const data = await readFileAsDataUrl(file);
  patchBlock({ source: "embedded", data } as Partial<Block>, "image");
}

// ─── Clause edits ───────────────────────────────────────────────────────

function patchClause(change: Partial<Clause>) {
  if (!clause.value || props.readonly) return;
  emit(
    "apply",
    updateClause(props.document, clause.value.id, (current) => ({
      ...current,
      ...change,
    })),
  );
}
const referenceClause = computed(() => {
  if (!clause.value || !props.reference) return null;
  const origin = clause.value.origin ?? clause.value.id;
  return (
    props.reference.clauses.find(
      (item) => (item.origin ?? item.id) === origin,
    ) ?? null
  );
});
function restoreClause() {
  if (!referenceClause.value) return;
  patchClause({
    title: JSON.parse(JSON.stringify(referenceClause.value.title)),
    body: JSON.parse(JSON.stringify(referenceClause.value.body)),
  });
}
function removeClause() {
  if (!clause.value || clause.value.required || props.readonly) return;
  emit("apply", {
    ...props.document,
    clauses: props.document.clauses.filter(
      (item) => item.id !== clause.value!.id,
    ),
  });
  emit("select", null);
}

// ─── Document edits ─────────────────────────────────────────────────────

function patchDocument(change: Partial<ContractDocument>, key: string) {
  if (props.readonly) return;
  emit("apply", { ...props.document, ...change }, `document:${key}`);
}
function setMargin(side: "top" | "bottom" | "start" | "end", value: unknown) {
  const size = number(value);
  if (size === undefined) return;
  patchDocument(
    {
      page: {
        ...props.document.page,
        margins: {
          ...props.document.page.margins,
          [side]: Math.min(60, Math.max(5, size)),
        },
      },
    },
    `margin-${side}`,
  );
}
function setTheme(change: Partial<Theme>) {
  patchDocument(
    { theme: { ...props.document.theme, ...change } },
    `theme-${Object.keys(change)[0]}`,
  );
}
function setBand(which: "header" | "footer", change: Partial<PageBand>) {
  patchDocument(
    { [which]: { ...props.document[which], ...change } },
    `${which}-${Object.keys(change)[0]}`,
  );
}
function setClauseSettings(change: Partial<ClauseSettings>) {
  patchDocument(
    { clause_settings: { ...props.document.clause_settings, ...change } },
    `clauses-${Object.keys(change)[0]}`,
  );
}
function setClauseStyle(
  which: "title_style" | "body_style",
  change: Partial<BlockStyle>,
) {
  const next = { ...props.document.clause_settings[which], ...change };
  for (const key of Object.keys(next) as Array<keyof BlockStyle>)
    if (next[key] === undefined || next[key] === null) delete next[key];
  setClauseSettings({ [which]: next });
}

const NUMBERING = [
  { title: "ترتيبي: البند الأول، الثاني…", value: "ordinal" },
  { title: "رقمي: البند (1)، (2)…", value: "number" },
  { title: "بلا ترقيم", value: "none" },
];
</script>

<template>
  <aside class="inspector" aria-label="الخصائص">
    <!-- ─── Clause ─── -->
    <template v-if="clause">
      <header class="inspector__head">
        <v-icon size="18" icon="mdi-format-list-numbered-rtl" />
        <span class="dal-section-title">بند</span>
      </header>
      <div class="inspector__body">
        <p class="inspector__hint">
          عدّل عنوان البند ونصه مباشرة على الصفحة، وأدرج الحقول من شريط الأدوات.
        </p>
        <v-switch
          :model-value="clause.numbered"
          :disabled="readonly"
          label="يدخل في الترقيم"
          color="primary"
          hide-details
          density="compact"
          @update:model-value="patchClause({ numbered: Boolean($event) })"
        />
        <v-switch
          :model-value="!clause.hidden"
          :disabled="readonly"
          label="ظاهر في العقد"
          color="primary"
          hide-details
          density="compact"
          @update:model-value="patchClause({ hidden: !$event })"
        />
        <v-alert
          v-if="clause.required"
          density="compact"
          variant="tonal"
          type="info"
          class="my-2"
        >
          بند أساسي في هذا القالب: يمكن تعديل صياغته أو إخفاؤه، لا حذفه.
        </v-alert>
        <div class="inspector__actions">
          <v-btn
            v-if="referenceClause && !readonly"
            size="small"
            variant="tonal"
            prepend-icon="mdi-restore"
            @click="restoreClause"
            >استعادة الصياغة الأصلية</v-btn
          >
          <v-btn
            v-if="!clause.required && !readonly"
            size="small"
            variant="text"
            color="error"
            prepend-icon="mdi-delete-outline"
            @click="removeClause"
            >حذف البند</v-btn
          >
        </div>
      </div>
    </template>

    <!-- ─── Block ─── -->
    <template v-else-if="block">
      <header class="inspector__head">
        <span class="dal-section-title">{{ BLOCK_LABELS[block.type] }}</span>
        <v-spacer />
        <v-btn size="small" variant="text" @click="emit('select', null)"
          >الصفحة</v-btn
        >
      </header>
      <div class="inspector__body">
        <v-switch
          :model-value="!block.hidden"
          :disabled="readonly"
          label="ظاهر في العقد"
          color="primary"
          hide-details
          density="compact"
          @update:model-value="patchBlock({ hidden: !$event })"
        />

        <!-- Type settings -->
        <template v-if="block.type === 'heading'">
          <v-btn-toggle
            :model-value="block.level"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="mb-3"
            :disabled="readonly"
            @update:model-value="patchBlock({ level: $event })"
          >
            <v-btn :value="1">رئيسي</v-btn>
            <v-btn :value="2">فرعي</v-btn>
            <v-btn :value="3">صغير</v-btn>
          </v-btn-toggle>
        </template>
        <template v-else-if="block.type === 'table'">
          <div class="inspector__grid">
            <v-text-field
              label="الصفوف"
              type="number"
              :model-value="block.rows.length"
              min="1"
              max="200"
              :disabled="readonly"
              @update:model-value="
                resizeTable(
                  Math.min(200, Math.max(1, number($event) ?? 1)),
                  block.rows[0]?.length ?? 1,
                )
              "
            />
            <v-text-field
              label="الأعمدة"
              type="number"
              :model-value="block.rows[0]?.length ?? 1"
              min="1"
              max="8"
              :disabled="readonly"
              @update:model-value="
                resizeTable(
                  block.rows.length,
                  Math.min(8, Math.max(1, number($event) ?? 1)),
                )
              "
            />
          </div>
          <div class="inspector__label">الصفوف</div>
          <div
            v-for="(row, index) in block.rows"
            :key="index"
            class="inspector__row"
          >
            <span class="inspector__row-text"
              >{{ index + 1 }}. {{ rowSummary(row) }}</span
            >
            <span v-if="!readonly">
              <v-btn
                size="x-small"
                variant="text"
                icon="mdi-arrow-up"
                :disabled="index === 0"
                :aria-label="`نقل الصف ${index + 1} للأعلى`"
                @click="moveRow(index, -1)"
              />
              <v-btn
                size="x-small"
                variant="text"
                icon="mdi-arrow-down"
                :disabled="index === block.rows.length - 1"
                :aria-label="`نقل الصف ${index + 1} للأسفل`"
                @click="moveRow(index, 1)"
              />
              <v-btn
                size="x-small"
                variant="text"
                icon="mdi-close"
                :disabled="block.rows.length <= 1"
                :aria-label="`حذف الصف ${index + 1}`"
                @click="removeRow(index)"
              />
            </span>
          </div>
          <v-btn
            v-if="!readonly"
            size="small"
            variant="tonal"
            prepend-icon="mdi-table-row-plus-after"
            class="mb-3"
            @click="
              resizeTable(block.rows.length + 1, block.rows[0]?.length ?? 1)
            "
            >صف جديد</v-btn
          >
          <div class="inspector__label">نسب عرض الأعمدة (من اليمين)</div>
          <div class="inspector__grid">
            <v-text-field
              v-for="(width, index) in block.widths"
              :key="index"
              :label="`العمود ${index + 1}`"
              type="number"
              step="0.5"
              :model-value="width"
              :disabled="readonly"
              @update:model-value="setWidth(index, $event)"
            />
          </div>
          <v-switch
            :model-value="block.header_row"
            :disabled="readonly"
            label="الصف الأول ترويسة"
            color="primary"
            hide-details
            density="compact"
            @update:model-value="patchBlock({ header_row: Boolean($event) })"
          />
          <v-switch
            :model-value="block.borders"
            :disabled="readonly"
            label="حدود الخلايا"
            color="primary"
            hide-details
            density="compact"
            @update:model-value="patchBlock({ borders: Boolean($event) })"
          />
        </template>
        <template v-else-if="block.type === 'letterhead'">
          <v-switch
            :model-value="block.logo"
            :disabled="readonly"
            label="شعار المكتب في الوسط"
            color="primary"
            hide-details
            density="compact"
            @update:model-value="patchBlock({ logo: Boolean($event) })"
          />
          <v-text-field
            v-if="block.logo"
            label="عرض الشعار (مم)"
            type="number"
            :model-value="block.logo_width"
            :disabled="readonly"
            @update:model-value="
              patchBlock({
                logo_width: Math.min(80, Math.max(10, number($event) ?? 26)),
              })
            "
          />
          <p class="inspector__hint">
            الشعار وبيانات المكتب من الإعدادات. تغييرها لا يغيّر العقود الصادرة.
          </p>
        </template>
        <template v-else-if="block.type === 'image'">
          <v-select
            label="الصورة"
            :items="[
              { title: 'شعار المكتب', value: 'logo' },
              { title: 'صورة مرفوعة', value: 'embedded' },
            ]"
            :model-value="block.source"
            :disabled="readonly"
            @update:model-value="patchBlock({ source: $event })"
          />
          <v-file-input
            v-if="block.source === 'embedded' && !readonly"
            label="رفع صورة (PNG أو JPEG)"
            accept="image/png,image/jpeg"
            prepend-icon=""
            prepend-inner-icon="mdi-image-plus-outline"
            @update:model-value="uploadImage"
          />
          <v-text-field
            label="العرض (مم)"
            type="number"
            :model-value="block.width"
            :disabled="readonly"
            @update:model-value="
              patchBlock({
                width: Math.min(180, Math.max(5, number($event) ?? 35)),
              })
            "
          />
          <v-btn-toggle
            :model-value="block.align"
            mandatory
            density="compact"
            variant="outlined"
            divided
            class="mb-3"
            :disabled="readonly"
            @update:model-value="patchBlock({ align: $event })"
          >
            <v-btn
              v-for="item in ALIGNS.slice(0, 3)"
              :key="item.value"
              :value="item.value"
              :icon="item.icon"
              :aria-label="item.label"
            />
          </v-btn-toggle>
        </template>
        <template v-else-if="block.type === 'signatures'">
          <v-switch
            :model-value="block.show_date"
            :disabled="readonly"
            label="سطر التاريخ تحت كل توقيع"
            color="primary"
            hide-details
            density="compact"
            @update:model-value="patchBlock({ show_date: Boolean($event) })"
          />
          <div class="inspector__label">الموقّعون</div>
          <div
            v-for="(signer, index) in block.signers"
            :key="signer.id"
            class="inspector__row"
          >
            <span>الموقّع {{ index + 1 }}</span>
            <v-btn
              v-if="!readonly && block.signers.length > 1"
              size="x-small"
              variant="text"
              icon="mdi-close"
              :aria-label="`حذف الموقّع ${index + 1}`"
              @click="removeSigner(index)"
            />
          </div>
          <v-btn
            v-if="!readonly && block.signers.length < 8"
            size="small"
            variant="tonal"
            prepend-icon="mdi-plus"
            class="mb-3"
            @click="addSigner"
            >موقّع آخر</v-btn
          >
        </template>
        <template v-else-if="block.type === 'schedule'">
          <p class="inspector__hint">
            يُحسب الجدول من المبلغ والعدد والتواريخ في تفاصيل العقد، ويتجدد
            معها.
          </p>
        </template>
        <template v-else-if="block.type === 'clauses'">
          <p class="inspector__hint">
            ترقيم البنود وخطها في إعدادات الصفحة (اضغط «الصفحة»).
          </p>
        </template>

        <!-- Typography and box -->
        <template v-if="!['page_break', 'separator'].includes(block.type)">
          <div class="inspector__section">الخط</div>
          <v-select
            label="نوع الخط"
            :items="FONT_ITEMS"
            :model-value="style.font_family ?? null"
            :disabled="readonly"
            @update:model-value="setStyle({ font_family: $event ?? undefined })"
          />
          <div class="inspector__grid">
            <v-text-field
              label="الحجم (نقطة)"
              type="number"
              step="0.5"
              :model-value="style.font_size"
              placeholder="حجم المستند"
              clearable
              :disabled="readonly"
              @update:model-value="setStyle({ font_size: number($event) })"
            />
            <v-text-field
              label="تباعد الأسطر"
              type="number"
              step="0.05"
              :model-value="style.line_height"
              placeholder="المستند"
              clearable
              :disabled="readonly"
              @update:model-value="setStyle({ line_height: number($event) })"
            />
          </div>
          <div class="inspector__inline">
            <v-checkbox
              :model-value="Boolean(style.bold)"
              label="عريض"
              hide-details
              density="compact"
              :disabled="readonly"
              @update:model-value="
                setStyle({ bold: $event ? true : undefined })
              "
            />
            <label class="inspector__color">
              <span>لون النص</span>
              <input
                type="color"
                :value="style.color ?? document.theme.color"
                :disabled="readonly"
                @change="
                  setStyle({ color: ($event.target as HTMLInputElement).value })
                "
              />
            </label>
            <v-btn
              v-if="style.color"
              size="x-small"
              variant="text"
              @click="setStyle({ color: undefined })"
              >افتراضي</v-btn
            >
          </div>
          <v-btn-toggle
            :model-value="style.align ?? null"
            density="compact"
            variant="outlined"
            divided
            class="mb-3"
            :disabled="readonly"
            @update:model-value="setStyle({ align: $event ?? undefined })"
          >
            <v-btn
              v-for="item in ALIGNS"
              :key="item.value"
              :value="item.value"
              :icon="item.icon"
              :aria-label="item.label"
              :title="item.label"
            />
          </v-btn-toggle>

          <div class="inspector__section">المسافات</div>
          <div class="inspector__grid">
            <v-text-field
              label="قبل (نقطة)"
              type="number"
              :model-value="style.space_before"
              clearable
              :disabled="readonly"
              @update:model-value="setStyle({ space_before: number($event) })"
            />
            <v-text-field
              label="بعد (نقطة)"
              type="number"
              :model-value="style.space_after"
              clearable
              :disabled="readonly"
              @update:model-value="setStyle({ space_after: number($event) })"
            />
            <v-text-field
              label="إزاحة من اليمين (مم)"
              type="number"
              :model-value="style.indent"
              clearable
              :disabled="readonly"
              @update:model-value="setStyle({ indent: number($event) })"
            />
            <v-text-field
              label="حشو داخلي (مم)"
              type="number"
              :model-value="style.padding"
              clearable
              :disabled="readonly"
              @update:model-value="setStyle({ padding: number($event) })"
            />
          </div>
          <v-text-field
            v-if="block.type === 'table' || block.type === 'signatures'"
            label="العرض (% من عرض النص)"
            type="number"
            :model-value="style.width"
            placeholder="100"
            clearable
            :disabled="readonly"
            @update:model-value="setStyle({ width: number($event) })"
          />

          <div class="inspector__section">الحدود والخلفية</div>
          <v-select
            label="الحدود"
            :items="BORDER_SIDES"
            :model-value="borderSides"
            :disabled="readonly"
            @update:model-value="
              $event === 'none'
                ? setBorder('none')
                : setBorder({ sides: $event as BorderStyle['sides'] })
            "
          />
          <div v-if="style.border" class="inspector__grid">
            <v-text-field
              label="السماكة (نقطة)"
              type="number"
              step="0.25"
              :model-value="style.border.width"
              :disabled="readonly"
              @update:model-value="
                setBorder({
                  width: Math.min(6, Math.max(0.25, number($event) ?? 1)),
                })
              "
            />
            <v-select
              label="النمط"
              :items="BORDER_STYLES"
              :model-value="style.border.style"
              :disabled="readonly"
              @update:model-value="setBorder({ style: $event })"
            />
          </div>
          <div class="inspector__inline">
            <label v-if="style.border" class="inspector__color">
              <span>لون الحد</span>
              <input
                type="color"
                :value="style.border.color"
                :disabled="readonly"
                @change="
                  setBorder({
                    color: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
            <label class="inspector__color">
              <span>الخلفية</span>
              <input
                type="color"
                :value="style.background ?? '#ffffff'"
                :disabled="readonly"
                @change="
                  setStyle({
                    background: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </label>
            <v-btn
              v-if="style.background"
              size="x-small"
              variant="text"
              @click="setStyle({ background: null })"
              >بلا خلفية</v-btn
            >
          </div>
        </template>
      </div>
    </template>

    <!-- ─── Document ─── -->
    <template v-else>
      <header class="inspector__head">
        <v-icon size="18" icon="mdi-file-cog-outline" />
        <span class="dal-section-title">الصفحة والمستند</span>
      </header>
      <div class="inspector__body">
        <div class="inspector__section">هوامش A4 (مم)</div>
        <div class="inspector__grid">
          <v-text-field
            label="أعلى"
            type="number"
            :model-value="document.page.margins.top"
            :disabled="readonly"
            @update:model-value="setMargin('top', $event)"
          />
          <v-text-field
            label="أسفل"
            type="number"
            :model-value="document.page.margins.bottom"
            :disabled="readonly"
            @update:model-value="setMargin('bottom', $event)"
          />
          <v-text-field
            label="يمين"
            type="number"
            :model-value="document.page.margins.start"
            :disabled="readonly"
            @update:model-value="setMargin('start', $event)"
          />
          <v-text-field
            label="يسار"
            type="number"
            :model-value="document.page.margins.end"
            :disabled="readonly"
            @update:model-value="setMargin('end', $event)"
          />
        </div>

        <div class="inspector__section">الخط والألوان</div>
        <v-select
          label="خط المستند"
          :items="FONT_ITEMS.slice(1)"
          :model-value="document.theme.font_family"
          :disabled="readonly"
          @update:model-value="setTheme({ font_family: $event })"
        />
        <div class="inspector__grid">
          <v-text-field
            label="الحجم (نقطة)"
            type="number"
            step="0.5"
            :model-value="document.theme.font_size"
            :disabled="readonly"
            @update:model-value="
              setTheme({
                font_size: Math.min(24, Math.max(8, number($event) ?? 12)),
              })
            "
          />
          <v-text-field
            label="تباعد الأسطر"
            type="number"
            step="0.05"
            :model-value="document.theme.line_height"
            :disabled="readonly"
            @update:model-value="
              setTheme({
                line_height: Math.min(3, Math.max(1, number($event) ?? 1.7)),
              })
            "
          />
          <v-text-field
            label="بين الفقرات (نقطة)"
            type="number"
            :model-value="document.theme.paragraph_spacing"
            :disabled="readonly"
            @update:model-value="
              setTheme({
                paragraph_spacing: Math.min(
                  36,
                  Math.max(0, number($event) ?? 6),
                ),
              })
            "
          />
        </div>
        <div class="inspector__inline">
          <label class="inspector__color"
            ><span>النص</span
            ><input
              type="color"
              :value="document.theme.color"
              :disabled="readonly"
              @change="
                setTheme({ color: ($event.target as HTMLInputElement).value })
              "
          /></label>
          <label class="inspector__color"
            ><span>العناوين والخطوط</span
            ><input
              type="color"
              :value="document.theme.accent"
              :disabled="readonly"
              @change="
                setTheme({ accent: ($event.target as HTMLInputElement).value })
              "
          /></label>
        </div>

        <div class="inspector__section">ترقيم البنود</div>
        <v-select
          label="طريقة الترقيم"
          :items="NUMBERING"
          :model-value="document.clause_settings.numbering"
          :disabled="readonly"
          @update:model-value="setClauseSettings({ numbering: $event })"
        />
        <v-text-field
          label="الكلمة قبل الرقم"
          :model-value="document.clause_settings.prefix"
          maxlength="30"
          :disabled="readonly"
          @update:model-value="
            setClauseSettings({ prefix: String($event ?? '') })
          "
        />
        <div class="inspector__grid">
          <v-text-field
            label="حجم العنوان"
            type="number"
            step="0.5"
            :model-value="document.clause_settings.title_style.font_size"
            placeholder="المستند"
            clearable
            :disabled="readonly"
            @update:model-value="
              setClauseStyle('title_style', { font_size: number($event) })
            "
          />
          <v-text-field
            label="حجم النص"
            type="number"
            step="0.5"
            :model-value="document.clause_settings.body_style.font_size"
            placeholder="المستند"
            clearable
            :disabled="readonly"
            @update:model-value="
              setClauseStyle('body_style', { font_size: number($event) })
            "
          />
        </div>

        <div v-for="which in ['header', 'footer'] as const" :key="which">
          <div class="inspector__section">
            {{ which === "header" ? "ترويسة الصفحات" : "تذييل الصفحات" }}
          </div>
          <v-switch
            :model-value="document[which].enabled"
            :disabled="readonly"
            :label="
              which === 'header' ? 'سطر أعلى كل صفحة' : 'سطر أسفل كل صفحة'
            "
            color="primary"
            hide-details
            density="compact"
            @update:model-value="setBand(which, { enabled: Boolean($event) })"
          />
          <template v-if="document[which].enabled">
            <div class="inspector__band">
              <InlineEditor
                :model-value="[document[which].text]"
                :ctx="ctx"
                :readonly="readonly"
                single
                :label="which === 'header' ? 'نص الترويسة' : 'نص التذييل'"
                @focus="emit('focusEditor', $event)"
                @update:model-value="setBand(which, { text: $event[0] ?? [] })"
              />
            </div>
            <v-switch
              v-if="which === 'footer'"
              :model-value="Boolean(document.footer.page_numbers)"
              :disabled="readonly"
              label="رقم الصفحة: «صفحة 1 من 3»"
              color="primary"
              hide-details
              density="compact"
              @update:model-value="
                setBand('footer', { page_numbers: Boolean($event) })
              "
            />
            <v-btn-toggle
              :model-value="document[which].align"
              mandatory
              density="compact"
              variant="outlined"
              divided
              class="mb-2"
              :disabled="readonly"
              @update:model-value="setBand(which, { align: $event })"
            >
              <v-btn
                v-for="item in ALIGNS.slice(0, 3)"
                :key="item.value"
                :value="item.value"
                :icon="item.icon"
                :aria-label="item.label"
              />
            </v-btn-toggle>
          </template>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.inspector__head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 45px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dal-stroke);
}
.inspector__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 8px 12px 16px;
}
.inspector__body :deep(.v-input) {
  margin-bottom: 8px;
}
.inspector__body :deep(.v-field) {
  --v-input-control-height: 36px;
}
.inspector__section {
  margin: 14px 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--dal-muted);
}
.inspector__label {
  margin: 4px 0;
  font-size: 12px;
  color: var(--dal-muted);
}
.inspector__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 8px;
}
.inspector__inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-bottom: 8px;
}
.inspector__color {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.inspector__color input {
  width: 32px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--dal-stroke);
  border-radius: 4px;
  background: none;
}
.inspector__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.inspector__row-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}
.inspector__hint {
  margin: 4px 0 8px;
  font-size: 12.5px;
  color: var(--dal-muted);
}
.inspector__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.inspector__band {
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-control);
  padding: 6px 8px;
  margin: 6px 0;
  font-size: 13px;
  direction: rtl;
}
</style>
