<script setup lang="ts">
import { formatMoney, formatPlot } from "../../utils/format";
import { neighborhoodOf } from "../../utils/exportProperty";
import type { PropertyRecord } from "../../types";
import PropertyActions from "./PropertyActions.vue";
import StatusChip from "../shared/StatusChip.vue";
import EmptyState from "../shared/EmptyState.vue";

const props = defineProps<{
  properties: PropertyRecord[];
  loading?: boolean;
  selectedId?: number | null;
  hasFilters?: boolean;
}>();

const emit = defineEmits<{
  view: [PropertyRecord];
  edit: [PropertyRecord];
  archive: [PropertyRecord];
  restore: [PropertyRecord];
  delete: [PropertyRecord];
  create: [];
  select: [PropertyRecord];
  clearFilters: [];
}>();

// نقر الصف يحدّده لعرضه في Details pane — سلوك إضافي لا يغيّر أي حدث حالي.
// نتجاهل النقر على أزرار الإجراءات كي تبقى وظائفها كما هي.
function onRowClick(event: MouseEvent, ctx: { item: PropertyRecord }) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a")) return;
  emit("select", ctx.item);
}

function rowProps(ctx: { item: PropertyRecord }) {
  return ctx.item.id === props.selectedId ? { class: "dal-row--selected" } : {};
}

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
  <!-- شبكة بيانات مكتبية: لوح بحدّ رفيع يملأ العرض، لا بطاقة. -->
  <div class="dal-panel dal-grid">
    <v-skeleton-loader v-if="loading" type="table" />
    <!-- حالة فارغة مع فلاتر فعّالة: سبب واضح + إجراءات تصحيح -->
    <EmptyState
      v-else-if="!properties.length && hasFilters"
      class="dal-empty"
      icon="mdi-home-search-outline"
      title="لا توجد عقارات مطابقة للبحث والفلاتر الحالية"
      text="جرّب توسيع البحث أو إزالة بعض الفلاتر."
    >
      <template #actions>
        <v-btn variant="tonal" prepend-icon="mdi-filter-remove" @click="emit('clearFilters')">
          مسح الفلاتر
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="emit('create')">
          إضافة عرض
        </v-btn>
      </template>
    </EmptyState>
    <!-- لا توجد بيانات أصلاً (بلا فلاتر) -->
    <EmptyState
      v-else-if="!properties.length"
      class="dal-empty"
      icon="mdi-home-plus-outline"
      title="لا توجد عروض بعد"
      text="أضف أول عرض عقاري ليظهر في القائمة."
    >
      <template #actions>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="emit('create')">
          إضافة عرض
        </v-btn>
      </template>
    </EmptyState>
    <v-data-table
      v-else
      :headers="headers"
      :items="properties"
      item-value="id"
      density="compact"
      hover
      :row-props="rowProps"
      @click:row="onRowClick"
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
        <StatusChip :status="item.status" />
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
  </div>
</template>

<style scoped>
/* الجدول يملأ اللوح ويحمل زواياه؛ رأس ثابت الخلفية. */
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
/* الصف المحدد: خلفية خفيفة + شريط على الحافة الأمامية (يمين في RTL). */
.dal-grid :deep(tr.dal-row--selected > td) {
  background: var(--dal-active);
}
.dal-grid :deep(tr.dal-row--selected > td:first-child) {
  border-inline-start: 3px solid rgb(var(--v-theme-primary));
}
</style>
