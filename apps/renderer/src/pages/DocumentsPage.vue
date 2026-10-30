<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import AppPage from "../components/app/AppPage.vue";
import PersonPicker from "../components/people/PersonPicker.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import DocumentDialog from "../components/documents/DocumentDialog.vue";
import DocumentViewer from "../components/documents/DocumentViewer.vue";
import type {
  DataGridApi,
  GridHeader,
  RowAction,
} from "../components/shared/grid";
import * as documentsService from "../services/documents.service";
import { getErrorMessage } from "../services/api.service";
import { usePermissions } from "../composables/usePermissions";
import { useSnackbar } from "../composables/useSnackbar";
import { useRefresh } from "../composables/useRefresh";
import { useNewFromQuery } from "../composables/useNewFromQuery";
import { useConfirm } from "../composables/useConfirm";
import { createPagedList } from "../composables/usePagedList";
import {
  DOCUMENTS_DEFAULT_SORT,
  documentStatusColor,
  documentStatusLabel,
} from "../constants/crm";
import { formatDate } from "../utils/format";
import type {
  DocumentRecord,
  DocumentSortKey,
  DocumentTypeRecord,
} from "../types";

/**
 * مستمسكات الزبائن: قائمة بفلاتر الزبون والنوع والحالة (ومنها المنتهية)،
 * والإضافة في حوار مستقل. Enter يفتح ملف المستمسك، والزبون رابط إلى ملفه.
 * ?person=<id>&new=1 من ملف الزبون يفتح الإضافة والزبون مختار.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();
const { openConfirm } = useConfirm();

const types = ref<DocumentTypeRecord[]>([]);
const personId = ref<number | null>(null);
const typeId = ref<number | null>(null);
const status = ref<"" | "active" | "expired" | "archived">("");
const grid = useTemplateRef<DataGridApi>("grid");
const dialog = ref(false);
const viewing = ref<DocumentRecord | null>(null);
const editing = ref<DocumentRecord | null>(null);

const STATUS_FILTERS = [
  { title: "سارية", value: "active" },
  { title: "منتهية", value: "expired" },
  { title: "مؤرشفة", value: "archived" },
];

// صفحة واحدة من الخادم؛ التصفية والترتيب هناك.
const list = createPagedList<DocumentRecord, DocumentSortKey>(
  (page, signal) =>
    documentsService.listDocumentsPage(
      {
        person_id: personId.value ?? undefined,
        document_type_id: typeId.value ?? undefined,
        status: status.value || undefined,
      },
      page,
      signal,
    ),
  DOCUMENTS_DEFAULT_SORT,
);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;
watch([personId, typeId, status], () => void list.loadFirstPage());
const hasFilters = computed(() =>
  Boolean(personId.value || typeId.value || status.value),
);
function clearFilters() {
  personId.value = null;
  typeId.value = null;
  status.value = "";
}

// مفاتيح الأعمدة القابلة للترتيب هي مفاتيح الترتيب في الخادم.
const headers: GridHeader[] = [
  { key: "document_name", title: "المستمسك", sortable: true },
  { key: "person_name", title: "الزبون", sortable: true },
  { key: "document_type_name", title: "النوع", sortable: true, priority: 3 },
  { key: "document_number", title: "الرقم", sortable: true, priority: 2 },
  { key: "expires_at", title: "ينتهي في", sortable: true },
  { key: "computed_status", title: "الحالة", sortable: true },
  { key: "actions", title: "", align: "end", width: 96 },
];

function openFile(item: DocumentRecord) {
  grid.value?.remember(item.id);
  viewing.value = item;
}
function openCreate() {
  editing.value = null;
  dialog.value = true;
}
function openEdit(item: DocumentRecord) {
  editing.value = item;
  dialog.value = true;
}
function onSaved(saved: DocumentRecord) {
  notifySuccess(`تم حفظ المستمسك «${saved.document_name}».`);
  void list.reload();
}
function setStatus(item: DocumentRecord, next: "active" | "archived") {
  const run = async () => {
    try {
      await documentsService.updateDocument(item.id, {
        document_type_id: item.document_type_id,
        document_name: item.document_name,
        document_number: item.document_number,
        document_side: item.document_side,
        expires_at: item.expires_at,
        notes: item.notes,
        status: next,
      });
      await list.reload();
      notifySuccess(
        next === "archived"
          ? `أُرشف «${item.document_name}». تجده بتصفية «مؤرشفة».`
          : `أُعيد «${item.document_name}» إلى المستمسكات السارية.`,
      );
    } catch (cause) {
      notifyError(getErrorMessage(cause));
    }
  };
  if (next === "active") return void run();
  openConfirm({
    title: `أرشفة ${item.document_name}`,
    body: "يبقى الملف محفوظاً، لكنه يخرج من القائمة الافتراضية ومن متطلبات الزبون.",
    confirmText: "أرشفة",
    color: "warning",
    onConfirm: run,
  });
}

function actionsOf(item: DocumentRecord): RowAction[] {
  const actions: RowAction[] = [
    {
      key: "file",
      label: "فتح الملف",
      icon: "mdi-file-eye-outline",
      inline: true,
      run: () => openFile(item),
    },
  ];
  if (can("people.read"))
    actions.push({
      key: "person",
      label: "فتح ملف الزبون",
      icon: "mdi-account-outline",
      run: () => void router.push(`/clients/${item.person_id}`),
    });
  if (can("documents.manage")) {
    actions.push({
      key: "edit",
      label: "تعديل البيانات",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => openEdit(item),
    });
    actions.push(
      item.status === "archived"
        ? {
            key: "restore",
            label: "إرجاع من الأرشيف",
            icon: "mdi-archive-arrow-up-outline",
            run: () => setStatus(item, "active"),
          }
        : {
            key: "archive",
            label: "أرشفة",
            icon: "mdi-archive-arrow-down-outline",
            run: () => setStatus(item, "archived"),
          },
    );
  }
  return actions;
}

// قبل أن يُظهر الجدول خياراته الأولى، فلا يطلب الصفحة نفسها مرتين.
const linkedPerson = Number(route.query.person);
if (Number.isSafeInteger(linkedPerson) && linkedPerson > 0)
  personId.value = linkedPerson;
void list.reload();
useNewFromQuery(() => {
  if (can("documents.manage")) openCreate();
});
onMounted(async () => {
  setRefreshHandler(list.reload);
  try {
    types.value = await documentsService.listDocumentTypes();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
});
onBeforeUnmount(() => list.cancel());
</script>

<template>
  <AppPage title="المستمسكات" :count="loading && !total ? null : total">
    <template #header-actions>
      <v-btn
        v-if="can('documents.manage')"
        color="primary"
        prepend-icon="mdi-file-upload-outline"
        @click="openCreate"
        >إضافة مستمسك</v-btn
      >
    </template>

    <section class="dal-panel dal-listpanel dal-fill" aria-label="المستمسكات">
      <div class="dal-toolbar">
        <div class="dal-toolbar__row dal-toolbar__row--single">
          <PersonPicker
            v-model="personId"
            class="dal-toolbar__search"
            label="الزبون"
            placeholder="كل الزبائن"
            hide-details
            clearable
          />
          <v-select
            v-model="typeId"
            :items="types"
            item-title="name"
            item-value="id"
            label="النوع"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-select
            :model-value="status || null"
            :items="STATUS_FILTERS"
            label="الحالة"
            hide-details
            clearable
            class="dal-toolbar__filter"
            @update:model-value="status = $event ?? ''"
          />
          <v-btn
            v-if="hasFilters"
            size="small"
            variant="text"
            @click="clearFilters"
            >مسح الفلاتر</v-btn
          >
        </div>
      </div>
      <DataGrid
        ref="grid"
        v-model:page="page"
        v-model:items-per-page="pageSize"
        v-model:sort-by="sortBy"
        grid-key="documents"
        table-label="جدول المستمسكات"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="hasFilters"
        :actions="actionsOf"
        :row-label="
          (item) => `${item.document_name} · ${item.person_name ?? ''}`
        "
        :empty="{
          icon: 'mdi-file-document-outline',
          title: 'لا توجد مستمسكات بعد',
          text: 'ارفع هويات الزبائن وسنداتهم لتجدها هنا وفي ملف كل زبون.',
        }"
        :no-match="{ title: 'لا توجد مستمسكات مطابقة للفلاتر الحالية' }"
        @open="openFile"
        @retry="list.reload"
        @clear-filters="clearFilters"
        @options="onTableOptions"
      >
        <template #item.document_name="{ item }">
          <div class="dal-cell-name">
            <strong :title="item.document_name">{{
              item.document_name
            }}</strong>
            <bdi>{{ item.code }}</bdi>
          </div>
        </template>
        <template #item.person_name="{ item }">
          <router-link
            v-if="can('people.read')"
            :to="`/clients/${item.person_id}`"
            class="record-link dal-clip"
            tabindex="-1"
            >{{ item.person_name || "—" }}</router-link
          >
          <span v-else class="dal-clip">{{ item.person_name || "—" }}</span>
        </template>
        <template #item.document_type_name="{ item }">{{
          item.document_type_name || "—"
        }}</template>
        <template #item.document_number="{ item }">
          <bdi>{{ item.document_number || "—" }}</bdi>
        </template>
        <template #item.expires_at="{ item }">
          <bdi>{{ item.expires_at ? formatDate(item.expires_at) : "—" }}</bdi>
        </template>
        <template #item.computed_status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="documentStatusColor(item.computed_status)"
            >{{ documentStatusLabel(item.computed_status) }}</v-chip
          >
        </template>
        <template #empty-actions>
          <v-btn
            v-if="can('documents.manage')"
            color="primary"
            prepend-icon="mdi-file-upload-outline"
            @click="openCreate"
            >إضافة مستمسك</v-btn
          >
        </template>
      </DataGrid>
    </section>

    <DocumentDialog
      v-model="dialog"
      :document="editing"
      :types="types"
      :person-id="personId"
      @saved="onSaved"
    />
    <DocumentViewer :document="viewing" @close="viewing = null" />
  </AppPage>
</template>
