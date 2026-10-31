<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useSlots, watch } from "vue";
import type { FilterChip } from "./grid";
import { isDialogOpen } from "../../utils/dialog";

/**
 * شريط أدوات القائمة داخل لوحها، واحد لكل القوائم: صف للبحث والفلاتر
 * الأساسية (#filters)، وصف للعروض السريعة (#views) والشرائح والترتيب (#end)،
 * ودرج «فلاتر إضافية» (#extra) للباقي.
 * - أي تغيّر في filters يُطبَّق بعد توقّف قصير؛ Enter فوراً.
 * - Ctrl+F (بـ code، فيعمل مع العربية) يركّز البحث، Esc يمسحه، ↓ ينقل إلى أول صف.
 * - الشرائح يبنيها الأب من حقوله (لكل فلتر فعّال شريحة)، وإزالتها حدث له.
 */
const search = defineModel<string | null>("search", { default: "" });
const props = withDefaults(
  defineProps<{
    /** حالة الفلاتر كلها (كائن أو قيمة): تغيّرها يطلق apply بعد التوقّف. */
    filters?: unknown;
    searchLabel: string;
    placeholder: string;
    chips?: FilterChip[];
    /** عدد الفلاتر الفعّالة داخل الدرج، على زرّه. */
    extraCount?: number;
    /** Ctrl+F لهذا الشريط (صفحة فيها شريط واحد). */
    shortcut?: boolean;
    delay?: number;
  }>(),
  { chips: () => [], extraCount: 0, shortcut: true, delay: 300 },
);
const emit = defineEmits<{
  apply: [];
  down: [];
  remove: [key: string];
  clear: [];
}>();
const slots = useSlots();

const extraOpen = ref(false);
const searchRef = ref<{ $el?: HTMLElement } | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => emit("apply"), props.delay);
}
watch(search, schedule);
// Pages often pass the values as a new array each render (`[kind, status]`).
// Compare the values: a deep watch fired on every re-render, so each load
// (its rows and loading flag re-render the page) applied the filters again.
watch(() => JSON.stringify(props.filters ?? null), schedule);

function applyNow() {
  clearTimeout(timer);
  emit("apply");
}

function focusSearch() {
  const input = searchRef.value?.$el?.querySelector("input");
  input?.focus();
  input?.select();
}
function onGlobalKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyF") return;
  if (event.altKey || event.shiftKey) return;
  if (isDialogOpen()) return;
  event.preventDefault();
  focusSearch();
}
function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (search.value) search.value = "";
    else (event.target as HTMLElement).blur();
  } else if (event.key === "Enter") {
    applyNow();
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    emit("down");
  }
}

onMounted(() => {
  if (props.shortcut) window.addEventListener("keydown", onGlobalKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  clearTimeout(timer);
});

defineExpose({ focusSearch, applyNow });
</script>

<template>
  <div class="dal-toolbar">
    <div class="dal-toolbar__row">
      <v-text-field
        ref="searchRef"
        v-model="search"
        class="dal-toolbar__search"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        :placeholder="shortcut ? `${placeholder} (Ctrl+F)` : placeholder"
        :aria-label="searchLabel"
        :aria-keyshortcuts="shortcut ? 'Control+F' : undefined"
        @keydown="onSearchKeydown"
      />
      <slot name="filters" />
    </div>

    <div
      v-if="slots.views || slots.end || slots.extra || chips.length"
      class="dal-toolbar__row dal-toolbar__row--sub"
    >
      <slot name="views" />
      <div v-if="chips.length" class="dal-toolbar__chips">
        <v-chip
          v-for="chip in chips"
          :key="chip.key"
          size="small"
          variant="tonal"
          label
          closable
          :close-label="`إزالة ${chip.label}`"
          @click:close="emit('remove', chip.key)"
          >{{ chip.label }}</v-chip
        >
        <v-btn size="small" variant="text" @click="emit('clear')"
          >مسح الكل</v-btn
        >
      </div>
      <v-spacer />
      <v-btn
        v-if="slots.extra"
        variant="text"
        size="small"
        prepend-icon="mdi-tune-variant"
        :aria-label="
          extraCount ? `فلاتر إضافية، مفعّل منها ${extraCount}` : 'فلاتر إضافية'
        "
        @click="extraOpen = true"
      >
        فلاتر إضافية
        <span v-if="extraCount" class="dal-count ms-1">{{ extraCount }}</span>
      </v-btn>
      <slot name="end" />
    </div>

    <v-navigation-drawer
      v-if="slots.extra"
      v-model="extraOpen"
      temporary
      location="end"
      width="340"
    >
      <div class="dal-extra__header">
        <h2 class="dal-section-title">فلاتر إضافية</h2>
        <v-spacer />
        <v-btn variant="text" size="small" @click="emit('clear')">مسح</v-btn>
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          aria-label="إغلاق الفلاتر الإضافية"
          @click="extraOpen = false"
        />
      </div>
      <v-divider />
      <div class="dal-extra__body">
        <slot name="extra" />
      </div>
    </v-navigation-drawer>
  </div>
</template>
