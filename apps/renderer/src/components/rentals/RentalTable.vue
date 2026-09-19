<script setup lang="ts">
import { formatMoney } from "../../utils/format";
import type { RentalRecord } from "../../types";
import StatusChip from "../shared/StatusChip.vue";
import EmptyState from "../shared/EmptyState.vue";
import { usePermissions } from "../../composables/usePermissions";

const props = defineProps<{
  rentals: RentalRecord[];
  favoriteIds?: Set<number>;
  loading?: boolean;
  selectedId?: number | null;
  hasFilters?: boolean;
}>();

const emit = defineEmits<{
  view: [RentalRecord];
  edit: [RentalRecord];
  archive: [RentalRecord];
  restore: [RentalRecord];
  delete: [RentalRecord];
  favorite: [RentalRecord];
  create: [];
  select: [RentalRecord];
  clearFilters: [];
}>();

const { can } = usePermissions();

const typeLabel: Record<string, string> = {
  house: "بيت",
  apartment: "شقة",
  shop: "محل",
  warehouse: "مخزن",
  other: "أخرى",
};
const periodLabel: Record<string, string> = {
  monthly: "شهري",
  semi_annual: "نصف سنوي",
  annual: "سنوي",
};

function onRowClick(event: MouseEvent, ctx: { item: RentalRecord }) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a")) return;
  emit("select", ctx.item);
}

function rowProps(ctx: { item: RentalRecord }) {
  return ctx.item.id === props.selectedId ? { class: "dal-row--selected" } : {};
}

const headers = [
  { title: "الاسم", key: "name", sortable: true },
  { title: "الكود", key: "code", sortable: true },
  { title: "النوع", key: "property_type" },
  { title: "الإيجار", key: "rent_price" },
  { title: "الفترة", key: "rent_period" },
  { title: "المنطقة", key: "district" },
  { title: "الحي", key: "neighborhood" },
  { title: "المساحة", key: "area" },
  { title: "الغرف", key: "rooms_count" },
  { title: "الحمامات", key: "bathrooms_count" },
  { title: "المالك", key: "owner_name" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false, align: "end" as const },
];
</script>

<template>
  <div class="dal-panel dal-grid">
    <v-skeleton-loader v-if="loading" type="table" />
    <EmptyState
      v-else-if="!rentals.length && hasFilters"
      class="dal-empty"
      icon="mdi-home-search-outline"
      title="لا توجد إيجارات مطابقة للبحث والفلاتر الحالية"
      text="جرّب توسيع البحث أو إزالة بعض الفلاتر."
    >
      <template #actions>
        <v-btn variant="tonal" prepend-icon="mdi-filter-remove" @click="emit('clearFilters')">
          مسح الفلاتر
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="emit('create')">
          إضافة إيجار
        </v-btn>
      </template>
    </EmptyState>
    <EmptyState
      v-else-if="!rentals.length"
      class="dal-empty"
      icon="mdi-home-plus-outline"
      title="لا توجد إيجارات بعد"
      text="أضف أول عرض إيجاري ليظهر في القائمة."
    >
      <template #actions>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="emit('create')">
          إضافة إيجار
        </v-btn>
      </template>
    </EmptyState>
    <v-data-table
      v-else
      :headers="headers"
      :items="rentals"
      item-value="id"
      density="compact"
      hover
      :row-props="rowProps"
      @click:row="onRowClick"
    >
      <template #item.name="{ item }">
        {{ item.name || `rentals ${item.code}` }}
      </template>
      <template #item.property_type="{ item }">
        {{ typeLabel[item.property_type] ?? item.property_type }}
      </template>
      <template #item.rent_price="{ item }">
        <span class="money">{{ formatMoney(item.rent_price) }}</span> دينار
      </template>
      <template #item.rent_period="{ item }">
        {{ periodLabel[item.rent_period] ?? item.rent_period }}
      </template>
      <template #item.district="{ item }">
        {{ item.district || "-" }}
      </template>
      <template #item.neighborhood="{ item }">
        {{ item.neighborhood || "-" }}
      </template>
      <template #item.area="{ item }">
        {{ item.area_value }} {{ item.area_unit }}
      </template>
      <template #item.rooms_count="{ item }">
        {{ item.rooms_count ?? "-" }}
      </template>
      <template #item.bathrooms_count="{ item }">
        {{ item.bathrooms_count ?? "-" }}
      </template>
      <template #item.status="{ item }">
        <StatusChip :status="item.status" />
      </template>
      <template #item.actions="{ item }">
        <div class="d-flex ga-1 justify-end">
          <v-btn
            :icon="favoriteIds?.has(item.id) ? 'mdi-heart' : 'mdi-heart-outline'"
            :color="favoriteIds?.has(item.id) ? 'error' : undefined"
            variant="text"
            title="المفضلة"
            @click="emit('favorite', item)"
          />
          <v-btn icon="mdi-eye" variant="text" title="عرض" @click="emit('view', item)" />
          <v-btn
            v-if="can('rentals.update')"
            icon="mdi-pencil"
            variant="text"
            title="تعديل"
            @click="emit('edit', item)"
          />
          <v-btn
            v-if="item.status === 'archived' && can('rentals.restore')"
            icon="mdi-archive-arrow-up-outline"
            color="success"
            variant="text"
            title="إرجاع من الأرشيف"
            @click="emit('restore', item)"
          />
          <v-btn
            v-else-if="item.status !== 'archived' && can('rentals.archive')"
            icon="mdi-archive-arrow-down-outline"
            color="warning"
            variant="text"
            title="أرشفة"
            @click="emit('archive', item)"
          />
          <v-btn
            v-if="can('rentals.delete')"
            icon="mdi-delete-outline"
            variant="text"
            color="error"
            title="حذف"
            @click="emit('delete', item)"
          />
        </div>
      </template>
    </v-data-table>
  </div>
</template>

<style scoped>
.dal-grid :deep(.v-table) {
  border-radius: 0;
}
.dal-grid :deep(.v-data-table__th) {
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  gap: 0.5rem;
}
.dal-grid :deep(.v-data-table__td) {
  font-size: 13px;
}
.dal-grid :deep(tbody tr) {
  cursor: pointer;
}
.dal-grid :deep(tr.dal-row--selected > td) {
  background: var(--dal-active);
}
.dal-grid :deep(tr.dal-row--selected > td:first-child) {
  border-inline-start: 3px solid rgb(var(--v-theme-primary));
}
</style>
