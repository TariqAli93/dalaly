<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import * as contracts from "../services/contracts.service";
import { getErrorMessage } from "../services/api.service";
import { useSnackbar } from "../composables/useSnackbar";
const { notifyError, notifySuccess } = useSnackbar();
const items = ref<
  Array<{
    id: number;
    contract_type: string;
    name: string;
    body: string;
    is_active: boolean;
  }>
>([]);
const saving = ref<number | null>(null);
async function load() {
  try {
    items.value = await contracts.listTemplates();
  } catch (error) {
    notifyError(getErrorMessage(error));
  }
}
async function save(item: (typeof items.value)[number]) {
  saving.value = item.id;
  try {
    await contracts.updateTemplate(item.contract_type, {
      name: item.name,
      body: item.body,
      is_active: item.is_active,
    });
    notifySuccess("تم حفظ قالب العقد.");
  } catch (error) {
    notifyError(getErrorMessage(error));
  } finally {
    saving.value = null;
  }
}
onMounted(load);
</script>
<template>
  <AppLayout
    title="قوالب العقود"
    subtitle="قوالب مستقلة لكل نوع عقد مع متغيرات ديناميكية مثل {{buyer_name}} و {{property_address}}."
    ><v-card
      v-for="item in items"
      :key="item.id"
      variant="flat"
      border
      class="mb-3"
      ><v-card-title>{{ item.name }}</v-card-title
      ><v-card-text
        ><v-text-field v-model="item.name" label="اسم القالب" /><v-textarea
          v-model="item.body"
          label="نص القالب"
          rows="12"
          auto-grow /></v-card-text
      ><v-card-actions
        ><v-spacer /><v-btn
          color="primary"
          :loading="saving === item.id"
          @click="save(item)"
          >حفظ القالب</v-btn
        ></v-card-actions
      ></v-card
    ></AppLayout
  >
</template>
