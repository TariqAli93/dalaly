<script setup lang="ts">
import DateField from "./DateField.vue";
import NumberField from "../app/NumberField.vue";
import type {
  ContractTemplateRecord,
  PropertyRecord,
  RentalRecord,
} from "../../types";
import type { ContractType } from "./contract-form";
import { formatMoney } from "../../utils/format";

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
  errors?: Record<string, string[]>;
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
  return `${item.name || item.code} — ${formatMoney(
    props.contractType === "sale"
      ? (item as PropertyRecord).total_price
      : (item as RentalRecord).rent_price,
  )}`;
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
      :error-messages="props.errors?.assets"
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
      :error-messages="props.errors?.assets"
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
    <v-text-field
      v-if="!props.section || props.section === 'information'"
      :model-value="props.templates.find(t => t.id === props.templateId)?.name ?? 'القالب الافتراضي'"
      label="قالب العقد"
      :error-messages="props.errors?.template_id"
      hint="يُستخدم قالب DOCX المناسب تلقائياً." persistent-hint readonly
    />
    <div v-if="!props.section || props.section === 'information'">
      <DateField
        :model-value="props.contractDate"
        label="تاريخ العقد"
        @update:model-value="emit('update:contractDate', $event)"
      />
      <v-messages
        :messages="props.errors?.contract_date"
        color="error"
        :active="!!props.errors?.contract_date?.length"
      />
    </div>
    <div
      v-if="
        (!props.section || props.section === 'information') &&
        props.contractType === 'rental'
      "
    >
      <DateField
        :model-value="props.startDate"
        label="تاريخ بدء الإيجار"
        @update:model-value="emit('update:startDate', $event)"
      />
      <v-messages
        :messages="props.errors?.start_date"
        color="error"
        :active="!!props.errors?.start_date?.length"
      />
    </div>
    <div
      v-if="
        (!props.section || props.section === 'information') &&
        props.contractType === 'rental'
      "
    >
      <DateField
        :model-value="props.endDate"
        label="تاريخ انتهاء الإيجار"
        @update:model-value="emit('update:endDate', $event)"
      />
      <v-messages
        :messages="props.errors?.end_date"
        color="error"
        :active="!!props.errors?.end_date?.length"
      />
    </div>
    <NumberField
      v-if="!props.section || props.section === 'payments'"
      :model-value="props.amount"
      label="المبلغ الإجمالي"
      :error-messages="props.errors?.amount"
      readonly
      prefix=""
    />
    <NumberField
      v-if="!props.section || props.section === 'payments'"
      :model-value="props.paidAmount"
      label="المبلغ المدفوع"
      :error-messages="props.errors?.paid_amount"
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
