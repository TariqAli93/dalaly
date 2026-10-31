<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { scheduleFor, type RenderContext } from "@contract-document/index";
import ContractPreview from "./ContractPreview.vue";
import * as agreementsService from "../../services/agreements.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { EXPORT_FORMAT_LABELS } from "../../constants/agreements";
import {
  exportContractDocx,
  exportContractPdf,
  exportSourceFor,
  printContract,
} from "../../utils/contractExport";
import { formatDateTime } from "../../utils/format";
import type { AgreementRecord, AgreementRevisionRecord } from "../../types";

/**
 * Every issued revision of a contract, each exactly as it was issued, with
 * its export history. A revision can be viewed, exported or printed again.
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ agreementId: number }>();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();

const record = shallowRef<AgreementRecord | null>(null);
const viewing = shallowRef<AgreementRevisionRecord | null>(null);
const busy = ref(false);

async function load() {
  try {
    record.value = await agreementsService.getAgreement(props.agreementId);
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

async function view(revision: number) {
  try {
    viewing.value = await agreementsService.getAgreementRevision(
      props.agreementId,
      revision,
    );
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}

const ctx = computed<RenderContext | null>(() =>
  viewing.value && record.value
    ? {
        template: viewing.value.template_key,
        values: viewing.value.values,
        missing: "blank",
        logo: viewing.value.logo,
        schedule: scheduleFor(viewing.value.template_key, viewing.value.terms),
        watermark: record.value.status === "cancelled" ? "ملغى" : null,
      }
    : null,
);

async function run(format: "pdf" | "docx" | "print", revision: number) {
  if (!record.value || busy.value) return;
  busy.value = true;
  try {
    if (format === "docx") {
      const result = await exportContractDocx(record.value.id, revision);
      if (result.ok && !result.canceled) notifySuccess("حُفظ ملف Word.");
    } else {
      const stored =
        viewing.value?.revision === revision
          ? viewing.value
          : await agreementsService.getAgreementRevision(
              record.value.id,
              revision,
            );
      const source = await exportSourceFor(record.value, stored);
      const result =
        format === "pdf"
          ? await exportContractPdf(source)
          : await printContract(source);
      if (!result.ok && !result.canceled && result.message)
        notifyError(result.message);
    }
    await load();
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}

watch(
  open,
  (isOpen) => {
    viewing.value = null;
    if (isOpen) void load();
  },
  { immediate: true },
);
</script>

<template>
  <v-dialog v-model="open" :max-width="viewing ? 1100 : 680" scrollable>
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
        <template v-if="viewing"
          >{{ record?.code }} — المراجعة {{ viewing.revision }}</template
        >
        <template v-else>سجل مراجعات {{ record?.code ?? "" }}</template>
      </v-card-title>
      <v-card-text class="revisions-body">
        <div v-if="viewing && ctx" class="revisions-preview">
          <ContractPreview
            :document="viewing.document"
            :ctx="ctx"
            :zoom="0.75"
          />
        </div>
        <template v-else-if="record">
          <p v-if="!record.revisions.length" class="text-medium-emphasis">
            لم يصدر هذا العقد بعد.
          </p>
          <v-list v-else density="compact" lines="two">
            <v-list-item
              v-for="revision in record.revisions"
              :key="revision.revision"
              :title="`المراجعة ${revision.revision}${revision.revision === record.current_revision ? ' (الأحدث)' : ''}`"
              :subtitle="`صدرت ${formatDateTime(revision.issued_at)}${revision.issued_by_name ? ` · ${revision.issued_by_name}` : ''}${revision.reason ? ` · السبب: ${revision.reason}` : ''}`"
            >
              <template #append>
                <v-btn
                  size="small"
                  variant="text"
                  @click="view(revision.revision)"
                  >عرض</v-btn
                >
                <v-menu v-if="can('agreements.export')" location="bottom end">
                  <template #activator="{ props: menu }">
                    <v-btn
                      v-bind="menu"
                      size="small"
                      variant="text"
                      :loading="busy"
                      append-icon="mdi-menu-down"
                      >تصدير</v-btn
                    >
                  </template>
                  <v-list density="compact">
                    <v-list-item
                      prepend-icon="mdi-file-pdf-box"
                      title="PDF"
                      @click="run('pdf', revision.revision)"
                    />
                    <v-list-item
                      prepend-icon="mdi-file-word-box"
                      title="Word"
                      @click="run('docx', revision.revision)"
                    />
                    <v-list-item
                      prepend-icon="mdi-printer-outline"
                      title="طباعة"
                      @click="run('print', revision.revision)"
                    />
                  </v-list>
                </v-menu>
              </template>
            </v-list-item>
          </v-list>
          <template v-if="record.exports.length">
            <div class="revisions-section">آخر عمليات التصدير والطباعة</div>
            <v-table density="compact">
              <tbody>
                <tr v-for="item in record.exports" :key="item.id">
                  <td>{{ EXPORT_FORMAT_LABELS[item.format] }}</td>
                  <td>
                    {{ item.revision ? `المراجعة ${item.revision}` : "مسودة" }}
                  </td>
                  <td class="text-medium-emphasis">
                    <bdi>{{ item.file_name ?? "—" }}</bdi>
                  </td>
                  <td>
                    <bdi dir="rtl">{{ formatDateTime(item.created_at) }}</bdi>
                  </td>
                  <td>{{ item.created_by_name ?? "" }}</td>
                </tr>
              </tbody>
            </v-table>
          </template>
        </template>
        <v-progress-linear v-else indeterminate />
      </v-card-text>
      <v-card-actions>
        <template v-if="viewing && can('agreements.export')">
          <v-btn
            variant="tonal"
            prepend-icon="mdi-file-pdf-box"
            :loading="busy"
            @click="run('pdf', viewing.revision)"
            >PDF</v-btn
          >
          <v-btn
            variant="text"
            prepend-icon="mdi-file-word-box"
            :loading="busy"
            @click="run('docx', viewing.revision)"
            >Word</v-btn
          >
          <v-btn
            variant="text"
            prepend-icon="mdi-printer-outline"
            :loading="busy"
            @click="run('print', viewing.revision)"
            >طباعة</v-btn
          >
        </template>
        <v-spacer />
        <v-btn variant="text" @click="open = false">إغلاق</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.revisions-body {
  max-height: 74vh;
}
.revisions-preview {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--dal-canvas);
  border-radius: var(--dal-radius-card);
}
.revisions-section {
  margin: 16px 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--dal-muted);
}
</style>
