<script setup lang="ts">
import { statusColor, statusLabel } from "../../constants/domain";
import { formatMoney, formatPlot } from "../../utils/format";
import { neighborhoodOf } from "../../utils/exportProperty";
import type { PropertyRecord } from "../../types";
import PropertyActions from "./PropertyActions.vue";

defineProps<{ properties: PropertyRecord[]; loading?: boolean }>();

const emit = defineEmits<{
  view: [PropertyRecord];
  edit: [PropertyRecord];
  archive: [PropertyRecord];
  restore: [PropertyRecord];
  delete: [PropertyRecord];
  create: [];
}>();

const headers = [
  { title: "الكود", key: "code", sortable: true },
  { title: "النوع", key: "property_type" },
  { title: "المنطقة", key: "district" },
  { title: "الحي", key: "neighborhood" },
  { title: "رقم القطعة", key: "plot" },
  { title: "المساحة", key: "area" },
  { title: "الواجهة", key: "frontage" },
  { title: "النزال", key: "nazal" },
  { title: "المالك", key: "owner_name" },
  { title: "السعر الكلي", key: "total_price" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false, align: "end" as const },
];
</script>

<template>
  <v-card rounded="lg" variant="flat" border>
    <v-skeleton-loader v-if="loading" type="table" />
    <v-empty-state
      v-else-if="!properties.length"
      icon="mdi-home-search-outline"
      title="لا توجد عقارات مطابقة للبحث"
      text="غيّر كلمات البحث أو الفلاتر، أو أضف عرضاً جديداً."
    >
      <template #actions>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="emit('create')">
          إضافة عرض
        </v-btn>
      </template>
    </v-empty-state>
    <v-data-table
      v-else
      :headers="headers"
      :items="properties"
      item-value="id"
      density="compact"
      hover
    >
      <template #item.neighborhood="{ item }">
        {{ neighborhoodOf(item) || "-" }}
      </template>
      <template #item.plot="{ item }">
        {{ formatPlot(item.plot_number, item.plot_letter) || "-" }}
      </template>
      <template #item.area="{ item }">
        {{ item.area_value }} {{ item.area_unit }}
      </template>
      <template #item.total_price="{ item }">
        <span class="money">{{ formatMoney(item.total_price) }}</span>
        دينار
      </template>
      <template #item.status="{ item }">
        <v-chip size="small" :color="statusColor(item.status)" variant="tonal">
          {{ statusLabel(item.status) }}
        </v-chip>
      </template>
      <template #item.actions="{ item }">
        <PropertyActions
          :property="item"
          @view="emit('view', $event)"
          @edit="emit('edit', $event)"
          @archive="emit('archive', $event)"
          @restore="emit('restore', $event)"
          @delete="emit('delete', $event)"
        />
      </template>
    </v-data-table>
  </v-card>
</template>
