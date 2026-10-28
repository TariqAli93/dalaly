<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";
import type { RenderContext, TemplateKey } from "@contract-document/index";
import AppPage from "../components/app/AppPage.vue";
import DataGrid from "../components/shared/DataGrid.vue";
import ContractPreview from "../components/contracts/ContractPreview.vue";
import TemplateHistoryDialog from "../components/contracts/TemplateHistoryDialog.vue";
import type { GridHeader, RowAction } from "../components/shared/grid";
import * as agreementsService from "../services/agreements.service";
import { getErrorMessage } from "../services/api.service";
import { useConfirm } from "../composables/useConfirm";
import { useRefresh } from "../composables/useRefresh";
import { useSnackbar } from "../composables/useSnackbar";
import { officeLogoUrl, templateValues } from "../utils/contractExport";
import { formatDateTime } from "../utils/format";
import type {
  AgreementTemplateRecord,
  AgreementTemplateSummary,
} from "../types";

/**
 * The four built-in contract templates. Each can be customised, previewed and
 * restored (its design only, or entirely); there is no way to add or delete a
 * template. Changes apply to contracts created afterwards.
 */
const router = useRouter();
const { openConfirm } = useConfirm();
const { notifyError, notifySuccess } = useSnackbar();
const { setRefreshHandler } = useRefresh();

type Row = AgreementTemplateSummary & { id: number };
const rows = ref<Row[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const preview = shallowRef<AgreementTemplateRecord | null>(null);
const historyKey = ref<TemplateKey | null>(null);
const historyVersion = computed(
  () => rows.value.find((row) => row.key === historyKey.value)?.version ?? 0,
);
const historyOpen = computed({
  get: () => historyKey.value !== null,
  set: (value) => {
    if (!value) historyKey.value = null;
  },
});

async function load() {
  loading.value = true;
  try {
    const list = await agreementsService.listTemplates();
    rows.value = list.map((template, index) => ({
      ...template,
      id: index + 1,
    }));
    error.value = null;
  } catch (cause) {
    error.value = getErrorMessage(cause);
  } finally {
    loading.value = false;
  }
}

const headers: GridHeader[] = [
  { key: "title", title: "القالب" },
  { key: "category", title: "التصنيف", priority: 3 },
  { key: "is_customized", title: "الحالة" },
  { key: "updated_at", title: "آخر تعديل", priority: 2 },
  { key: "actions", title: "", align: "end", width: 128 },
];

const previewCtx = computed<RenderContext | null>(() =>
  preview.value
    ? {
        template: preview.value.key,
        values: templateValues(preview.value),
        missing: "label",
        logo: officeLogoUrl(),
        schedule: [],
      }
    : null,
);

function edit(row: Row) {
  void router.push(`/contracts/templates/${row.key}`);
}
async function showPreview(row: Row) {
  try {
    preview.value = await agreementsService.getTemplate(row.key, row.version);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}
function reset(row: Row, mode: "design" | "all") {
  openConfirm({
    title: `${mode === "design" ? "استعادة تصميم" : "استعادة"} ${row.title}`,
    body:
      mode === "design"
        ? "يعود التخطيط والخطوط والمسافات والترويسة والتذييل وإعدادات الصفحة إلى الأصل، وتبقى البنود المعدّلة. النسخة الحالية تبقى في سجل النسخ."
        : "يعود القالب كله إلى أصله، بما فيه البنود. النسخة الحالية تبقى في سجل النسخ ويمكن استرجاعها. العقود القائمة لا تتأثر.",
    confirmText: "استعادة",
    color: "warning",
    onConfirm: async () => {
      await agreementsService.resetTemplate(row.key, mode, row.version);
      notifySuccess(`استُعيد ${row.title}.`);
      await load();
    },
  });
}

function actionsOf(row: Row): RowAction[] {
  return [
    {
      key: "edit",
      label: "تعديل التصميم",
      icon: "mdi-pencil-ruler",
      inline: true,
      run: () => edit(row),
    },
    {
      key: "preview",
      label: "معاينة",
      icon: "mdi-eye-outline",
      inline: true,
      run: () => void showPreview(row),
    },
    {
      key: "history",
      label: "سجل النسخ",
      icon: "mdi-history",
      run: () => (historyKey.value = row.key),
    },
    {
      key: "design",
      label: "استعادة التصميم الافتراضي",
      icon: "mdi-palette-swatch-outline",
      run: () => reset(row, "design"),
    },
    {
      key: "reset",
      label: "استعادة القالب الأصلي كاملاً",
      icon: "mdi-restore",
      danger: true,
      run: () => reset(row, "all"),
    },
  ];
}

onMounted(() => {
  void load();
  setRefreshHandler(load);
});
</script>

<template>
  <AppPage title="قوالب العقود" :parent="{ label: 'العقود', to: '/contracts' }">
    <p class="dal-page-note">
      أربعة قوالب ثابتة لا يُضاف إليها ولا يُحذف منها. تعديل قالب يسري على
      العقود الجديدة فقط، ولا يغيّر عقداً قائماً أو صادراً. نصوص البنود
      الافتراضية صياغة أولية قابلة للتعديل، يُستحسن أن يراجعها مختص قانوني.
    </p>
    <section class="dal-panel dal-listpanel" aria-label="قوالب العقود">
      <DataGrid
        grid-key="contract-templates"
        table-label="جدول قوالب العقود"
        :items="rows"
        :headers="headers"
        :loading="loading"
        :error="error"
        :actions="actionsOf"
        :row-label="(row) => row.title"
        :empty="{ icon: 'mdi-file-document-outline', title: 'لا توجد قوالب' }"
        compact
        @open="edit"
        @retry="load"
      >
        <template #item.title="{ item }">
          <div class="dal-cell-name">
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </div>
        </template>
        <template #item.is_customized="{ item }">
          <v-chip
            size="small"
            label
            variant="tonal"
            :color="item.is_customized ? 'primary' : undefined"
          >
            {{
              item.is_customized
                ? `مخصص · النسخة ${item.version}`
                : "الإعداد الافتراضي"
            }}
          </v-chip>
        </template>
        <template #item.updated_at="{ item }">
          <bdi>{{ item.version ? formatDateTime(item.updated_at) : "—" }}</bdi>
          <small v-if="item.updated_by_name" class="text-medium-emphasis">
            · {{ item.updated_by_name }}</small
          >
        </template>
      </DataGrid>
    </section>

    <v-dialog
      :model-value="Boolean(preview)"
      max-width="1000"
      scrollable
      @update:model-value="!$event && (preview = null)"
    >
      <v-card v-if="preview && previewCtx">
        <v-card-title
          class="d-flex align-center text-subtitle-1 font-weight-bold"
        >
          معاينة {{ preview.title }}
          <v-spacer />
          <v-btn
            variant="text"
            prepend-icon="mdi-pencil-ruler"
            @click="router.push(`/contracts/templates/${preview.key}`)"
            >تعديل التصميم</v-btn
          >
        </v-card-title>
        <v-card-text class="templates-preview">
          <ContractPreview
            :document="preview.definition"
            :ctx="previewCtx"
            :zoom="0.8"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="preview = null">إغلاق</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <TemplateHistoryDialog
      v-if="historyKey"
      v-model="historyOpen"
      :template-key="historyKey"
      :current-version="historyVersion"
      @restored="load"
    />
  </AppPage>
</template>

<style scoped>
.templates-preview {
  display: flex;
  flex-direction: column;
  max-height: 75vh;
  padding: 16px;
  background: var(--dal-canvas);
}
</style>
