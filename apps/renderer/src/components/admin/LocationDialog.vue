<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDialogForm } from "./dialogForm";

/**
 * إضافة موقع (محافظة أو منطقة أو حي) وتعديله: الاسم وحالة التفعيل. الحفظ
 * للأب (saveItem)، وحفظ واحد في كل مرة؛ لا يُغلق بـ Esc أثناء الحفظ أو بعد تعديل.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  /** «محافظة»، «منطقة»، «حي». */
  noun: string;
  /** مذكّر («حي») أو مؤنّث، لصيغة «مفعّل/مفعّلة». */
  masculine?: boolean;
  /** ما يُعدَّل؛ null لعنصر جديد. */
  item: { name: string; is_active: boolean } | null;
  /** يرمي عند الفشل فيبقى الحوار مفتوحاً. */
  saveItem: (value: { name: string; is_active: boolean }) => Promise<void>;
}>();

const form = ref({ name: "", is_active: true });
const saving = ref(false);
const openedWith = ref("");
const dirty = computed(
  () => open.value && JSON.stringify(form.value) !== openedWith.value,
);
const titleId = computed(() => `location-dialog-${props.noun}`);

watch(open, (isOpen) => {
  if (!isOpen) return;
  form.value = {
    name: props.item?.name ?? "",
    is_active: props.item?.is_active ?? true,
  };
  openedWith.value = JSON.stringify(form.value);
});

const nameRule = (value: string) =>
  value.trim().length > 0 || `اسم ${props.noun} مطلوب.`;

async function save() {
  if (saving.value || !form.value.name.trim()) return;
  saving.value = true;
  try {
    await props.saveItem({
      name: form.value.name.trim(),
      is_active: form.value.is_active,
    });
    openedWith.value = JSON.stringify(form.value);
    open.value = false;
  } catch {
    // الأب أبلغ بالخطأ؛ يبقى الحوار مفتوحاً بما كُتب.
  } finally {
    saving.value = false;
  }
}

const { onKeydown } = useDialogForm(open, save);
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="460"
    :persistent="dirty || saving"
    :aria-labelledby="titleId"
  >
    <v-card @keydown="onKeydown">
      <v-card-title :id="titleId">{{
        item ? `تعديل ${noun} ${item.name}` : `إضافة ${noun}`
      }}</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="save">
          <v-text-field
            v-model="form.name"
            :label="`اسم ${noun} *`"
            :rules="[nameRule]"
            hide-details="auto"
            autofocus
          />
          <v-switch
            v-model="form.is_active"
            :label="
              masculine
                ? form.is_active
                  ? 'مفعّل'
                  : 'معطّل'
                : form.is_active
                  ? 'مفعّلة'
                  : 'معطّلة'
            "
            color="primary"
            hide-details
          />
          <button type="submit" hidden tabindex="-1" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!form.name.trim()"
          title="حفظ (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          @click="save"
          >حفظ</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
