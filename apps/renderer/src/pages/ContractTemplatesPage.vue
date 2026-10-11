<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppLayout from "../layouts/AppLayout.vue";
import * as contracts from "../services/contracts.service";
import type { ContractTemplateRecord } from "../types";
import { getErrorMessage } from "../services/api.service";
import { useSnackbar } from "../composables/useSnackbar";
const { notifyError, notifySuccess } = useSnackbar();
const items = ref<ContractTemplateRecord[]>([]),
  saving = ref<number | null>(null);
async function load() {
  try {
    items.value = (await contracts.listTemplates()).filter(
      (i) => i.is_active && ["sale", "rental"].includes(i.contract_type),
    );
  } catch (e) {
    notifyError(getErrorMessage(e));
  }
}
async function save(item: ContractTemplateRecord) {
  saving.value = item.id;
  try {
    await contracts.updateTemplate(item.id, {
      contract_type: item.contract_type,
      name: item.name,
      body: "{{document}}",
      is_active: item.is_active,
      layout_config: item.layout_config,
      branding_config: item.branding_config,
    });
    notifySuccess("تم حفظ إصدار مرئي جديد.");
    await load();
  } catch (e) {
    notifyError(getErrorMessage(e));
  } finally {
    saving.value = null;
  }
}
onMounted(load);
</script>
<template>
  <AppLayout
    title="قوالب العقود المرئية"
    subtitle="ستة تصاميم للبيع وستة للإيجار، تعرض المحتوى القانوني نفسه وفق بيانات العقد."
  >
    <v-alert type="info" variant="tonal" class="mb-4"
      >الصيغ القانونية تُدار من الإعدادات ← إدارة الصيغ القانونية. تبقى النسخ
      المرئية للعقود الصادرة محفوظة.</v-alert
    >
    <v-expansion-panels>
      <v-expansion-panel
        v-for="item in items"
        :key="item.id"
        :title="`${item.name} · الإصدار ${item.version}`"
      >
        <v-expansion-panel-text>
          <v-row>
            <v-col cols="12" md="6"
              ><v-text-field v-model="item.name" label="اسم التصميم"
            /></v-col>
            <v-col cols="12" md="6"
              ><v-select
                v-model="item.layout_config.font"
                :items="['Tahoma', 'Arial', 'Amiri']"
                label="الخط"
            /></v-col>
            <v-col cols="6" md="3"
              ><v-number-input
                v-model="item.layout_config.font_size"
                :min="10"
                :max="20"
                label="حجم الخط"
            /></v-col>
            <v-col cols="6" md="3"
              ><v-number-input
                v-model="item.layout_config.margin_mm"
                :min="10"
                :max="25"
                label="هامش A4 (مم)"
            /></v-col>
            <v-col cols="6" md="3"
              ><v-number-input
                v-model="item.layout_config.paragraph_spacing"
                :min="0"
                :max="24"
                label="تباعد الفقرات"
            /></v-col>
            <v-col cols="6" md="3"
              ><v-number-input
                v-model="item.layout_config.line_height"
                :min="1.3"
                :max="2.5"
                :step="0.1"
                label="ارتفاع السطر"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-select
                v-model="item.layout_config.header_style"
                :items="[
                  { title: 'كلاسيكي', value: 'classic' },
                  { title: 'شريط ملون', value: 'band' },
                  { title: 'رأسي', value: 'stacked' },
                ]"
                label="رأس الصفحة"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-select
                v-model="item.layout_config.border_style"
                :items="[
                  { title: 'بدون إطار', value: 'none' },
                  { title: 'إطار مفرد', value: 'solid' },
                  { title: 'إطار مزدوج', value: 'double' },
                ]"
                label="الإطار"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-select
                v-model="item.layout_config.signature_style"
                :items="[
                  { title: 'أعمدة', value: 'columns' },
                  { title: 'رأسي', value: 'stacked' },
                ]"
                label="موضع التواقيع"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-text-field
                v-model="item.layout_config.accent_color"
                type="color"
                label="اللون"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-switch
                v-model="item.branding_config.show_logo"
                label="عرض شعار المكتب"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-switch
                v-model="item.branding_config.watermark"
                label="علامة مائية باسم المكتب"
            /></v-col>
          </v-row>
          <v-btn
            color="primary"
            :loading="saving === item.id"
            @click="save(item)"
            >حفظ التصميم</v-btn
          >
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </AppLayout>
</template>
