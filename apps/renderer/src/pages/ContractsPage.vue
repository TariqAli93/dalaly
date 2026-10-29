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
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  type TemplateKey,
} from "@contract-document/index";
import AppPage from "../components/app/AppPage.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import PersonPicker from "../components/people/PersonPicker.vue";
import ReasonDialog from "../components/contracts/ReasonDialog.vue";
import AgreementRevisionsDialog from "../components/contracts/AgreementRevisionsDialog.vue";
import type {
  DataGridApi,
  GridHeader,
  RowAction,
} from "../components/shared/grid";
import * as agreementsService from "../services/agreements.service";
import { getErrorMessage } from "../services/api.service";
import { createPagedList } from "../composables/usePagedList";
import { useConfirm } from "../composables/useConfirm";
import { usePermissions } from "../composables/usePermissions";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import {
  AGREEMENTS_DEFAULT_SORT,
  AGREEMENT_STATUSES,
  AGREEMENT_STATUS_LABELS,
  agreementStatusColor,
} from "../constants/agreements";
import {
  exportContractDocx,
  exportContractPdf,
  exportSourceFor,
  printContract,
} from "../utils/contractExport";
import { formatContractDate } from "@contract-document/index";
import { formatDate } from "../utils/format";
import type {
  AgreementListItem,
  AgreementSortKey,
  AgreementStatus,
} from "../types";

/**
 * Every contract: search by number, party or listing code, filter by status,
 * type or customer (?person=<id> from the customer hub), sort and page on
 * the server. Enter opens the contract; the row menu duplicates, exports,
 * prints, shows revisions, cancels, or deletes a draft never issued.
 */
const route = useRoute();
const router = useRouter();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();
const { setRefreshHandler } = useRefresh();

const q = ref("");
const status = ref<AgreementStatus | null>(null);
const templateKey = ref<TemplateKey | null>(null);
const personId = ref<number | null>(null);
const grid = useTemplateRef<DataGridApi>("grid");
const cancelling = ref<AgreementListItem | null>(null);
const cancelBusy = ref(false);
const revisionsOf = ref<AgreementListItem | null>(null);
const creating = ref(false);

const list = createPagedList<AgreementListItem, AgreementSortKey>(
  (page, signal) =>
    agreementsService.listAgreementsPage(
      {
        q: q.value.trim() || undefined,
        status: status.value ?? undefined,
        template_key: templateKey.value ?? undefined,
        person_id: personId.value ?? undefined,
      },
      page,
      signal,
    ),
  AGREEMENTS_DEFAULT_SORT,
);
const { items, total, loading, error, page, pageSize, sortBy, onTableOptions } =
  list;

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void list.loadFirstPage(), 300);
});
watch([status, templateKey, personId], () => void list.loadFirstPage());

const hasFilters = computed(() =>
  Boolean(
    q.value.trim() || status.value || templateKey.value || personId.value,
  ),
);
function clearFilters() {
  q.value = "";
  status.value = null;
  templateKey.value = null;
  personId.value = null;
}

const TYPE_FILTERS = TEMPLATE_KEYS.map((key) => ({
  title: TEMPLATES[key].title,
  value: key,
}));

const headers: GridHeader[] = [
  { key: "code", title: "العقد", sortable: true },
  { key: "first_party_name", title: "الطرف الأول" },
  { key: "second_party_name", title: "الطرف الثاني" },
  { key: "listing_code", title: "العقار", priority: 2 },
  { key: "contract_date", title: "تاريخ العقد", sortable: true, priority: 3 },
  { key: "status", title: "الحالة", sortable: true },
  { key: "updated_at", title: "آخر تعديل", sortable: true, priority: 2 },
  { key: "actions", title: "", align: "end", width: 96 },
];

function open(item: AgreementListItem) {
  void router.push(`/contracts/${item.id}`);
}

