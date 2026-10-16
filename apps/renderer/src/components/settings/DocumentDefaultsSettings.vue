<script setup lang="ts">
import { ref, computed } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { useSnackbar } from "../../composables/useSnackbar";
import { getErrorMessage } from "../../services/api.service";
import * as formulations from "../../services/formulations.service";
import * as contracts from "../../services/contracts.service";
const { can } = usePermissions(),
  { notifyError, notifySuccess } = useSnackbar();
const action = ref<{
    kind: "sale" | "rental";
    target: "formulation" | "template";
  } | null>(null),
  busy = ref(false);
const canRestoreText = computed(
  () => can("legal_content.manage") || can("legal_content.publish"),
);
async function restore() {
  if (!action.value || busy.value) return;
  busy.value = true;
  try {
    const { kind, target } = action.value;
    if (target === "formulation") await formulations.restore(kind);
    else {
      const templates = await contracts.listTemplates(kind);
      const template = templates.find((t) => t.is_default) ?? templates[0];
      if (!template)
        throw new Error("القالب غير موجود. أعد تشغيل التطبيق لتهيئة القوالب.");
      await contracts.restoreTemplate(template.id);
    }
    action.value = null;
    notifySuccess("تمت استعادة النسخة الأصلية.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <v-card border flat title="الصيغ وقوالب العقود">
    <v-card-text>
      <p class="mb-4">
        استعادة النص أو التصميم الأصلي للبيع والإيجار. تؤثر الاستعادة على العقود
        الجديدة، وتبقى نسخ العقود السابقة محفوظة.
      </p>
      <v-list lines="two" density="compact">
        <v-list-item
          v-for="kind in ['sale', 'rental'] as const"
          :key="kind"
          :title="kind === 'sale' ? 'عقود البيع' : 'عقود الإيجار'"
          subtitle="الصيغة الأساسية وقالب DOCX الأصلي"
        >
          <template #append
            ><div class="d-flex flex-wrap ga-2">
              <v-btn
                v-if="canRestoreText"
                variant="outlined"
                @click="action = { kind, target: 'formulation' }"
                >استعادة الصيغة</v-btn
              ><v-btn
                v-if="can('contract_templates.manage')"
                variant="outlined"
                @click="action = { kind, target: 'template' }"
                >استعادة القالب</v-btn
              >
            </div></template
          >
        </v-list-item>
      </v-list>
      <v-btn
        v-if="can('legal_content.read')"
        variant="text"
        to="/contracts/legal-templates"
        >إدارة الصيغ القانونية</v-btn
      >
      <v-btn
        v-if="can('contract_templates.manage')"
        variant="text"
        to="/contract-templates"
        >إدارة قوالب DOCX</v-btn
      >
    </v-card-text>
    <v-dialog
      :model-value="Boolean(action)"
      max-width="420"
      @update:model-value="!$event && (action = null)"
      ><v-card title="استعادة النسخة الأصلية؟"
        ><v-card-text
          >سيحل الأصل محل النسخة الحالية. تبقى العقود المحفوظة دون
          تغيير.</v-card-text
        ><v-card-actions
          ><v-spacer /><v-btn :disabled="busy" @click="action = null"
            >إلغاء</v-btn
          ><v-btn color="primary" :loading="busy" @click="restore"
            >استعادة</v-btn
          ></v-card-actions
        ></v-card
      ></v-dialog
    >
  </v-card>
</template>
