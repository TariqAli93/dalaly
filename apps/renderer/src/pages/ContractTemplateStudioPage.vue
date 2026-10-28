<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  TEMPLATES,
  deepClone,
  isTemplateKey,
  type ContractDocument,
  type TemplateKey,
} from "@contract-document/index";
import AppPage from "../components/app/AppPage.vue";
import ContractStudio from "../components/contracts/ContractStudio.vue";
import TemplateHistoryDialog from "../components/contracts/TemplateHistoryDialog.vue";
import DraftNotice from "../components/shared/DraftNotice.vue";
import * as agreementsService from "../services/agreements.service";
import { ApiError, getErrorMessage } from "../services/api.service";
import { useSnackbar } from "../composables/useSnackbar";
import { useConfirm } from "../composables/useConfirm";
import { useDirtyForm } from "../composables/useDirtyForm";
import { useSaveShortcut } from "../composables/useSaveShortcut";
import {
  officeLogoDataUrl,
  officeLogoUrl,
  printTemplate,
  templateValues,
} from "../utils/contractExport";
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
  type LocalDraft,
} from "../utils/localDraft";
import { formatDateTime } from "../utils/format";
import type { AgreementTemplateRecord } from "../types";

/**
 * Customising one of the four templates. Saving (Ctrl+S) makes a new
 * version; contracts already created keep the copy they started from, and
 * issued ones their revisions. Unsaved edits are kept locally until saved.
 */
const route = useRoute();
const router = useRouter();
const { notifyError, notifySuccess } = useSnackbar();
const { openConfirm } = useConfirm();

const key = computed<TemplateKey | null>(() =>
  isTemplateKey(route.params.key) ? route.params.key : null,
);
const template = shallowRef<AgreementTemplateRecord | null>(null);
const doc = ref<ContractDocument | null>(null);
const loading = ref(true);
const saving = ref(false);
const conflict = ref(false);
const historyOpen = ref(false);
const localDraft = shallowRef<LocalDraft<ContractDocument> | null>(null);
const studio = useTemplateRef<InstanceType<typeof ContractStudio>>("studio");
const draftKey = () => `template:${key.value}`;

const changes = useDirtyForm(doc, draftKey);
const title = computed(() => (key.value ? TEMPLATES[key.value].title : "قالب"));
const values = computed(() =>
  template.value ? templateValues(template.value) : {},
);

