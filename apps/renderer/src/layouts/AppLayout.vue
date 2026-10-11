<script setup lang="ts">
import { ref, watch } from "vue";
import { useDisplay } from "vuetify";
import AppSidebar from "../components/app/AppSidebar.vue";
import AppTopbar from "../components/app/AppTopbar.vue";
import PageHeader from "../components/shared/PageHeader.vue";
import { useRefresh } from "../composables/useRefresh";
import { appearance } from "../composables/useAppearance";

defineProps<{ title?: string; subtitle?: string }>();

const { refresh } = useRefresh();
const { mdAndUp } = useDisplay();

// الدرج: مفتوح وثابت على سطح المكتب، ومغلق افتراضياً على الجوال.
// ملاحظة Vuetify: عند ربط v-model لا يُفعَّل التهيئة التلقائية لـ permanent،
// لذا نضبط القيمة الابتدائية يدوياً ونزامنها مع نقطة الكسر.
const drawer = ref(mdAndUp.value);
const rail = ref(true);
watch(mdAndUp, (value) => {
  drawer.value = value;
  if (!value) rail.value = false; // على الجوال لا يوجد وضع طيّ (rail)
});

// زر القائمة: يطوي/يوسّع الشريط على سطح المكتب، ويفتح/يغلق الدرج على الجوال.
function toggleNav() {
  if (mdAndUp.value) {
    rail.value = !rail.value;
  } else {
    drawer.value = !drawer.value;
  }
}
</script>

<template>
  <AppSidebar v-model="drawer" v-model:rail="rail" />
  <v-main class="dal-main">
    <AppTopbar
      :title="title"
      :subtitle="subtitle"
      @refresh="refresh"
      @toggle-drawer="toggleNav"
    />
    <div class="dal-workspace">
      <v-container
        :fluid="appearance.fluid"
        class="dal-content"
        :style="{
          maxWidth: appearance.fluid ? 'none' : `${appearance.maxWidth}px`,
        }"
      >
        <PageHeader :title="title ?? 'دلالي'" :subtitle="subtitle">
          <template v-if="$slots['header-actions']" #default>
            <slot name="header-actions" />
          </template>
        </PageHeader>
        <slot />
      </v-container>
    </div>
  </v-main>
</template>