async function exportRow(
  item: AgreementListItem,
  format: "pdf" | "docx" | "print",
) {
  try {
    if (format === "docx") {
      const result = await exportContractDocx(
        item.id,
        item.current_revision &&
          item.status !== "draft" &&
          item.status !== "review"
          ? item.current_revision
          : null,
      );
      if (result.ok && !result.canceled) notifySuccess("حُفظ ملف Word.");
      return;
    }
    const record = await agreementsService.getAgreement(item.id);
    const issued = record.status === "issued" || record.status === "cancelled";
    const revision =
      issued && record.current_revision
        ? await agreementsService.getAgreementRevision(
            record.id,
            record.current_revision,
          )
        : null;
    const source = await exportSourceFor(record, revision);
    const result =
      format === "pdf"
        ? await exportContractPdf(source)
        : await printContract(source);
    if (!result.ok && !result.canceled && result.message)
      notifyError(result.message);
    else if (result.ok && format === "pdf") notifySuccess("حُفظ ملف PDF.");
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

async function duplicate(item: AgreementListItem) {
  try {
    const copy = await agreementsService.duplicateAgreement(item.id);
    notifySuccess(`أُنشئت مسودة جديدة ${copy.code} من ${item.code}.`);
    void router.push(`/contracts/${copy.id}`);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

async function confirmCancel(reason: string) {
  if (!cancelling.value) return;
  cancelBusy.value = true;
  try {
    await agreementsService.cancelAgreement(cancelling.value.id, reason);
    notifySuccess(`أُلغي العقد ${cancelling.value.code}.`);
    cancelling.value = null;
    await list.reload();
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  } finally {
    cancelBusy.value = false;
  }
}

function remove(item: AgreementListItem) {
  openConfirm({
    title: `حذف المسودة ${item.code}`,
    body: "تُحذف هذه المسودة نهائياً. المستندات المرفقة بها تبقى في ملفات الزبائن.",
    confirmText: "حذف المسودة",
    color: "error",
    onConfirm: async () => {
      await agreementsService.deleteAgreement(item.id);
      notifySuccess(`حُذفت المسودة ${item.code}.`);
      await list.reload();
    },
  });
}

function actionsOf(item: AgreementListItem): RowAction[] {
  const actions: RowAction[] = [
    {
      key: "open",
      label: item.status === "draft" ? "فتح المسودة" : "عرض العقد",
      icon: item.status === "draft" ? "mdi-pencil-outline" : "mdi-eye-outline",
      inline: true,
      run: () => open(item),
    },
  ];
  if (can("agreements.export")) {
    actions.push(
      {
        key: "pdf",
        label: "تصدير PDF",
        icon: "mdi-file-pdf-box",
        run: () => void exportRow(item, "pdf"),
      },
      {
        key: "docx",
        label: "تصدير Word",
        icon: "mdi-file-word-box",
        run: () => void exportRow(item, "docx"),
      },
      {
        key: "print",
        label: "طباعة",
        icon: "mdi-printer-outline",
        inline: true,
        run: () => void exportRow(item, "print"),
      },
    );
  }
  if (item.current_revision > 0)
    actions.push({
      key: "revisions",
      label: "سجل المراجعات",
      icon: "mdi-history",
      run: () => (revisionsOf.value = item),
    });
  if (can("agreements.manage"))
    actions.push({
      key: "duplicate",
      label: "نسخ كمسودة جديدة",
      icon: "mdi-content-copy",
      run: () => void duplicate(item),
    });
  if (can("agreements.cancel") && item.status !== "cancelled")
    actions.push({
      key: "cancel",
      label: "إلغاء العقد",
      icon: "mdi-cancel",
      danger: true,
      run: () => (cancelling.value = item),
    });
  if (
    can("agreements.manage") &&
    item.status === "draft" &&
    item.current_revision === 0
  )
    actions.push({
      key: "delete",
      label: "حذف المسودة",
      icon: "mdi-delete-outline",
      danger: true,
      run: () => remove(item),
    });
  return actions;
}

const linkedPerson = Number(route.query.person);
if (Number.isSafeInteger(linkedPerson) && linkedPerson > 0)
  personId.value = linkedPerson;
const linkedStatus = String(route.query.status ?? "");
if (AGREEMENT_STATUSES.some((item) => item.value === linkedStatus))
  status.value = linkedStatus as AgreementStatus;
void list.reload();
onMounted(() => setRefreshHandler(list.reload));
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  list.cancel();
});

async function create(key: TemplateKey) {
  if (creating.value) return;
  creating.value = true;
  try {
    const created = await agreementsService.createAgreement(key);
    await router.replace(`/contracts/${created.id}?step=parties`);
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <AppPage title="العقود" :count="loading && !total ? null : total">
    <template #header-actions>
      <v-btn
        v-if="can('agreements.templates')"
        variant="text"
        prepend-icon="mdi-file-document-edit-outline"
        to="/contracts/templates"
        >القوالب</v-btn
      >

      <!-- to="/contracts/new" -->
      <v-menu location="bottom start">
        <template #activator="{ props }">
          <v-btn
            v-if="can('agreements.manage')"
            v-bind="props"
            color="primary"
            prepend-icon="mdi-plus"
            append-icon="mdi-chevron-down"
            >عقد جديد</v-btn
          >
        </template>
        <v-list density="compact" navigation-strategy="track" nav>
          <v-list-item
            v-for="key in TEMPLATE_KEYS"
            nav
            :key="key"
            :title="TEMPLATES[key].title"
            :subtitle="TEMPLATES[key].description"
            lines="two"
            @click="create(key)"
            :prepend-icon="
              TEMPLATES[key].kind === 'sale'
                ? 'mdi-home-export-outline'
                : 'mdi-key-chain-variant'
            "
          />
        </v-list>
      </v-menu>
    </template>

    <section class="dal-panel dal-listpanel dal-fill" aria-label="العقود">
      <div class="dal-toolbar">
        <div class="dal-toolbar__row dal-toolbar__row--single">
          <v-text-field
            v-model="q"
            class="dal-toolbar__search"
            prepend-inner-icon="mdi-magnify"
            placeholder="رقم العقد، اسم طرف أو هاتفه، رمز العقار"
            aria-label="بحث في العقود"
            hide-details
            clearable
            @keydown.down.prevent="grid?.focusFirstRow()"
          />
          <v-select
            v-model="status"
            :items="AGREEMENT_STATUSES"
            label="الحالة"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <v-select
            v-model="templateKey"
            :items="TYPE_FILTERS"
            label="النوع"
            hide-details
            clearable
            class="dal-toolbar__filter"
          />
          <PersonPicker
            v-model="personId"
            class="dal-toolbar__filter"
            label="الزبون"
            hide-details
            clearable
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
        grid-key="contracts"
        table-label="جدول العقود"
        :items="items"
        :headers="headers"
        :total="total"
        :loading="loading"
        :error="error"
        :has-filters="hasFilters"
        :actions="actionsOf"
        :row-label="(item) => `${item.code} · ${item.title}`"
        :empty="{
          icon: 'mdi-file-sign',
          title: 'لا توجد عقود بعد',
          text: 'أنشئ عقد بيع أو إيجار من أحد القوالب الأربعة، واختر أطرافه وعقاره من سجلات المكتب.',
        }"
        :no-match="{ title: 'لا توجد عقود مطابقة للبحث والفلاتر' }"
        @open="open"
        @retry="list.reload"
        @clear-filters="clearFilters"
        @options="onTableOptions"
      >
        <template #item.code="{ item }">
          <div class="dal-cell-name">
            <strong
              ><bdi>{{ item.code }}</bdi></strong
            >
            <small
              >{{ item.title
              }}<template v-if="item.current_revision > 1">
                · مراجعة {{ item.current_revision }}</template
              ></small
            >
          </div>
        </template>
        <template #item.first_party_name="{ item }">
          <span class="dal-clip">{{ item.first_party_name || "—" }}</span>
        </template>
        <template #item.second_party_name="{ item }">
          <span class="dal-clip">{{ item.second_party_name || "—" }}</span>
        </template>
        <template #item.listing_code="{ item }">
          <span v-if="item.listing_code" class="dal-clip"
            ><bdi>{{ item.listing_code }}</bdi
            >{{ item.listing_name ? ` · ${item.listing_name}` : "" }}</span
          >
          <span v-else>—</span>
        </template>
        <template #item.contract_date="{ item }">
          <bdi>{{ formatContractDate(item.contract_date) ?? "—" }}</bdi>
        </template>
        <template #item.status="{ item }">
          <v-chip
            size="small"
            variant="tonal"
            label
            :color="agreementStatusColor(item.status)"
            >{{
              AGREEMENT_STATUS_LABELS[item.status as AgreementStatus]
            }}</v-chip
          >
        </template>
        <template #item.updated_at="{ item }">
          <bdi>{{ formatDate(item.updated_at) }}</bdi>
        </template>
        <template #empty-actions>
          <v-btn
            v-if="can('agreements.manage')"
            color="primary"
            prepend-icon="mdi-file-plus-outline"
            to="/contracts/new"
            >عقد جديد</v-btn
          >
        </template>
      </DataGrid>
    </section>

    <ReasonDialog
      :model-value="Boolean(cancelling)"
      :title="`إلغاء العقد ${cancelling?.code ?? ''}`"
      body="يبقى العقد وكل مراجعاته محفوظاً للرجوع إليه، ويُطبع بعد الإلغاء مختوماً «ملغى». لا يمكن التراجع عن الإلغاء."
      confirm-text="إلغاء العقد"
      color="error"
      :busy="cancelBusy"
      @update:model-value="!$event && (cancelling = null)"
      @confirm="confirmCancel"
    />
    <AgreementRevisionsDialog
      v-if="revisionsOf"
      :model-value="Boolean(revisionsOf)"
      :agreement-id="revisionsOf.id"
      @update:model-value="!$event && (revisionsOf = null)"
    />
  </AppPage>
</template>
