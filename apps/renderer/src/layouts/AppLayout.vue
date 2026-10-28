<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay } from "vuetify";
import AppSidebar from "../components/app/AppSidebar.vue";
import AppTopbar from "../components/app/AppTopbar.vue";
import { useRefresh } from "../composables/useRefresh";
import { appearance } from "../composables/useAppearance";
import { isDialogOpen } from "../utils/dialog";

// إطار التطبيق للصفحات بعد تسجيل الدخول: مسار أب في الموجّه، فيبقى مركّباً
// أثناء التنقّل (لا تُطوى القائمة الموسّعة عند كل صفحة). عنوان كل صفحة
// وأوامرها في شريط الأوامر عبر AppPage، والمحتوى على الخلفية مباشرة.
const { refresh, canRefresh } = useRefresh();
const route = useRoute();
const router = useRouter();
const { mdAndUp } = useDisplay();

// الدرج: مفتوح وثابت على سطح المكتب، ومغلق افتراضياً على الجوال.
// ملاحظة Vuetify: عند ربط v-model لا يُفعَّل التهيئة التلقائية لـ permanent،
// لذا نضبط القيمة الابتدائية يدوياً ونزامنها مع نقطة الكسر.
const drawer = ref(mdAndUp.value);
// الطيّ تفضيل للمستخدم على هذا الجهاز يبقى بين التشغيلات. الافتراضي موسّع
// بأسماء العناصر، فلا يُطلب من موظف جديد فكّ اثنتي عشرة أيقونة؛ التخزين قد
// يكون محجوباً فيُعامل غيابه كالافتراضي.
const RAIL_KEY = "dalaly.sidebar.rail.v1";
function savedRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === "true";
  } catch {
    return false;
  }
}
const rail = ref(mdAndUp.value && savedRail());
watch(mdAndUp, (value) => {
  drawer.value = value;
  // على الجوال لا يوجد وضع طيّ (rail)
  rail.value = value && savedRail();
});

// عند الانتقال إلى صفحة أخرى: يُغلق الدرج على الجوال، وينتقل التركيز إلى عنوان
// الصفحة فيقرؤه قارئ الشاشة ويبدأ Tab من أولها لا من آخر ما في الصفحة السابقة.
// تغيّر الاستعلام وحده (فتح سجل أو تصفية) لا يحرّك التركيز.
watch(
  () => route.path,
  () => {
    if (!mdAndUp.value) drawer.value = false;
    void nextTick(() =>
      document.getElementById("dal-page-title")?.focus({ preventScroll: true }),
    );
  },
);

// زر القائمة: يطوي/يوسّع الشريط على سطح المكتب، ويفتح/يغلق الدرج على الجوال.
function toggleNav() {
  if (mdAndUp.value) {
    rail.value = !rail.value;
    try {
      localStorage.setItem(RAIL_KEY, String(rail.value));
    } catch {
      // التفضيل يبقى لهذه الجلسة فقط.
    }
  } else {
    drawer.value = !drawer.value;
  }
}

function focusMain() {
  document.getElementById("dal-main")?.focus();
}

// اختصارات عامة: Alt+← رجوع كالمتصفح ومستكشف Windows، وF1 للمساعدة. لا
// تُعترض داخل حوار مفتوح.
function onShortcut(event: KeyboardEvent) {
  if (isDialogOpen()) return;
  if (event.altKey && !event.ctrlKey && event.code === "ArrowLeft") {
    event.preventDefault();
    router.back();
  } else if (event.code === "F1" && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    void router.push("/help");
  }
}
onMounted(() => window.addEventListener("keydown", onShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
</script>

<template>
  <a class="dal-skip" href="#dal-main" @click.prevent="focusMain"
    >تخطَّ إلى المحتوى</a
  >
  <AppSidebar v-model="drawer" v-model:rail="rail" />
  <AppTopbar
    :can-refresh="canRefresh"
    @refresh="refresh"
    @toggle-drawer="toggleNav"
  />
  <v-main class="dal-main">
    <v-container
      id="dal-main"
      :fluid="appearance.fluid"
      class="dal-content"
      tabindex="-1"
      :style="{
        maxWidth: appearance.fluid ? 'none' : `${appearance.maxWidth}px`,
      }"
    >
      <router-view />
    </v-container>
  </v-main>
</template>
