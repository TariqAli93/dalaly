<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  ContractDocument,
  ContractIssue,
  RenderContext,
} from "@contract-document/index";
import ContractPreview from "./ContractPreview.vue";
import DocumentDialog from "../documents/DocumentDialog.vue";
import DocumentViewer from "../documents/DocumentViewer.vue";
import * as documentsService from "../../services/documents.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import {
  AGREEMENT_STEPS,
  type AgreementStepKey,
} from "../../constants/agreements";
import { formatDate } from "../../utils/format";
import type {
  AgreementRecord,
  DocumentRecord,
  DocumentTypeRecord,
} from "../../types";

/**
 * The last step: what still blocks issuing (each with the step that fixes
 * it), the contract as it prints, and the files attached to it (a signed
 * copy, a deed…) kept in the customers' documents.
 */
const props = defineProps<{
  record: AgreementRecord;
  document: ContractDocument;
  ctx: RenderContext;
  issues: ContractIssue[];
  editable: boolean;
  firstPartyId: number | null;
}>();
const emit = defineEmits<{ go: [AgreementStepKey] }>();
const { can } = usePermissions();
const { notifyError, notifySuccess } = useSnackbar();

const zoom = ref(0.8);
const pages = ref(1);
const attachments = ref<DocumentRecord[]>([]);
const types = ref<DocumentTypeRecord[]>([]);
const dialog = ref(false);
const viewing = ref<DocumentRecord | null>(null);

const stepTitle = (key: string) =>
  AGREEMENT_STEPS.find((step) => step.key === key)?.title ?? key;
const grouped = computed(() => {
  const groups = new Map<string, ContractIssue[]>();
  for (const issue of props.issues) {
    const list = groups.get(issue.step) ?? [];
    list.push(issue);
    groups.set(issue.step, list);
  }
  return [...groups.entries()];
});

async function loadAttachments() {
  if (!can("documents.read")) return;
  try {
    attachments.value = await documentsService.listDocuments({
      agreement_id: props.record.id,
    });
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
async function openAttach() {
  if (!types.value.length) {
    try {
      types.value = await documentsService.listDocumentTypes();
    } catch (error) {
      notifyError(getErrorMessage(error));
    }
  }
  dialog.value = true;
}
function onSaved(saved: DocumentRecord) {
  notifySuccess(`أُرفق «${saved.document_name}» بالعقد وبملف الزبون.`);
  void loadAttachments();
}

onMounted(loadAttachments);
watch(() => props.record.id, loadAttachments);
</script>

<template>
  <div class="review">
    <div class="review__side">
      <section
        v-if="record.status === 'draft' || record.status === 'review'"
        class="dal-panel"
        aria-label="جاهزية الإصدار"
      >
        <header class="dal-panel__header">
          <v-icon
            :icon="
              issues.length
                ? 'mdi-alert-circle-outline'
                : 'mdi-check-circle-outline'
            "
            :color="issues.length ? 'warning' : 'success'"
            size="20"
          />
          <span class="dal-section-title">{{
            issues.length ? `${issues.length} قبل الإصدار` : "جاهز للإصدار"
          }}</span>
        </header>
        <div class="review__issues">
          <p v-if="!issues.length" class="review__muted">
            كل الأطراف والبيانات والحقول المطلوبة مكتملة.
          </p>
          <div
            v-for="[step, list] in grouped"
            :key="step"
            class="review__group"
          >
            <div class="review__group-head">
              <strong>{{ stepTitle(step) }}</strong>
              <v-btn
                size="x-small"
                variant="text"
                @click="emit('go', step as AgreementStepKey)"
                >انتقال</v-btn
              >
            </div>
            <ul>
              <li v-for="(issue, index) in list" :key="index">
                {{ issue.message }}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="dal-panel" aria-label="المستندات المرفقة">
        <header class="dal-panel__header">
          <span class="dal-section-title">المستندات المرفقة</span>
          <v-spacer />
          <v-btn
            v-if="can('documents.manage') && firstPartyId"
            size="small"
            variant="text"
            prepend-icon="mdi-paperclip"
            @click="openAttach"
            >إرفاق</v-btn
          >
        </header>
        <div class="review__docs">
          <p v-if="!can('documents.read')" class="review__muted">
            لا تملك صلاحية عرض المستندات.
          </p>
          <p v-else-if="!attachments.length" class="review__muted">
            أرفق النسخة الموقّعة أو سند العقار أو هويات الأطراف؛ تُحفظ في ملفات
            الزبائن أيضاً.
          </p>
          <v-list v-else density="compact">
            <v-list-item
              v-for="item in attachments"
              :key="item.id"
              :title="item.document_name"
              :subtitle="`${item.person_name ?? ''} · ${formatDate(item.uploaded_at)}`"
              @click="viewing = item"
              prepend-icon="mdi-file-document-outline"
            />
          </v-list>
        </div>
      </section>
    </div>

    <section class="dal-panel review__preview" aria-label="معاينة العقد">
      <header class="dal-panel__header">
        <span class="dal-section-title">
          {{
            ctx.watermark === "مسودة"
              ? "معاينة المسودة"
              : `المراجعة ${record.current_revision}`
          }}
          · {{ pages }}
          {{ pages === 1 ? "صفحة" : "صفحات" }}
        </span>
        <v-spacer />
        <v-btn
          icon="mdi-magnify-minus-outline"
          size="small"
          variant="text"
          aria-label="تصغير"
          @click="zoom = Math.max(0.5, zoom - 0.1)"
        />
        <span class="text-body-2">{{ Math.round(zoom * 100) }}%</span>
        <v-btn
          icon="mdi-magnify-plus-outline"
          size="small"
          variant="text"
          aria-label="تكبير"
          @click="zoom = Math.min(1.6, zoom + 0.1)"
        />
      </header>
      <div class="review__canvas">
        <ContractPreview
          :document="document"
          :ctx="ctx"
          :zoom="zoom"
          @pages="pages = $event"
        />
      </div>
    </section>

    <DocumentDialog
      v-model="dialog"
      :document="null"
      :types="types"
      :person-id="firstPartyId"
      :agreement-id="record.id"
      @saved="onSaved"
    />
    <DocumentViewer :document="viewing" @close="viewing = null" />
  </div>
</template>

<style scoped>
.review {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: var(--dal-gutter);
  min-height: 0;
  height: calc(100dvh - var(--dal-bar-height) - 2 * var(--dal-gutter) - 64px);
}
@media (max-width: 1100px) {
  .review {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }
}
.review__side {
  display: flex;
  flex-direction: column;
  gap: var(--dal-gutter);
  min-height: 0;
  overflow-y: auto;
}
.review__issues,
.review__docs {
  padding: 10px 12px;
}
.review__group + .review__group {
  margin-top: 10px;
}
.review__group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.review__group ul {
  margin: 4px 0 0;
  padding-inline-start: 18px;
  font-size: 13px;
}
.review__muted {
  margin: 0;
  font-size: 13px;
  color: var(--dal-muted);
}
.review__preview {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.review__canvas {
  flex: 1 1 auto;
  overflow: auto;
  padding: 20px;
  background: var(--dal-canvas);
  display: flex;
  flex-direction: column;
  min-height: 420px;
}
</style>
