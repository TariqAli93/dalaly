<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  FIELD_GROUP_LABELS,
  fieldsFor,
  type FieldGroup,
  type FieldValues,
  type TemplateKey,
} from "@contract-document/index";

/**
 * Searchable list of the fields a template offers, grouped (contract, each
 * party, property, payment, witnesses, office), each with its current value
 * when a contract is open. Picking one inserts it at the caret.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ template: TemplateKey; values: FieldValues }>();
const emit = defineEmits<{ pick: [string] }>();

const search = ref("");
const searchField = ref<{ focus: () => void } | null>(null);

const groups = computed(() => {
  const q = search.value.trim();
  const byGroup = new Map<FieldGroup, ReturnType<typeof fieldsFor>>();
  for (const field of fieldsFor(props.template)) {
    if (q && !field.label.includes(q) && !field.key.includes(q.toLowerCase()))
      continue;
    const list = byGroup.get(field.group) ?? [];
    list.push(field);
    byGroup.set(field.group, list);
  }
  return [...byGroup.entries()].map(([group, fields]) => ({
    group,
    title: FIELD_GROUP_LABELS[group],
    fields,
  }));
});
const first = computed(() => groups.value[0]?.fields[0]?.key ?? null);

function pick(key: string) {
  emit("pick", key);
  open.value = false;
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  search.value = "";
  void nextTick(() => searchField.value?.focus());
});
</script>

<template>
  <v-dialog v-model="open" max-width="460" scrollable>
    <v-card>
      <v-card-title class="text-subtitle-1 font-weight-bold"
        >إدراج حقل</v-card-title
      >
      <v-card-text class="pt-0">
        <v-text-field
          ref="searchField"
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          placeholder="ابحث عن حقل: اسم، رقم، تاريخ…"
          hide-details
          density="compact"
          class="mb-2"
          @keydown.enter.prevent="first && pick(first)"
        />
        <v-list
          density="compact"
          class="picker-list"
          aria-label="الحقول المتاحة"
        >
          <template v-for="group in groups" :key="group.group">
            <v-list-subheader>{{ group.title }}</v-list-subheader>
            <v-list-item
              v-for="field in group.fields"
              :key="field.key"
              :title="field.label"
              :subtitle="
                values[field.key] ??
                (field.optional ? 'اختياري' : 'لا توجد قيمة بعد')
              "
              @click="pick(field.key)"
            >
              <template #append>
                <v-icon
                  v-if="values[field.key]"
                  size="16"
                  icon="mdi-check-circle-outline"
                  color="success"
                />
              </template>
            </v-list-item>
          </template>
          <v-list-item
            v-if="!groups.length"
            title="لا يوجد حقل بهذا الاسم"
            disabled
          />
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.picker-list {
  max-height: 52vh;
  overflow-y: auto;
}
.picker-list :deep(.v-list-item-subtitle) {
  unicode-bidi: plaintext;
}
</style>