async function load() {
  if (!key.value) {
    void router.replace("/contracts/templates");
    return;
  }
  loading.value = true;
  try {
    const record = await agreementsService.getTemplate(key.value);
    template.value = record;
    doc.value = deepClone(record.definition);
    changes.markLoaded();
    studio.value?.clearHistory();
    conflict.value = false;
    const stored = readLocalDraft<ContractDocument>(draftKey());
    localDraft.value =
      stored &&
      stored.base === record.version &&
      JSON.stringify(stored.data) !== JSON.stringify(record.definition)
        ? stored
        : null;
    if (stored && !localDraft.value) clearLocalDraft(draftKey());
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (
    !key.value ||
    !template.value ||
    !doc.value ||
    saving.value ||
    !changes.isDirty.value
  )
    return;
  saving.value = true;
  try {
    const saved = await agreementsService.saveTemplate(
      key.value,
      template.value.version,
      doc.value,
    );
    template.value = saved;
    changes.markSaved();
    clearLocalDraft(draftKey());
    notifySuccess(
      `حُفظ القالب (النسخة ${saved.version}). يُستخدم للعقود الجديدة فقط.`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "TEMPLATE_CONFLICT")
      conflict.value = true;
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}
useSaveShortcut(() => void save());

// Keep unsaved edits on disk while editing (a crash or power cut).
let stashTimer: ReturnType<typeof setTimeout> | undefined;
watch(doc, (value) => {
  clearTimeout(stashTimer);
  if (!value || !template.value || !changes.isDirty.value) return;
  stashTimer = setTimeout(
    () => writeLocalDraft(draftKey(), template.value!.version, value),
    800,
  );
});

function restoreLocal() {
  if (!localDraft.value) return;
  doc.value = deepClone(localDraft.value.data);
  localDraft.value = null;
}
function discardLocal() {
  clearLocalDraft(draftKey());
  localDraft.value = null;
}

function reset(mode: "design" | "all") {
  if (!key.value || !template.value) return;
  openConfirm({
    title:
      mode === "design"
        ? "استعادة التصميم الافتراضي"
        : "استعادة القالب الأصلي كاملاً",
    body:
      mode === "design"
        ? "يعود التخطيط والخطوط والمسافات والترويسة والتذييل وإعدادات الصفحة إلى الأصل، وتبقى البنود كما عدّلتها. النسخة الحالية تبقى في سجل النسخ، ولا تتأثر العقود القائمة."
        : "يعود القالب كله إلى أصله: التصميم والبنود ومواضع الحقول. النسخة الحالية تبقى في سجل النسخ ويمكن استرجاعها، ولا تتأثر العقود القائمة.",
    confirmText: "استعادة",
    color: "warning",
    onConfirm: async () => {
      const record = await agreementsService.resetTemplate(
        key.value!,
        mode,
        template.value!.version,
      );
      template.value = record;
      doc.value = deepClone(record.definition);
      changes.markSaved();
      clearLocalDraft(draftKey());
      studio.value?.clearHistory();
      notifySuccess("استُعيد القالب. النسخة السابقة في سجل النسخ.");
    },
  });
}

function onRestored(record: AgreementTemplateRecord) {
  template.value = record;
  doc.value = deepClone(record.definition);
  changes.markSaved();
  clearLocalDraft(draftKey());
  studio.value?.clearHistory();
}

async function print() {
  if (!doc.value || !key.value) return;
  const result = await printTemplate(
    doc.value,
    {
      template: key.value,
      values: values.value,
      missing: "label",
      logo: await officeLogoDataUrl(),
      schedule: [],
    },
    title.value,
  );
  if (!result.ok && !result.canceled && result.message)
    notifyError(result.message);
}

onMounted(load);
watch(key, load);
onBeforeUnmount(() => clearTimeout(stashTimer));
</script>

<template>
  <AppPage
    :title="`تصميم ${title}`"
    :parent="{ label: 'قوالب العقود', to: '/contracts/templates' }"
  >
    <template #header-actions>
      <v-btn
        variant="text"
        prepend-icon="mdi-history"
        @click="historyOpen = true"
        >سجل النسخ</v-btn
      >
      <v-menu location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            variant="text"
            prepend-icon="mdi-restore"
            append-icon="mdi-menu-down"
            >استعادة</v-btn
          >
        </template>
        <v-list density="compact">
          <v-list-item
            title="استعادة التصميم الافتراضي"
            subtitle="مع إبقاء البنود المعدّلة"
            @click="reset('design')"
          />
          <v-list-item
            title="استعادة القالب الأصلي كاملاً"
            subtitle="التصميم والبنود ومواضع الحقول"
            @click="reset('all')"
          />
        </v-list>
      </v-menu>
      <v-btn
        color="primary"
        prepend-icon="mdi-content-save-outline"
        :loading="saving"
        :disabled="!changes.isDirty.value"
        @click="save"
        >حفظ القالب</v-btn
      >
    </template>

    <v-alert
      v-if="conflict"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-2"
    >
      عُدّل هذا القالب من مكان آخر بعد فتحه هنا.
      <template #append>
        <v-btn variant="text" size="small" @click="load">إعادة التحميل</v-btn>
      </template>
    </v-alert>
    <DraftNotice
      v-if="localDraft"
      :saved-at="localDraft.savedAt"
      @restore="restoreLocal"
      @discard="discardLocal"
    />

    <v-skeleton-loader v-if="loading && !doc" type="image, article" />
    <ContractStudio
      v-else-if="doc && key && template"
      ref="studio"
      v-model="doc"
      :template="key"
      mode="template"
      :values="values"
      :logo="officeLogoUrl()"
      :schedule="[]"
      :reference="template.factory"
      reference-label="القالب الأصلي"
      fill
      @print="print"
    >
      <template #status>
        <span>
          {{
            changes.isDirty.value
              ? "تعديلات غير محفوظة"
              : template.is_customized
                ? `مخصص · النسخة ${template.version}`
                : "الإعداد الافتراضي"
          }}
        </span>
        <span v-if="!changes.isDirty.value && template.version"
          >· {{ formatDateTime(template.updated_at) }}</span
        >
      </template>
    </ContractStudio>

    <TemplateHistoryDialog
      v-if="key && template"
      v-model="historyOpen"
      :template-key="key"
      :current-version="template.version"
      :dirty="changes.isDirty.value"
      :values="values"
      @restored="onRestored"
    />
  </AppPage>
</template>
