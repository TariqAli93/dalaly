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
</script>

<template>
  <nav
    v-if="actions.length"
    class="dal-panel quick"
    aria-labelledby="quick-title"
  >
    <h2 id="quick-title" class="quick__title">عمليات سريعة</h2>
    <v-btn
      v-for="item in actions"
      :key="item.to"
      :to="item.to"
      variant="text"
      size="small"
      :prepend-icon="item.icon"
      class="quick__action"
      >{{ item.title }}</v-btn
    >
  </nav>
</template>

<style scoped>
/* شريط أدوات لا قسم: الأزرار بلون النص وأيقوناتها باهتة، فيبقى لون العلامة
   للأمر الأساسي في كل صف لا لثمانية أزرار متجاورة. */
.quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 4px 12px;
}
.quick__title {
  margin: 0;
  margin-inline-end: 8px;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 600;
}
.quick__action :deep(.v-btn__prepend) {
  color: var(--dal-muted);
}
</style>
