<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import * as peopleService from "../services/people.service";
import * as documentsService from "../services/documents.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { createPagedList } from "../composables/usePagedList";
import { DOCUMENTS_DEFAULT_SORT } from "../constants/crm";
import { LIST_PAGE_SIZES } from "../constants/domain";
import { readFileAsDataUrl } from "../utils/files";
import type {
  DocumentRecord,
  DocumentSortKey,
  DocumentTypeRecord,
  PersonRecord,
} from "../types";

const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const people = ref<PersonRecord[]>([]);
const types = ref<DocumentTypeRecord[]>([]);
const personId = ref<number | null>(null);
const file = ref<File | null>(null);
const saving = ref(false);
const form = ref({
  document_type_id: null as number | null,
  document_name: "",
  document_number: "",
  expires_at: "",
  notes: "",
});
// مفاتيح الأعمدة القابلة للترتيب هي مفاتيح الترتيب في الخادم.
const headers = [
  { title: "الشخص", key: "person_name" },
  { title: "النوع", key: "document_type_name" },
  { title: "الرقم", key: "document_number" },
  { title: "الحالة", key: "computed_status" },
  { title: "", key: "actions", sortable: false },
];
// صفحة واحدة من الخادم؛ التصفية بالشخص والترتيب هناك.
const list = createPagedList<DocumentRecord, DocumentSortKey>(
  (page, signal) =>
    documentsService.listDocumentsPage(
      personId.value ? { person_id: personId.value } : {},
      page,
      signal,
    ),
  DOCUMENTS_DEFAULT_SORT,
);
const {
  items: rows,
  total,
  loading,
  page,
  pageSize,
  sortBy,
  onTableOptions,
} = list;
async function add() {
  if (!personId.value || !file.value || !form.value.document_name.trim())
    return;
  saving.value = true;
  try {
    await documentsService.uploadDocument({
      ...form.value,
      person_id: personId.value,
      data: await readFileAsDataUrl(file.value),
      file_type: file.value.type || "application/octet-stream",
      original_name: file.value.name,
      expires_at: form.value.expires_at || null,
    });
    notifySuccess("تم حفظ المستمسك.");
    form.value = {
      document_type_id: null,
      document_name: "",
      document_number: "",
      expires_at: "",
      notes: "",
    };
    file.value = null;
    await list.reload();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    saving.value = false;
  }
}
function openFile(id: number) {
  window.open(documentsService.fileUrl(id), "_blank");
}
watch(personId, () => list.loadFirstPage());
// القائمة لا تنتظر قائمتي الأشخاص والأنواع، ويبدأ طلبها قبل أن يُظهر الجدول
// خياراته الأولى فلا يُطلب مرتين.
void list.reload();
onMounted(async () => {
  try {
    [people.value, types.value] = await Promise.all([
      peopleService.listPeople(),
      documentsService.listDocumentTypes(),
    ]);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
});
onBeforeUnmount(() => list.cancel());
</script>
<template>
  <AppLayout
    title="مستمَسكات الأشخاص"
    subtitle="أدر ملفات الهوية والمستمسكات المرتبطة بالأشخاص."
  >
    <v-card variant="flat" border class="mb-3"
      ><v-card-text class="toolbar"
        ><v-autocomplete
          v-model="personId"
          :items="people"
          item-title="full_name"
          item-value="id"
          label="تصفية حسب الشخص"
          clearable
        /><v-file-input
          v-model="file"
          label="ملف المستمسك"
          accept="image/*,.pdf,.doc,.docx"
        /><v-text-field
          v-model="form.document_name"
          label="اسم المستمسك"
        /><v-text-field
          v-model="form.document_number"
          label="رقم المستمسك"
        /><v-select
          v-model="form.document_type_id"
          :items="types"
          item-title="name"
          item-value="id"
          label="النوع"
        /><v-btn
          v-if="can('documents.manage')"
          color="primary"
          :loading="saving"
          :disabled="!personId || !file || !form.document_name"
          @click="add"
          >إضافة</v-btn
        ></v-card-text
      ></v-card
    >
    <v-card variant="flat" border
      ><v-data-table-server
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        :headers="headers"
        :items="rows"
        :items-length="total"
        :items-per-page-options="LIST_PAGE_SIZES"
        :loading="loading"
        item-value="id"
        @update:options="onTableOptions"
        ><template #item.computed_status="{ item }"
          ><v-chip
            size="small"
            :color="item.computed_status === 'expired' ? 'error' : 'success'"
            variant="tonal"
            >{{
              item.computed_status === "expired" ? "منتهي" : "موجود"
            }}</v-chip
          ></template
        ><template #item.actions="{ item }"
          ><v-btn
            icon="mdi-open-in-new"
            variant="text"
            @click="openFile(item.id)" /></template></v-data-table-server
    ></v-card>
  </AppLayout>
</template>
<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
}
@media (max-width: 1000px) {
  .toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
