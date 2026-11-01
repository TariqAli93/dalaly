<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useDisplay } from "vuetify";
import {
  isNavActive,
  isNavOpen,
  NAV_SECTIONS,
  type NavItem,
} from "../../constants/domain";
import { usePermissions } from "../../composables/usePermissions";

// نموذج فتح/إغلاق الدرج (يُتحكَّم به من شريط الأوامر على الجوال).
const drawer = defineModel<boolean>({ default: false });
// نموذج الطيّ (rail) على سطح المكتب: يعرض الأيقونات فقط.
const rail = defineModel<boolean>("rail", { default: false });

const { mdAndUp } = useDisplay();
const { can } = usePermissions();
const route = useRoute();

// وضع الأيقونات فقط يُفعّل تلميحات التنقّل.
const isRail = computed(() => rail.value && mdAndUp.value);

const allowed = (item: NavItem) => !item.permission || can(item.permission);

/**
 * عنصر تُظهره الصلاحيات: بصفحته إن سُمح بها، وإلا بأول أبنائه المسموح بهم
 * (من يدير المستخدمين ولا يقرأ الإعدادات يصل إلى «المستخدمون» من العنصر نفسه).
 * الأبناء يظهرون تحته ما دام المستخدم داخل مجاله.
 */
type ShownItem = NavItem & { children: NavItem[] };
function shown(item: NavItem): ShownItem | null {
  const children = (item.children ?? []).filter(allowed);
  if (allowed(item)) return { ...item, children };
  if (!children.length) return null;
  return { ...item, to: children[0].to, children: children.slice(1) };
}

// تحترم RBAC: تُخفى العناصر التي لا يملك المستخدم صلاحيتها، ثم المجموعات الفارغة.
const sections = computed(() =>
  NAV_SECTIONS.map((section, index) => ({
    key: section.title ?? `section-${index}`,
    title: section.title,
    items: section.items
      .map(shown)
      .filter((item): item is ShownItem => item !== null),
  })).filter((section) => section.items.length),
);
const openChildren = (item: ShownItem) =>
  isNavOpen(item, route.path) ? item.children : [];

function go() {
  if (!mdAndUp.value) drawer.value = false;
}

// القائمة محطة Tab واحدة كـ NavigationView في Windows: العنصر الحالي وحده في
// ترتيب Tab، والأسهم وHome/End تتنقّل بين العناصر، وEnter يفتح.
const flatItems = computed(() =>
  sections.value.flatMap((section) =>
    section.items.flatMap((item) => [item, ...openChildren(item)]),
  ),
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

const helpActive = computed(() => route.path === "/help");
</script>

<template>
  <!-- color="sidebar" دور في الثيم (خلفية + on-sidebar للنص)، فيتبع الألوان
       المخصّصة والوضع الداكن بلا قراءة لونها يدوياً. المستخدم وتسجيل الخروج في
       قائمة الحساب بشريط الأوامر وحدها، والمساعدة ثابتة في أسفل اللوح. -->
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
        <template v-for="(section, index) in sections" :key="section.key">
          <v-divider v-if="index && (isRail || !section.title)" class="my-2" />
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
                  :class="{
                    'dal-nav-item--open':
                      item.children.length &&
                      isNavOpen(item, $route.path) &&
                      !isNavActive(item, $route.path),
                  }"
                  :tabindex="item.to === tabTarget ? 0 : -1"
                  :title="item.title"
                  @click="go()"
                />
              </template>
            </v-tooltip>
            <v-tooltip
              v-for="child in openChildren(item)"
              :key="child.to"
              :text="child.title"
              :disabled="!isRail"
              location="start"
            >
              <template #activator="{ props }">
                <v-list-item
                  v-bind="props"
                  :to="child.to"
                  :active="isNavActive(child, $route.path)"
                  :prepend-icon="child.icon"
                  :aria-label="child.title"
                  :aria-current="
                    isNavActive(child, $route.path) ? 'page' : undefined
                  "
                  class="dal-nav-item dal-nav-item--child"
                  :tabindex="child.to === tabTarget ? 0 : -1"
                  :title="child.title"
                  @click="go()"
                />
              </template>
            </v-tooltip>
          </template>
        </template>
      </v-list>
    </nav>

    <!-- مكان ثابت ظاهر دائماً: نقرة واحدة من أي صفحة، وF1 من لوحة المفاتيح. -->
    <template #append>
      <v-divider />
      <v-list nav density="compact" aria-label="المساعدة">
        <v-tooltip
          text="المساعدة وحول التطبيق (F1)"
          :disabled="!isRail"
          location="start"
        >
          <template #activator="{ props }">
            <v-list-item
              v-bind="props"
              to="/help"
              :active="helpActive"
              prepend-icon="mdi-help-circle-outline"
              aria-label="المساعدة وحول التطبيق"
              aria-keyshortcuts="F1"
              :aria-current="helpActive ? 'page' : undefined"
              title="المساعدة وحول التطبيق"
              @click="go()"
            />
          </template>
        </v-tooltip>
      </v-list>
    </template>
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
/* أبناء العنصر داخل مجاله: أصغر قليلاً ومزاحة إلى الداخل. */
.dal-nav-item--child {
  min-height: 32px;
  padding-inline-start: 28px !important;
}
.v-navigation-drawer--rail .dal-nav-item--child {
  padding-inline-start: 0 !important;
}
/* العنصر الأب وأحد أبنائه مفتوح: خط عريض بلا تعبئة، فالمحدد هو الابن. */
.dal-nav-item--open {
  font-weight: 600;
}
</style>
