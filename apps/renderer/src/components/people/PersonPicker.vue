<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import * as peopleService from "../../services/people.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { PERSON_PICKER_SIZE } from "../../constants/crm";
import type { PersonRecord } from "../../types";

/**
 * اختيار شخص بالبحث في الخادم (/people/paged) بدل تنزيل كل الأشخاص: أول
 * PERSON_PICKER_SIZE بالاسم عند فتح القائمة، ثم نتائج البحث بعد توقّف الكتابة.
 * الشخص المختار يُجلب بمعرّفه إن لم يكن في النتائج، فيظهر اسمه في نموذج
 * التعديل. كل نتيجة تحمل رمز الشخص وهاتفه تحت اسمه، فيُميَّز الاسمان
 * المتشابهان. picked يحمل الشخص المختار ليملأ النموذج اسمه وهاتفه.
 * بقية الخصائص (label، clearable…) تمر إلى v-autocomplete.
 */
const model = defineModel<number | null>({ default: null });
const emit = defineEmits<{ picked: [PersonRecord | null] }>();

const { can } = usePermissions();
const results = ref<PersonRecord[]>([]);
const selected = ref<PersonRecord | null>(null);
const loading = ref(false);
let controller: AbortController | null = null;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let loadedQuery: string | null = null;

const items = computed(() =>
  selected.value &&
  !results.value.some((person) => person.id === selected.value?.id)
    ? [selected.value, ...results.value]
    : results.value,
);

/** أحدث بحث فقط يكتب نتيجته؛ ما قبله يُلغى. */
async function search(q: string) {
  if (!can("people.read") || q === loadedQuery) return;
  controller?.abort();
  const current = new AbortController();
  controller = current;
  loading.value = true;
  try {
    const page = await peopleService.listPeoplePage(
      { q },
      {
        page: 1,
        page_size: PERSON_PICKER_SIZE,
        sort_by: "full_name",
        sort_order: "asc",
      },
      current.signal,
    );
    if (current.signal.aborted) return;
    results.value = page.items;
    loadedQuery = q;
  } catch (error) {
    if (!current.signal.aborted)
      useSnackbar().notifyError(getErrorMessage(error));
  } finally {
    if (controller === current) {
      controller = null;
      loading.value = false;
    }
  }
}

function onSearch(text: string | null) {
  const q = (text ?? "").trim();
  // بعد الاختيار يضع الحقل اسم المختار في البحث؛ لا حاجة لطلب.
  if (selected.value && q === selected.value.full_name) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void search(q), 300);
}

function onMenu(open: boolean) {
  if (open && loadedQuery === null) void search("");
}

// اختيار المستخدم نفسه (لا تحميل شخص محفوظ): يُبلَّغ الأب بالشخص كاملاً.
function onPick(id: number | null) {
  model.value = id;
  emit("picked", results.value.find((person) => person.id === id) ?? null);
}
const detailOf = (person: PersonRecord) =>
  [person.code, person.phone_primary].filter(Boolean).join(" · ");

watch(
  model,
  async (id) => {
    if (!id) {
      selected.value = null;
      return;
    }
    if (selected.value?.id === id) return;
    const found = results.value.find((person) => person.id === id);
    if (found) {
      selected.value = found;
      return;
    }
    if (!can("people.read")) return;
    try {
      const person = await peopleService.getPerson(id);
      if (model.value === id) selected.value = person;
    } catch {
      // شخص لم يعد موجوداً: يبقى المعرّف كما هو، كما في القائمة الكاملة سابقاً.
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  controller?.abort();
});
</script>

<template>
  <v-autocomplete
    :model-value="model"
    :items="items"
    :loading="loading"
    item-title="full_name"
    item-value="id"
    no-filter
    no-data-text="لا يوجد زبون بهذا الاسم أو الهاتف"
    @update:model-value="onPick"
    @update:search="onSearch"
    @update:menu="onMenu"
  >
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps" :subtitle="detailOf(item.raw)" />
    </template>
  </v-autocomplete>
</template>
