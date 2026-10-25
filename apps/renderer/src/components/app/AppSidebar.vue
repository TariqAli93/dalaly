<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useDisplay } from "vuetify";
import { isNavActive, NAV_SECTIONS } from "../../constants/domain";
import { usePermissions } from "../../composables/usePermissions";

// نموذج فتح/إغلاق الدرج (يُتحكَّم به من شريط الأوامر على الجوال).
const drawer = defineModel<boolean>({ default: false });
// نموذج الطيّ (rail) على سطح المكتب: يعرض الأيقونات فقط.
const rail = defineModel<boolean>("rail", { default: false });

const { mdAndUp } = useDisplay();
const { can } = usePermissions();

// وضع الأيقونات فقط يُفعّل تلميحات التنقّل.
const isRail = computed(() => rail.value && mdAndUp.value);

// تحترم RBAC: تُخفى العناصر التي لا يملك المستخدم صلاحيتها، ثم المجموعات الفارغة.
const sections = computed(() =>
  NAV_SECTIONS.map((section) => ({
    title: section.title,
    items: section.items.filter(
      (item) => !item.permission || can(item.permission),
    ),
  })).filter((section) => section.items.length),
);
function go() {
  if (!mdAndUp.value) drawer.value = false;
}

// القائمة محطة Tab واحدة كـ NavigationView في Windows: العنصر الحالي وحده في
// ترتيب Tab، والأسهم وHome/End تتنقّل بين العناصر، وEnter يفتح.
const route = useRoute();
const flatItems = computed(() =>
  sections.value.flatMap((section) => section.items),
);
const tabTarget = computed(
  () =>
    flatItems.value.find((item) => isNavActive(item, route.path))?.to ??
    flatItems.value[0]?.to,
);
function onNavKeydown(event: KeyboardEvent) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const links = [
    ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
      ".dal-nav-item",
    ),
  ];
  const index = links.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? links.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) %
          links.length;
  links[next]?.focus();
}
</script>

<template>
  <!-- color="sidebar" دور في الثيم (خلفية + on-sidebar للنص)، فيتبع الألوان
       المخصّصة والوضع الداكن بلا قراءة لونها يدوياً. المستخدم وتسجيل الخروج في
       قائمة الحساب بشريط الأوامر وحدها. -->
  <v-navigation-drawer
    v-model="drawer"
    class="dal-nav-drawer"
    color="sidebar"
    :rail="isRail"
    rail-width="56"
    location="right"
    :permanent="mdAndUp"
    :temporary="!mdAndUp"
    width="232"
  >
    <div class="dal-brand">
      <v-icon icon="mdi-home-city-outline" size="26" aria-hidden="true" />
      <div v-if="!isRail">
        <div class="dal-brand__title">دلالي</div>
        <div class="dal-brand__sub">إدارة العروض العقارية</div>
      </div>
    </div>

    <v-divider />

    <nav aria-label="التنقل الرئيسي" @keydown="onNavKeydown">
      <v-list nav density="compact">
        <template
          v-for="(section, index) in sections"
          :key="section.title ?? 'home'"
        >
          <v-divider v-if="index && isRail" class="my-2" />
          <v-list-subheader
            v-if="section.title && !isRail"
            class="dal-nav-section"
            >{{ section.title }}</v-list-subheader
          >
          <template v-for="item in section.items" :key="item.to">
            <v-tooltip :text="item.title" :disabled="!isRail" location="start">
              <template #activator="{ props }">
                <v-list-item
                  v-bind="props"
                  :to="item.to"
                  :active="isNavActive(item, $route.path)"
                  :prepend-icon="item.icon"
                  :aria-label="item.title"
                  :aria-current="
                    isNavActive(item, $route.path) ? 'page' : undefined
                  "
                  class="dal-nav-item"
                  :tabindex="item.to === tabTarget ? 0 : -1"
                  :title="item.title"
                  @click="go()"
                />
              </template>
            </v-tooltip>
          </template>
        </template>
      </v-list>
    </nav>
  </v-navigation-drawer>
</template>

<style scoped>
.dal-nav-section {
  min-height: 28px;
  font-size: calc(12px * var(--dal-font-scale));
  font-weight: 600;
  color: rgb(var(--v-theme-on-sidebar));
  opacity: 0.78;
  letter-spacing: 0;
}
.dal-nav-item {
  min-height: 36px;
}
</style>
