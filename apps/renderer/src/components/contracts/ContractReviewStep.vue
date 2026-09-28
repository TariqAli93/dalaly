<script setup lang="ts">
defineProps<{ contractLabel: string; assetLabel: string; parties: Array<{ label: string; name: string; documents: number; missing: number }>; officeReady: boolean; templateName: string }>();
</script>
<template>
  <div class="review-grid">
    <v-list lines="two" border rounded>
      <v-list-item title="نوع العقد" :subtitle="contractLabel" prepend-icon="mdi-file-document-outline"><template #append><v-icon color="success">mdi-check-circle</v-icon></template></v-list-item>
      <v-list-item title="العقار" :subtitle="assetLabel || 'غير محدد'" prepend-icon="mdi-home-outline"><template #append><v-icon :color="assetLabel ? 'success' : 'error'">{{ assetLabel ? 'mdi-check-circle' : 'mdi-alert-circle' }}</v-icon></template></v-list-item>
      <v-list-item title="القالب" :subtitle="templateName || 'غير محدد'" prepend-icon="mdi-file-edit-outline"><template #append><v-icon :color="templateName ? 'success' : 'error'">{{ templateName ? 'mdi-check-circle' : 'mdi-alert-circle' }}</v-icon></template></v-list-item>
      <v-list-item title="بيانات المكتب" :subtitle="officeReady ? 'مكتملة' : 'ناقصة'" prepend-icon="mdi-office-building-outline"><template #append><v-icon :color="officeReady ? 'success' : 'error'">{{ officeReady ? 'mdi-check-circle' : 'mdi-alert-circle' }}</v-icon></template></v-list-item>
    </v-list>
    <v-card v-for="party in parties" :key="party.label" variant="tonal"><v-card-title>{{ party.label }}</v-card-title><v-card-text><div class="font-weight-medium">{{ party.name || 'لم يتم الاختيار' }}</div><div class="text-caption mt-2">{{ party.documents }} مستمسك محدد</div><v-alert v-if="party.missing" type="warning" variant="tonal" density="compact" class="mt-2">يوجد {{ party.missing }} مستمسك مطلوب ناقص</v-alert></v-card-text></v-card>
  </div>
</template>
<style scoped>
.review-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.review-grid > :first-child { grid-column: 1 / -1; }
@media (max-width: 760px) { .review-grid { grid-template-columns: 1fr; } .review-grid > :first-child { grid-column: auto; } }
</style>
