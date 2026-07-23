<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useDisplay } from "vuetify";
import AppSidebar from "../components/app/AppSidebar.vue";
import AppTopbar from "../components/app/AppTopbar.vue";
import { useRefresh } from "../composables/useRefresh";

const props = defineProps<{ title?: string; subtitle?: string }>();

const route = useRoute();
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

// مسار تنقّل بسيط: الرئيسية ← الصفحة الحالية. لا يظهر على لوحة البداية.
const breadcrumbs = computed(() => {
  if (route.path === "/" || !props.title) return [];
  return [
    { title: "الرئيسية", to: "/", disabled: false },
    { title: props.title, to: route.path, disabled: true },
  ];
});
</script>

<template>
  <AppSidebar v-model="drawer" v-model:rail="rail" />
  <AppTopbar @refresh="refresh" @toggle-drawer="toggleNav" />
  <v-main>
    <!-- v-main يُصيّر عنصر <main> بنفسه، فلا نضيف عنصراً ثانياً. -->
    <v-container class="py-6" fluid>
      <section>
        <v-breadcrumbs
          v-if="breadcrumbs.length"
          :items="breadcrumbs"
          class="dal-breadcrumbs"
          density="compact"
        >
          <template #divider>
            <v-icon icon="mdi-chevron-left" size="16" />
          </template>
        </v-breadcrumbs>

        <div v-if="title" class="page-header">
          <div>
            <h1 class="text-h5 font-weight-bold">{{ title }}</h1>
            <div v-if="subtitle" class="text-body-2 text-medium-emphasis">
              {{ subtitle }}
            </div>
          </div>
          <slot name="header-actions" />
        </div>
        <slot />
      </section>
    </v-container>
  </v-main>
</template>
