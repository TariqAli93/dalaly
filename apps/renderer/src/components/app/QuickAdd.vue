<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { usePermissions } from "../../composables/usePermissions";
import { QUICK_ADD } from "../../constants/domain";

/**
 * «إضافة» في شريط الأوامر: سجل جديد من أي صفحة (عرض، زبون، طلب، مهمة،
 * مستمسك، صفقة، إيجار، سند). كل بند يفتح صفحته وحوار الإضافة فيها، ولا
 * يظهر إلا لمن يملك صلاحية الإضافة. اختصار الإضافة في كل صفحة يبقى Ctrl+N.
 */
const router = useRouter();
const { can } = usePermissions();

const groups = computed(() =>
  QUICK_ADD.map((group) =>
    group.filter((item) => item.permissions.every((key) => can(key))),
  ).filter((group) => group.length),
);
</script>

<template>
  <v-menu v-if="groups.length" location="bottom end">
    <template #activator="{ props: menu }">
      <v-btn
        v-bind="menu"
        class="dal-quick-add"
        color="primary"
        variant="tonal"
        size="small"
        prepend-icon="mdi-plus"
        aria-label="إضافة سجل جديد"
        title="إضافة سجل جديد"
        >إضافة</v-btn
      >
    </template>
    <v-list density="compact" min-width="220" aria-label="إضافة">
      <template v-for="(group, index) in groups" :key="index">
        <v-divider v-if="index" class="my-1" />
        <v-list-item
          v-for="item in group"
          :key="item.to"
          :title="item.title"
          :prepend-icon="item.icon"
          @click="router.push(item.to)"
        />
      </template>
    </v-list>
  </v-menu>
</template>

<style scoped>
.dal-quick-add {
  margin-inline-end: 4px;
}
/* شريط ضيّق: أيقونة فقط، والاسم في التلميح ووصف الزر. */
@container dal-commandbar (max-width: 1199px) {
  .dal-quick-add {
    min-width: 32px;
    padding-inline: 6px;
  }
  .dal-quick-add :deep(.v-btn__prepend) {
    margin-inline: 0;
  }
  .dal-quick-add :deep(.v-btn__content) {
    display: none;
  }
}
</style>
