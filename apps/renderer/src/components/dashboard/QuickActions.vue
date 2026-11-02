<script setup lang="ts">
import { computed } from "vue";
import { usePermissions } from "../../composables/usePermissions";
import { QUICK_ACTIONS } from "../../constants/domain";

/**
 * عمليات سريعة: أكثر ما يُبدأ يومياً أزراراً ظاهرة في لوحة التحكم، نقرة واحدة
 * بدل «إضافة» ثم الاختيار. البنود نفسها في «إضافة»، وتُخفى بلا صلاحية.
 */
const { can } = usePermissions();
const actions = computed(() =>
  QUICK_ACTIONS.filter((item) => item.permissions.every((key) => can(key))),
);
// صف واحد بعدد البنود، وصفّان متقاربان حين يضيق المكان (4 + 3 لا 6 + 1).
const columns = computed(() => ({
  "--quick-cols": actions.value.length,
  "--quick-cols-narrow": Math.ceil(actions.value.length / 2),
}));
</script>

<template>
  <nav
    v-if="actions.length"
    class="quick"
    aria-labelledby="quick-title"
    :style="columns"
  >
    <!-- الوسوم أسماء («زبون»، «مصروف»)؛ العنوان يقول إنها إضافة. -->
    <h2 id="quick-title" class="quick__title">عمليات سريعة</h2>
    <div class="quick__grid">
      <router-link
        v-for="item in actions"
        :key="item.to"
        :to="item.to"
        class="quick__action"
      >
        <v-icon :icon="item.icon" size="20" aria-hidden="true" />
        <span>{{ item.title }}</span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
/* صناديق متساوية العرض بفاصل الصفحة نفسه، كل منها لوح صغير على الخلفية:
   الأيقونة فوق الوسم في الوسط، والأيقونة باهتة فلا يتنافس سبعة ألوان. */
.quick {
  display: grid;
  gap: 8px;
  container-type: inline-size;
}
.quick__title {
  margin: 0;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
  color: var(--dal-muted);
}
/* flex لا grid: الصف الناقص (3 تحت 4) يتوسّط بدل أن يترك خانة فارغة في طرفه،
   وعرض كل صندوق محسوب من عدد الأعمدة فتبقى الصناديق متساوية في الصفّين. */
.quick__grid {
  --cols: var(--quick-cols);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--dal-gutter);
}
.quick__action {
  flex: 0 0 calc((100% - (var(--cols) - 1) * var(--dal-gutter)) / var(--cols));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 64px;
  padding: 8px;
  border: 1px solid var(--dal-stroke);
  border-radius: var(--dal-radius-card);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
  text-decoration: none;
  transition: background-color 150ms ease;
}
.quick__action .v-icon {
  color: var(--dal-muted);
}
.quick__action:hover {
  background: var(--dal-hover);
}
.quick__action:active {
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.quick__action:focus-visible {
  outline-offset: -2px;
}
/* سبعة صناديق تحتاج نحو 100px لكل وسم؛ دون ذلك صفّان. */
@container (max-width: 880px) {
  .quick__grid {
    --cols: var(--quick-cols-narrow);
  }
}
</style>
