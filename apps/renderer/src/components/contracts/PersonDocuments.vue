<script setup lang="ts">
import { ref, watch } from "vue";
import type {
  DocumentRecord,
  DocumentTypeRecord,
  PersonRecord,
} from "../../types";
import * as documentsService from "../../services/documents.service";
import { getErrorMessage } from "../../services/api.service";

const props = defineProps<{
  person: PersonRecord | null;
  scope: "sale" | "rent";
  modelValue: number[];
}>();
const emit = defineEmits<{ "update:modelValue": [value: number[]] }>();
const documents = ref<DocumentRecord[]>([]);
const required = ref<DocumentTypeRecord[]>([]);
const missing = ref<DocumentTypeRecord[]>([]);
const types = ref<DocumentTypeRecord[]>([]);
const loading = ref(false);
const addOpen = ref(false);
const saving = ref(false);
const error = ref("");
const file = ref<File | null>(null);
const form = ref({
  document_type_id: null as number | null,
  document_name: "",
  document_number: "",
  expires_at: "",
  notes: "",
});

async function load() {
  if (!props.person) {
    documents.value = [];
    required.value = [];
    missing.value = [];
    emit("update:modelValue", []);
    return;
  }
  loading.value = true;
  try {
    const [requirements, documentTypes] = await Promise.all([
      documentsService.requirements(props.person.id, props.scope),
      documentsService.listDocumentTypes(),
    ]);
    documents.value = requirements.uploaded;
    required.value = requirements.required;
    missing.value = requirements.missing;
    types.value = documentTypes;
    emit(
      "update:modelValue",
      documents.value.map((item) => item.id),
    );
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}
function selected(id: number) {
  return props.modelValue.includes(id);
}
function toggle(id: number) {
  const next = selected(id)
    ? props.modelValue.filter((value) => value !== id)
    : [...props.modelValue, id];
  emit("update:modelValue", next);
}
function readFile(value: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(value);
  });
}
async function addDocument() {
  if (!props.person || !file.value || !form.value.document_name.trim()) return;
  saving.value = true;
  error.value = "";
  try {
    await documentsService.addPersonDocument(props.person.id, {
      ...form.value,
      document_number: form.value.document_number || null,
      expires_at: form.value.expires_at || null,
      document_type_id: form.value.document_type_id,
      data: await readFile(file.value),
      file_type: file.value.type || "application/octet-stream",
      original_name: file.value.name,
    });
    addOpen.value = false;
    file.value = null;
    form.value = {
      document_type_id: null,
      document_name: "",
      document_number: "",
      expires_at: "",
      notes: "",
    };
    await load();
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    saving.value = false;
  }
}
watch(() => [props.person?.id, props.scope], load, { immediate: true });
</script>
<template>
  <v-card variant="tonal" class="documents-card">
    <v-card-title class="d-flex align-center"
      ><span>المستمَسكات</span><v-spacer /><v-btn
        size="small"
        variant="text"
        prepend-icon="mdi-plus"
        :disabled="!props.person"
        @click="addOpen = true"
        >إضافة مستمسك</v-btn
      ></v-card-title
    >
    <v-card-text>
      <v-progress-linear v-if="loading" indeterminate class="mb-2" />
      <v-alert v-if="error" type="error" variant="tonal" class="mb-2">{{
        error
      }}</v-alert>
      <div v-if="!props.person" class="text-medium-emphasis">
        اختر الشخص لعرض مستمسكاته.
      </div>
      <div v-else class="documents-list">
        <div
          v-for="item in documents"
          :key="item.id"
          class="document-row"
          :class="{ selected: selected(item.id) }"
          @click="toggle(item.id)"
        >
          <v-checkbox-btn
            :model-value="selected(item.id)"
            color="primary"
            @click.stop="toggle(item.id)"
          />
          <div>
            <div class="font-weight-medium">
              {{ item.document_type_name || item.document_name }}
            </div>
            <div class="text-caption text-medium-emphasis">
              {{ item.document_number || "بدون رقم"
              }}<span v-if="item.computed_status === 'expired'"> · منتهي</span>
            </div>
          </div>
          <v-chip
            v-if="item.computed_status === 'expired'"
            color="error"
            size="small"
            >منتهي</v-chip
          ><v-chip v-else color="success" size="small">موجود</v-chip>
        </div>
        <div v-if="!documents.length" class="text-medium-emphasis py-2">
          لا توجد مستمسكات محفوظة لهذا الشخص.
        </div>
        <v-alert
          v-for="item in missing"
          :key="item.id"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2"
          >{{ item.name }} غير موجود</v-alert
        >
        <div
          v-if="required.length && !missing.length"
          class="text-success text-caption mt-2"
        >
          اكتملت المستمسكات المطلوبة.
        </div>
      </div>
    </v-card-text>
    <v-dialog v-model="addOpen" max-width="600">
      <v-card
        ><v-card-title>إضافة مستمسك</v-card-title
        ><v-card-text class="form-grid">
          <v-select
            v-model="form.document_type_id"
            :items="types"
            item-title="name"
            item-value="id"
            label="نوع المستمسك"
          />
          <v-text-field v-model="form.document_name" label="اسم المستمسك" />
          <v-text-field v-model="form.document_number" label="رقم المستمسك" />
          <v-text-field
            v-model="form.expires_at"
            type="date"
            label="تاريخ الانتهاء"
          />
          <v-file-input
            v-model="file"
            label="ملف أو صورة المستمسك"
            accept="image/*,.pdf,.doc,.docx"
            class="grid-span"
          />
          <v-alert
            v-if="error"
            type="error"
            variant="tonal"
            class="grid-span"
            >{{ error }}</v-alert
          > </v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn @click="addOpen = false">إلغاء</v-btn
          ><v-btn color="primary" :loading="saving" @click="addDocument"
            >حفظ المستمسك</v-btn
          ></v-card-actions
        ></v-card
      >
    </v-dialog>
  </v-card>
</template>
<style scoped>
.documents-card {
  height: 100%;
}
.documents-list {
  display: grid;
  gap: 6px;
}
.document-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}
.document-row.selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}
.document-row .v-chip {
  margin-inline-start: auto;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.grid-span {
  grid-column: 1 / -1;
}
</style>
