<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import type {
  FieldValues,
  RenderContext,
  TemplateKey,
} from "@contract-document/index";
import ContractPreview from "./ContractPreview.vue";
import * as agreementsService from "../../services/agreements.service";
import { getErrorMessage } from "../../services/api.service";
import { useConfirm } from "../../composables/useConfirm";
import { useSnackbar } from "../../composables/useSnackbar";
import { TEMPLATE_CHANGE_LABELS } from "../../constants/agreements";
import { formatDateTime } from "../../utils/format";
import type {
  AgreementTemplateRecord,
  AgreementTemplateVersion,
  AgreementTemplateVersionDetail,
} from "../../types";

/**
 * A template's saved versions, resets included. Any of them can be viewed
 * and brought back; bringing one back is itself a new version, so nothing
 * in the history is ever lost.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  templateKey: TemplateKey;
  currentVersion: number;
  dirty?: boolean;
  /** Template-mode values (contract type, office details). */
  values?: FieldValues;
}>();
const emit = defineEmits<{ restored: [AgreementTemplateRecord] }>();
const { openConfirm } = useConfirm();
const { notifyError, notifySuccess } = useSnackbar();

const versions = ref<AgreementTemplateVersion[]>([]);
const loading = ref(false);
const viewing = shallowRef<AgreementTemplateVersionDetail | null>(null);

const ctx = computed<RenderContext>(() => ({
  template: props.templateKey,
  values: props.values ?? {},
  missing: "label",
  logo: null,
  schedule: [],
}));

async function load() {
  loading.value = true;
  try {
    versions.value = await agreementsService.listTemplateVersions(
      props.templateKey,
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function view(version: AgreementTemplateVersion) {
  try {
    viewing.value = await agreementsService.getTemplateVersion(
      props.templateKey,
      version.version,
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

function restore(version: number) {
  openConfirm({
    title: `استرجاع النسخة ${version}`,
    body: props.dirty
      ? "ستضيع التعديلات غير المحفوظة في المحرر، ويصير محتوى هذه النسخة هو القالب الحالي (نسخة جديدة في السجل)."
      : "يصير محتوى هذه النسخة هو القالب الحالي، كنسخة جديدة في السجل. العقود القائمة لا تتأثر.",
    confirmText: "استرجاع",
    color: "warning",
    onConfirm: async () => {
      const record = await agreementsService.restoreTemplateVersion(
        props.templateKey,
        version,
        props.currentVersion,
      );
      emit("restored", record);
      notifySuccess(`استُرجعت النسخة ${version}.`);
      viewing.value = null;
      open.value = false;
    },
  });
}

watch(open, (isOpen) => {
  viewing.value = null;
  if (isOpen) void load();
});
</script>

<template>
  <v-dialog v-model="open" :max-width="viewing ? 1100 : 640" scrollable>
    <v-card>
      <v-card-title
        class="d-flex align-center ga-2 text-subtitle-1 font-weight-bold"
      >
        <v-btn
          v-if="viewing"
          icon="mdi-arrow-right"
          variant="text"
          size="small"
          aria-label="رجوع إلى السجل"
          @click="viewing = null"
        />
        {{ viewing ? `النسخة ${viewing.version}` : "سجل نسخ القالب" }}
      </v-card-title>
      <v-card-text class="history-body">
        <template v-if="viewing">
          <div class="history-preview">
            <ContractPreview
              :document="viewing.definition"
              :ctx="ctx"
              :zoom="0.75"
            />
          </div>
        </template>
        <template v-else>
          <v-progress-linear v-if="loading" indeterminate />
          <p v-if="!loading && !versions.length" class="text-medium-emphasis">
            لم يُعدَّل هذا القالب بعد؛ هو على إعداده الافتراضي.
          </p>
          <v-list v-else density="compact" lines="two">
            <v-list-item
              v-for="version in versions"
              :key="version.version"
              :title="`النسخة ${version.version} — ${TEMPLATE_CHANGE_LABELS[version.change_type] ?? version.change_type}`"
              :subtitle="`${formatDateTime(version.created_at)}${version.created_by_name ? ` · ${version.created_by_name}` : ''}${version.note ? ` · ${version.note}` : ''}`"
            >
              <template #append>
                <v-chip
                  v-if="version.version === currentVersion"
                  size="small"
                  label
                  color="primary"
                  variant="tonal"
                  >الحالية</v-chip
                >
                <v-btn size="small" variant="text" @click="view(version)"
                  >عرض</v-btn
                >
                <v-btn
                  v-if="version.version !== currentVersion"
                  size="small"
                  variant="text"
                  @click="restore(version.version)"
                  >استرجاع</v-btn
                >
              </template>
            </v-list-item>
          </v-list>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn
          v-if="viewing && viewing.version !== currentVersion"
          color="primary"
          variant="tonal"
          @click="restore(viewing.version)"
          >استرجاع هذه النسخة</v-btn
        >
        <v-spacer />
        <v-btn variant="text" @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.history-body {
  max-height: 72vh;
}
.history-preview {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--dal-canvas);
  border-radius: var(--dal-radius-card);
}
</style>
