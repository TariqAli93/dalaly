<script setup lang="ts">
import type { ContractTemplateRecord, PropertyRecord, RentalRecord } from "../../types";
defineProps<{
  contractType: "sale" | "rental";
  propertyId: number | null;
  rentalId: number | null;
  contractDate: string;
  startDate: string;
  endDate: string;
  amount: string | number | null;
  templateId: number | null;
  properties: PropertyRecord[];
  rentals: RentalRecord[];
  templates: ContractTemplateRecord[];
}>();
const emit = defineEmits<{ "update:contractType": [value: "sale" | "rental"]; "update:propertyId": [value: number | null]; "update:rentalId": [value: number | null]; "update:contractDate": [value: string]; "update:startDate": [value: string]; "update:endDate": [value: string]; "update:amount": [value: string | number | null]; "update:templateId": [value: number | null] }>();
</script>
<template>
  <div class="details-grid">
    <v-select :model-value="contractType" :items="[{ title: 'عقد بيع', value: 'sale' }, { title: 'عقد إيجار', value: 'rental' }]" label="نوع العقد" @update:model-value="emit('update:contractType', $event)" />
    <v-autocomplete v-if="contractType === 'sale'" :model-value="propertyId" :items="properties" item-title="name" item-value="id" label="العقار" clearable @update:model-value="emit('update:propertyId', $event)" />
    <v-autocomplete v-else :model-value="rentalId" :items="rentals" item-title="name" item-value="id" label="العرض الإيجاري" clearable @update:model-value="emit('update:rentalId', $event)" />
    <v-select :model-value="templateId" :items="templates" item-title="name" item-value="id" label="قالب العقد" clearable @update:model-value="emit('update:templateId', $event)" />
    <v-text-field :model-value="contractDate" type="date" label="تاريخ العقد" @update:model-value="emit('update:contractDate', $event)" />
    <v-text-field v-if="contractType === 'rental'" :model-value="startDate" type="date" label="تاريخ بدء الإيجار" @update:model-value="emit('update:startDate', $event)" />
    <v-text-field v-if="contractType === 'rental'" :model-value="endDate" type="date" label="تاريخ انتهاء الإيجار" @update:model-value="emit('update:endDate', $event)" />
    <v-text-field :model-value="amount" label="المبلغ" inputmode="decimal" @update:model-value="emit('update:amount', $event)" />
  </div>
</template>
<style scoped>
.details-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 760px) { .details-grid { grid-template-columns: 1fr; } }
</style>
