<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  AgreementFollowup,
  AgreementProcedure,
} from "../../types/crm.types";
import * as service from "../../services/contracts.service";
import {
  API_BASE,
  getToken,
  getErrorMessage,
} from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { currentContractDate } from "./contract-form";
const props = defineProps<{
  contractId: number;
  followup: AgreementFollowup;
  isDraft: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{ updated: [AgreementFollowup] }>();
const { can } = usePermissions();
const editing = ref(false),
  active = ref<AgreementProcedure | null>(null),
  busy = ref(false),
  error = ref("");
const form = ref({
  status: "pending" as AgreementProcedure["status"],
  completed_on: "",
  reference: "",
  notes: "",
});
const file = ref<File | null>(null),
  fileName = ref("");
const statusLabel = computed(
  () =>
    ({
      draft: "مسودة اتفاق",
      cancelled: "عقد ملغى — متابعة تاريخية محفوظة",
      issued_unsigned: "نسخة صادرة للطباعة والتوقيع — التوقيع غير مسجل",
      signed: "اتفاق موقع — الإجراءات اللاحقة قيد المتابعة",
      procedures_completed: "الإجراءات المطلوبة مسجلة كمكتملة",
    })[props.followup.status],
);
function open(step: AgreementProcedure) {
  active.value = step;
  form.value = {
    status: step.status,
    completed_on: step.completed_on?.slice(0, 10) ?? "",
    reference: step.reference,
    notes: step.notes,
  };
  file.value = null;
  fileName.value = "";
  error.value = "";
  editing.value = true;
}
async function save() {
  if (!active.value) return;
  busy.value = true;
  error.value = "";
  try {
    emit(
      "updated",
      await service.updateAgreementProcedure(props.contractId, {
        ...form.value,
        step_key: active.value.step_key,
        completed_on:
          form.value.status === "completed"
            ? form.value.completed_on || null
            : null,
        expected_updated_at: active.value.updated_at,
      }),
    );
    editing.value = false;
  } catch (e) {
    error.value = getErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function attach() {
  if (!active.value || !file.value) return;
  busy.value = true;
  error.value = "";
  try {
    const selectedFile = file.value;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(selectedFile);
    });
    emit(
      "updated",
      await service.attachAgreementProcedure(props.contractId, {
        step_key: active.value.step_key,
        name: fileName.value.trim() || selectedFile.name,
        data,
        file_type: selectedFile.type,
      }),
    );
    file.value = null;
    fileName.value = "";
  } catch (e) {
    error.value = getErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
const fileURL = (id: number) =>
  `${API_BASE}/contracts/${props.contractId}/procedures/attachments/${id}?token=${encodeURIComponent(getToken())}`;
</script>
<template>
  <v-expansion-panels class="mb-4"
    ><v-expansion-panel title="متابعة التوقيع والإجراءات اللاحقة"
      ><v-expansion-panel-text>
        <v-alert type="info" variant="tonal" class="mb-3"
          >{{ statusLabel }}. هذا سجل متابعة المكتب وفق المستندات والمراجع
          المدخلة؛ لا ينفذ التطبيق إجراءات الجهات الرسمية.</v-alert
        >
        <v-list>
          <v-list-item
            v-for="step in props.followup.steps"
            :key="step.step_key"
            :title="step.label"
            :subtitle="
              [step.completed_on, step.reference].filter(Boolean).join(' · ')
            "
          >
            <template #prepend
              ><v-icon
                :icon="
                  step.status === 'completed'
                    ? 'mdi-check-circle-outline'
                    : step.status === 'not_applicable'
                      ? 'mdi-minus-circle-outline'
                      : 'mdi-clock-outline'
                "
                :color="step.status === 'completed' ? 'success' : undefined"
                class="me-3"
            /></template>
            <template #append
              ><v-chip size="small" class="me-2">{{
                {
                  pending: "قيد المتابعة",
                  completed: "مكتمل",
                  not_applicable: "غير مطلوب",
                }[step.status]
              }}</v-chip
              ><v-btn
                v-if="can('contracts.manage') && !props.readonly"
                variant="text"
                size="small"
                @click="open(step)"
                >تسجيل الإجراء</v-btn
              ></template
            >
            <v-btn
              v-for="attachment in step.attachments"
              :key="attachment.id"
              size="small"
              variant="text"
              prepend-icon="mdi-paperclip"
              :href="fileURL(attachment.id)"
              target="_blank"
              rel="noopener"
              >{{ attachment.name }}</v-btn
            >
          </v-list-item>
        </v-list>
      </v-expansion-panel-text></v-expansion-panel
    ></v-expansion-panels
  >
  <v-dialog v-model="editing" max-width="650"
    ><v-card
      ><v-card-title>{{ active?.label }}</v-card-title
      ><v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-radio-group
          v-model="form.status"
          label="حالة الإجراء"
          inline
          :disabled="busy"
        >
          <v-radio label="قيد المتابعة" value="pending" />
          <v-radio label="مكتمل" value="completed" />
          <v-radio
            v-if="active?.optional"
            label="غير مطلوب لهذه المعاملة"
            value="not_applicable"
          />
        </v-radio-group>
        <v-text-field
          v-if="form.status === 'completed'"
          v-model="form.completed_on"
          label="تاريخ استكمال الإجراء"
          type="date"
          :max="currentContractDate()"
          :disabled="busy"
          prepend-inner-icon="mdi-calendar-outline"
        />
        <v-text-field v-model="form.reference" label="مرجع المستند أو الجهة" />
        <v-textarea
          v-model="form.notes"
          label="تفاصيل وملاحظات المتابعة"
          rows="2"
        />
        <v-divider class="my-3" /><v-text-field
          v-model="fileName"
          label="اسم المرفق"
        />
        <v-file-input
          v-model="file"
          label="مستند مؤيد — صورة أو PDF حتى ١٠ ميغابايت"
          accept="application/pdf,image/png,image/jpeg,image/webp"
        />
        <v-btn :disabled="!file || busy" variant="tonal" @click="attach"
          >إرفاق المستند</v-btn
        >
        <v-alert v-if="props.isDraft" type="info" variant="tonal" class="mt-3"
          >يمكن حفظ الاتفاق وطباعته وإرفاق المستندات الآن. سجّل اكتمال الإجراءات
          بعد إصدار نسخة الاتفاق.</v-alert
        > </v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn :disabled="busy" @click="editing = false"
          >إلغاء</v-btn
        ><v-btn :loading="busy" color="primary" @click="save"
          >حفظ المتابعة</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
