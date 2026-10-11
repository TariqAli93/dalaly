<script setup lang="ts">
import DateField from "./DateField.vue";
import NumberField from "../app/NumberField.vue";
import type {
  ContractTemplateRecord,
  PropertyRecord,
  RentalRecord,
} from "../../types";
import type { ContractType } from "./contract-form";

const props = defineProps<{
  section?: "information" | "assets" | "payments";
  contractType: ContractType;
  propertyIds: number[];
  rentalIds: number[];
  contractDate: string;
  startDate: string;
  endDate: string;
  amount: number;
  paidAmount: string | number | null;
  remainingAmount: number;
  templateId: number | null;
  properties: PropertyRecord[];
  rentals: RentalRecord[];
  templates: ContractTemplateRecord[];
}>();
const emit = defineEmits<{
  (event: "update:contractType", value: ContractType): void;
  (event: "update:propertyIds", value: number[]): void;
  (event: "update:rentalIds", value: number[]): void;
  (event: "update:contractDate", value: string): void;
  (event: "update:startDate", value: string): void;
  (event: "update:endDate", value: string): void;
  (event: "update:paidAmount", value: string | number | null): void;
  (event: "update:templateId", value: number | null): void;
}>();

function updatePaid(value: string | number | null | undefined) {
  emit("update:paidAmount", value ?? null);
}

function assetTitle(item: PropertyRecord | RentalRecord) {
  return `${item.name || item.code} — ${
    props.contractType === "sale"
      ? (item as PropertyRecord).total_price
      : (item as RentalRecord).rent_price
  }`;
}
</script>

<template>
  <div class="details-grid">
    <v-select
      v-if="!props.section || props.section === 'information'"
      :model-value="props.contractType"
      :items="[
        { title: 'عقد بيع', value: 'sale' },
        { title: 'عقد إيجار', value: 'rental' },
      ]"
      label="نوع العقد"
      @update:model-value="emit('update:contractType', $event)"
    />
    <v-autocomplete
      v-if="
        (!props.section || props.section === 'assets') &&
        props.contractType === 'sale'
      "
      :model-value="props.propertyIds"
      :items="props.properties"
      :item-title="assetTitle"
      item-value="id"
      label="العقار / العقارات"
      multiple
      chips
      closable-chips
      clearable
      :rules="[
        (value: number[]) =>
          value.length > 0 || 'اختر عقاراً واحداً على الأقل.',
      ]"
      @update:model-value="emit('update:propertyIds', $event)"
    />
    <v-autocomplete
      v-if="
        (!props.section || props.section === 'assets') &&
        props.contractType !== 'sale'
      "
      :model-value="props.rentalIds"
      :items="props.rentals"
      :item-title="assetTitle"
      item-value="id"
      label="العرض الإيجاري / العروض الإيجارية"
      multiple
      chips
      closable-chips
      clearable
      :rules="[
        (value: number[]) =>
          value.length > 0 || 'اختر عرضاً إيجارياً واحداً على الأقل.',
      ]"
      @update:model-value="emit('update:rentalIds', $event)"
    />
    <v-select
      v-if="!props.section || props.section === 'information'"
      :model-value="props.templateId"
      :items="props.templates"
      item-title="name"
      item-value="id"
      label="قالب العقد"
      clearable
      @update:model-value="emit('update:templateId', $event)"
    />
    <DateField
      v-if="!props.section || props.section === 'information'"
      :model-value="props.contractDate"
      label="تاريخ العقد"
      @update:model-value="emit('update:contractDate', $event)"
    />
    <DateField
      v-if="
        (!props.section || props.section === 'information') &&
        props.contractType === 'rental'
      "
      :model-value="props.startDate"
      label="تاريخ بدء الإيجار"
      @update:model-value="emit('update:startDate', $event)"
    />
    <DateField
      v-if="
        (!props.section || props.section === 'information') &&
        props.contractType === 'rental'
      "
      :model-value="props.endDate"
      label="تاريخ انتهاء الإيجار"
      @update:model-value="emit('update:endDate', $event)"
    />
    <NumberField
      v-if="!props.section || props.section === 'payments'"
      :model-value="props.amount"
      label="المبلغ الإجمالي"
      readonly
      prefix=""
    />
    <NumberField
      v-if="!props.section || props.section === 'payments'"
      :model-value="props.paidAmount"
      label="المبلغ المدفوع"
      :min="0"
      :rules="[
        (value: string | number | null) =>
          Number(value || 0) >= 0 || 'لا يمكن أن يكون المبلغ المدفوع سالباً.',
        (value: string | number | null) =>
          Number(value || 0) <= props.amount ||
          'لا يمكن أن يتجاوز المدفوع المبلغ الإجمالي.',
      ]"
      @update:model-value="updatePaid"
    />
    <NumberField
      v-if="!props.section || props.section === 'payments'"
      :model-value="props.remainingAmount"
      label="المبلغ المتبقي"
      readonly
    />
  </div>
</template>

<style scoped>
.details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 760px) {
  .details-grid {
    grid-template-columns: 1fr;
  }
}
</style>
