<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import * as documentsService from "../../services/documents.service";
import { useApiFormErrors } from "../../composables/useApiFormErrors";
import { useSnackbar } from "../../composables/useSnackbar";
import { readFileAsDataUrl } from "../../utils/files";
import type { DocumentRecord, DocumentTypeRecord } from "../../types";
import FormSection from "../shared/FormSection.vue";
import PersonPicker from "../people/PersonPicker.vue";

/**
 * إضافة مستمسك لزبون أو تعديل بياناته في حوار نموذج، بدل صف التصفية الذي كان
 * يعمل نموذجَ رفع في الوقت نفسه. الملف يُرفع عند الإضافة وحدها؛ التعديل يغيّر
 * البيانات لا الملف. لا يُغلق بـ Esc أو بالنقر خارجه بعد أي تعديل.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  document: DocumentRecord | null;
  types: DocumentTypeRecord[];
  personId?: number | null;
  /** A new file is attached to this contract (a signed copy, a deed…). */
  agreementId?: number | null;
}>();
const emit = defineEmits<{ saved: [DocumentRecord] }>();

const { notifyError } = useSnackbar();
const apiErrors = useApiFormErrors();
const saving = ref(false);
const file = ref<File | null>(null);
const form = ref(emptyForm());
const formRef = ref<{
  validate: () => Promise<{
    valid: boolean;
    errors: { id: string | number }[];
  }>;
} | null>(null);

function emptyForm() {
  return {
    person_id: null as number | null,
    document_type_id: null as number | null,
    document_name: "",
    document_number: "",
    document_side: "unspecified" as NonNullable<
      DocumentRecord["document_side"]
    >,
    expires_at: "",
    notes: "",
  };
}
const SIDES = [
  { title: "غير محدد", value: "unspecified" },
  { title: "الوجه", value: "front" },
  { title: "الظهر", value: "back" },
  { title: "الوجهان", value: "both" },
];
const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VTextarea: { hideDetails: "auto" },
  VFileInput: { hideDetails: "auto" },
  VAutocomplete: { hideDetails: "auto" },
};
const required = (value: unknown) =>
  (value !== null && value !== undefined && String(value).trim() !== "") ||
  "هذا الحقل مطلوب";
const fileRequired = () => Boolean(file.value) || "اختر ملف المستمسك";

const editing = computed(() => props.document);
const openedWith = ref("");
const snapshot = () => JSON.stringify([form.value, file.value?.name ?? null]);
const dirty = computed(() => open.value && snapshot() !== openedWith.value);
let opener: HTMLElement | null = null;

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  apiErrors.clear();
  file.value = null;
  const d = props.document;
  form.value = d
    ? {
        person_id: d.person_id,
        document_type_id: d.document_type_id,
        document_name: d.document_name,
        document_number: d.document_number ?? "",
        document_side: (d.document_side ?? "unspecified") as NonNullable<
          DocumentRecord["document_side"]
        >,
        expires_at: d.expires_at ? d.expires_at.slice(0, 10) : "",
        notes: d.notes ?? "",
      }
    : { ...emptyForm(), person_id: props.personId ?? null };
  openedWith.value = snapshot();
});

// نوع المستمسك يقترح اسمه إن كان الاسم فارغاً.
watch(
  () => form.value.document_type_id,
  (id) => {
    if (form.value.document_name.trim()) return;
    const type = props.types.find((item) => item.id === id);
    if (type) form.value.document_name = type.name;
  },
);

function focusField(id?: string | number) {
  if (id === undefined) return;
  (
    document.querySelector<HTMLElement>(`.document-form [name="${id}"]`) ??
    document.getElementById(String(id))
  )?.focus();
}

async function save() {
  if (saving.value) return;
  apiErrors.clear();
  const result = await formRef.value?.validate();
  if (result && !result.valid) {
    focusField(result.errors[0]?.id);
    return;
  }
  saving.value = true;
  const fields = {
    document_type_id: form.value.document_type_id,
    document_name: form.value.document_name.trim(),
    document_number: form.value.document_number || null,
    document_side: form.value.document_side,
    expires_at: form.value.expires_at || null,
    notes: form.value.notes || null,
  };
  try {
    const saved = editing.value
      ? await documentsService.updateDocument(editing.value.id, {
          ...fields,
          status: editing.value.status === "archived" ? "archived" : "active",
        })
      : await documentsService.uploadDocument({
          ...fields,
          person_id: form.value.person_id,
          agreement_id: props.agreementId ?? null,
          data: await readFileAsDataUrl(file.value!),
          file_type: file.value!.type || "application/octet-stream",
          original_name: file.value!.name,
        });
    openedWith.value = snapshot();
    open.value = false;
    emit("saved", saved);
  } catch (cause) {
    const general = apiErrors.apply(cause);
    if (general) notifyError(general);
    const first = apiErrors.fields()[0];
    if (first) void nextTick(() => focusField(first));
  } finally {
    saving.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  event.preventDefault();
  void save();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="680"
    scrollable
    :persistent="dirty || saving"
    aria-labelledby="document-dialog-title"
  >
    <v-card @keydown="onKeydown">
      <v-card-title id="document-dialog-title">{{
        editing ? `تعديل ${editing.document_name}` : "إضافة مستمسك"
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-form ref="formRef" class="document-form" @submit.prevent="save">
          <v-defaults-provider :defaults="FIELD_DEFAULTS">
            <p class="dal-form__hint">الحقول المعلّمة بـ * مطلوبة.</p>
            <FormSection title="المستمسك" :columns="2">
              <PersonPicker
                v-model="form.person_id"
                name="person_id"
                class="form-section__wide"
                label="الزبون *"
                placeholder="ابحث بالاسم أو الهاتف"
                :rules="[required]"
                :error-messages="apiErrors.messages('person_id')"
                :disabled="Boolean(editing)"
              />
              <v-select
                v-model="form.document_type_id"
                name="document_type_id"
                :items="types.filter((type) => type.is_active)"
                item-title="name"
                item-value="id"
                label="النوع"
                clearable
              />
              <v-text-field
                v-model="form.document_name"
                name="document_name"
                label="اسم المستمسك *"
                :rules="[required]"
                :error-messages="apiErrors.messages('document_name')"
              />
              <v-text-field
                v-model="form.document_number"
                name="document_number"
                label="رقم المستمسك"
                :error-messages="apiErrors.messages('document_number')"
              />
              <v-select
                v-model="form.document_side"
                name="document_side"
                :items="SIDES"
                label="الوجه المصوَّر"
              />
              <v-text-field
                v-model="form.expires_at"
                name="expires_at"
                type="date"
                label="تاريخ الانتهاء"
                :error-messages="apiErrors.messages('expires_at')"
              />
              <v-file-input
                v-if="!editing"
                v-model="file"
                name="file"
                label="ملف المستمسك *"
                accept="image/*,.pdf,.doc,.docx"
                :rules="[fileRequired]"
                :error-messages="apiErrors.messages('data')"
              />
              <v-textarea
                v-model="form.notes"
                name="notes"
                class="form-section__wide"
                label="ملاحظات"
                rows="2"
                auto-grow
              />
            </FormSection>
          </v-defaults-provider>
          <button type="submit" hidden tabindex="-1" />
        </v-form>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          prepend-icon="mdi-content-save-outline"
          title="حفظ (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          @click="save"
          >{{ editing ? "حفظ" : "رفع وحفظ" }}</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
