<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useDisplay } from "vuetify";
import AppSidebar from "../components/app/AppSidebar.vue";
import AppTopbar from "../components/app/AppTopbar.vue";
import { useRefresh } from "../composables/useRefresh";
import { usePageTitle } from "../composables/usePageTitle";
import { appearance } from "../composables/useAppearance";

// إطار التطبيق للصفحات بعد تسجيل الدخول: مسار أب في الموجّه، فيبقى مركّباً
// أثناء التنقّل (لا تُطوى القائمة الموسّعة عند كل صفحة). ترويسة كل صفحة
// وأزرارها في AppPage داخل الصفحة نفسها.
const { refresh } = useRefresh();
const { pageTitle } = usePageTitle();
const route = useRoute();
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
// على الجوال يُغلق الدرج عند الانتقال إلى صفحة أخرى، كما كان حين كان الإطار
// يُعاد تركيبه مع كل صفحة.
watch(
  () => route.path,
  () => {
    if (!mdAndUp.value) drawer.value = false;
  },
);

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
      :title="pageTitle"
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
        <router-view />
      </v-container>
    </div>
  </v-main>
</template>
