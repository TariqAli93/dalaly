<script setup lang="ts">
import { computed } from "vue";
import { VDataTable, VDataTableServer } from "vuetify/components";
import {
  LIST_PAGE_SIZES,
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
} from "../../constants/domain";
import { formatMoney } from "../../utils/format";
import type { RentalRecord, RentalSortKey, TableSortItem } from "../../types";
import StatusChip from "../shared/StatusChip.vue";
import EmptyState from "../shared/EmptyState.vue";
import { usePermissions } from "../../composables/usePermissions";
import { useThumbnailBackfill } from "../../composables/useThumbnailBackfill";
import { amenitiesText } from "../../utils/amenities";
import RowThumbnail from "../shared/RowThumbnail.vue";
import * as rentalsService from "../../services/rentals.service";

const props = defineProps<{
  rentals: RentalRecord[];
  favoriteIds?: Set<number>;
  loading?: boolean;
  selectedId?: number | null;
  hasFilters?: boolean;
  // مع total يصبح الجدول صفحة من الخادم (v-data-table-server) والصفحة
  // والحجم والترتيب بيد الأب؛ بدونه يقسّم ويرتّب القائمة الممرّرة محلياً.
  total?: number;
}>();
const page = defineModel<number>("page", { default: 1 });
const itemsPerPage = defineModel<number>("itemsPerPage", { default: 10 });
const sortBy = defineModel<TableSortItem[]>("sortBy", { default: () => [] });

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
  options: [];
}>();

const { can } = usePermissions();

const typeLabel = RENTAL_PROPERTY_LABELS;
const periodLabel = RENT_PERIOD_LABELS;

function onRowClick(event: MouseEvent, ctx: { item: RentalRecord }) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a")) return;
  emit("select", ctx.item);
}

function rowProps(ctx: { item: RentalRecord }) {
  return ctx.item.id === props.selectedId ? { class: "dal-row--selected" } : {};
}

const { queueThumbnail } = useThumbnailBackfill();

// الصورة الرئيسية تأتي مع الصف: مصغّرتها، أو الأصل إن لم تُصنع بعد.
function rowImageUrl(item: RentalRecord) {
  const image = item.primary_image;
  if (!image) return null;
  return image.thumbnail
    ? rentalsService.rentalThumbnailUrl(item.id, image.id)
    : rentalsService.rentalImageUrl(item.id, image.id);
}

// صورة رُفعت قبل المصغّرات: بعد عرض أصلها يصنع من يدير الصور مصغّرتها.
function onRowImageLoad(item: RentalRecord) {
  const image = item.primary_image;
  if (!image || image.thumbnail || !can("rentals.images.manage")) return;
  queueThumbnail({
    key: `rental:${image.id}`,
    source: rentalsService.rentalImageUrl(item.id, image.id),
    save: (data) => rentalsService.saveRentalThumbnail(item.id, image.id, data),
  });
}

const ALL_HEADERS = [
  { title: "الصورة", key: "image", sortable: false },
  { title: "الاسم", key: "name", sortable: true },
  { title: "الكود", key: "code", sortable: true },
  { title: "النوع", key: "property_type" },
  { title: "الإيجار", key: "rent_price" },
  { title: "الفترة", key: "rent_period" },
  { title: "المنطقة", key: "district" },
  { title: "الحي", key: "neighborhood" },
  { title: "المساحة", key: "area" },
  { title: "المميزات", key: "amenities" },
  { title: "الغرف", key: "rooms_count" },
  { title: "الحمامات", key: "bathrooms_count" },
  { title: "المالك", key: "owner_name" },
  { title: "الحالة", key: "status" },
  { title: "", key: "actions", sortable: false, align: "end" as const },
];
// أعمدة يرتّبها الخادم؛ مفتاح العمود هو مفتاح الترتيب نفسه.
const SERVER_SORT_KEYS = new Set<string>([
  "name",
  "code",
  "property_type",
  "rent_price",
  "district",
  "area",
  "rooms_count",
  "bathrooms_count",
  "owner_name",
  "status",
] satisfies RentalSortKey[]);

const serverMode = computed(() => props.total !== undefined);
const headers = computed(() =>
  serverMode.value
    ? ALL_HEADERS.map((header) =>
        SERVER_SORT_KEYS.has(header.key)
          ? header
          : { ...header, sortable: false },
      )
    : ALL_HEADERS,
);
const serverBindings = computed(() =>
  serverMode.value
    ? {
        itemsLength: props.total,
        page: page.value,
        "onUpdate:page": (value: number) => (page.value = value),
        itemsPerPage: itemsPerPage.value,
        "onUpdate:itemsPerPage": (value: number) =>
          (itemsPerPage.value = value),
        sortBy: sortBy.value,
        "onUpdate:sortBy": (value: TableSortItem[]) => (sortBy.value = value),
        "onUpdate:options": () => emit("options"),
        itemsPerPageOptions: LIST_PAGE_SIZES,
      }
    : {},
);
</script>

<template>
  <v-card variant="flat" class="dal-panel dal-grid">
    <v-skeleton-loader v-if="loading && !rentals.length" type="table" />
    <EmptyState
      v-else-if="!rentals.length && hasFilters"
      class="dal-empty"
      icon="mdi-home-search-outline"
      title="لا توجد إيجارات مطابقة للبحث والفلاتر الحالية"
      text="جرّب توسيع البحث أو إزالة بعض الفلاتر."
    >
      <template #actions>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-filter-remove"
          @click="emit('clearFilters')"
        >
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
    <component
      :is="serverMode ? VDataTableServer : VDataTable"
      v-else
      :headers="headers"
      :items="rentals"
      item-value="id"
      density="compact"
      hover
      :loading="loading"
      :row-props="rowProps"
      v-bind="serverBindings"
      @click:row="onRowClick"
    >
      <template #item.image="{ item }">
        <RowThumbnail :src="rowImageUrl(item)" @load="onRowImageLoad(item)" />
      </template>
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
      <template #item.amenities="{ item }">
        {{ amenitiesText(item.amenities) || "-" }}
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
            :icon="
              favoriteIds?.has(item.id) ? 'mdi-heart' : 'mdi-heart-outline'
            "
            :color="favoriteIds?.has(item.id) ? 'error' : undefined"
            variant="text"
            title="المفضلة"
            @click="emit('favorite', item)"
          />
          <v-btn
            icon="mdi-eye"
            variant="text"
            title="عرض"
            @click="emit('view', item)"
          />
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
    </component>
  </v-card>
</template>

<style scoped>
.dal-grid :deep(.v-table) {
  border-radius: 12px;
}
.dal-grid :deep(.v-data-table__th) {
  font-size: calc(12.5px * var(--dal-font-scale));
  font-weight: 700;
  white-space: nowrap;
  gap: 0.5rem;
}
.dal-grid :deep(.v-data-table__td) {
  font-size: calc(12px * var(--dal-font-scale));
  white-space: nowrap;
}
.dal-grid :deep(tbody tr) {
  cursor: pointer;
}
.dal-grid :deep(tr.dal-row--selected > td) {
  background: var(--dal-selection);
}
.dal-grid :deep(tr.dal-row--selected > td:first-child) {
  border-inline-start: 3px solid rgb(var(--v-theme-primary));
}
</style>
