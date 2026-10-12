<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppLayout from "../layouts/AppLayout.vue";
import ContractWizard from "../components/contracts/ContractWizard.vue";
import { useSnackbar } from "../composables/useSnackbar";
import type { ContractBundle } from "../types";
const route = useRoute();
const router = useRouter();
const { notifySuccess } = useSnackbar();
const finished = ref(false);
const editing = computed(() => route.name === "contract-edit");
const contractId = computed(() =>
  editing.value ? Number(route.params.id) : null,
);
const validId = computed(
  () =>
    !editing.value ||
    (Number.isSafeInteger(contractId.value) && Number(contractId.value) > 0),
);
function cancel() {
  if (!finished.value) void router.push("/contracts");
}
function saved(bundle: ContractBundle) {
  finished.value = true;
  notifySuccess(
    bundle.contract.status === "draft"
      ? "تم حفظ مسودة العقد."
      : "تم إصدار العقد وحفظ نسخته التاريخية.",
  );
  void router.push(`/contracts/${bundle.contract.id}/review`);
}
</script>
<template>
  <AppLayout
    :title="editing ? 'تعديل عقد مسودة' : 'إنشاء عقد جديد'"
    subtitle="بيانات العقد والعقار والأطراف والمستمسكات في صفحة واحدة مع حفظ تلقائي."
  >
    <template #header-actions
      ><v-btn variant="text" prepend-icon="mdi-arrow-right" @click="cancel"
        >العودة للعقود</v-btn
      ></template
    >
    <v-breadcrumbs
      :items="[
        { title: 'لوحة التحكم', to: '/' },
        { title: 'العقود', to: '/contracts' },
        { title: editing ? 'تعديل مسودة' : 'إنشاء عقد جديد', disabled: true },
      ]"
      class="record-breadcrumbs"
    />
    <ContractWizard
      v-if="validId"
      :key="route.fullPath"
      :model-value="true"
      :contract-id="contractId"
      :initial-review="editing && route.query.step === 'review'"
      @saved="saved"
      @update:model-value="!$event && cancel()"
    />
    <v-alert v-else type="error" variant="tonal">رقم العقد غير صالح.</v-alert>
  </AppLayout>
</template>
