<script setup lang="ts">
import { ref, watch } from "vue";
import { useDisplay } from "vuetify";
import AppSidebar from "../components/app/AppSidebar.vue";
import AppTopbar from "../components/app/AppTopbar.vue";
import { useRefresh } from "../composables/useRefresh";

defineProps<{ title?: string; subtitle?: string }>();

const { refresh } = useRefresh();
const { mdAndUp } = useDisplay();

// الدرج: مفتوح وثابت على سطح المكتب، ومغلق افتراضياً على الجوال.
// ملاحظة Vuetify: عند ربط v-model لا يُفعَّل التهيئة التلقائية لـ permanent،
// لذا نضبط القيمة الابتدائية يدوياً ونزامنها مع نقطة الكسر.
const drawer = ref(mdAndUp.value);
const rail = ref(false);
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
  <AppTopbar
    :title="title"
    :subtitle="subtitle"
    @refresh="refresh"
    @toggle-drawer="toggleNav"
  >
    <!-- إجراءات الصفحة تُرفَع من المحتوى إلى شريط الأوامر (نمط سطح المكتب).
         نفس فتحة header-actions السابقة، فلا تتغيّر عقود الصفحات. -->
    <template v-if="$slots['header-actions']" #actions>
      <slot name="header-actions" />
    </template>
  </AppTopbar>
  <v-main>
    <!-- مساحة عمل واحدة متّصلة: عنوان الصفحة في شريط الأوامر، والمحتوى هنا
         بحشو مكتبي صغير وبلا بطاقة رئيسية تحيط الصفحة. -->
    <div class="dal-content">
      <slot />
    </div>
  </v-main>
</template>
