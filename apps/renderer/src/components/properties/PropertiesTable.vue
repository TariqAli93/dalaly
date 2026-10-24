<script setup lang="ts">
import { computed } from "vue";
import { VDataTable, VDataTableServer } from "vuetify/components";
import { formatMoney, formatPlot } from "../../utils/format";
import { neighborhoodOf } from "../../utils/exportProperty";
import { LIST_PAGE_SIZES } from "../../constants/domain";
import type {
  PropertyRecord,
  PropertySortKey,
  TableSortItem,
} from "../../types";
import PropertyActions from "./PropertyActions.vue";
import StatusChip from "../shared/StatusChip.vue";
import EmptyState from "../shared/EmptyState.vue";
import { amenitiesText } from "../../utils/amenities";
import RowThumbnail from "../shared/RowThumbnail.vue";
import * as imagesService from "../../services/images.service";
import { usePermissions } from "../../composables/usePermissions";
import { useThumbnailBackfill } from "../../composables/useThumbnailBackfill";

const props = defineProps<{
  properties: PropertyRecord[];
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
  view: [PropertyRecord];
  edit: [PropertyRecord];
  archive: [PropertyRecord];
  restore: [PropertyRecord];
  delete: [PropertyRecord];
  create: [];
  select: [PropertyRecord];
  clearFilters: [];
  options: [];
}>();

// نحافظ على حدث التحديد، ونفتح صفحة التفاصيل عند نقر الصف.
// نتجاهل النقر على أزرار الإجراءات كي تبقى وظائفها كما هي.
function onRowDbClick(event: MouseEvent, ctx: { item: PropertyRecord }) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a")) return;
  emit("select", ctx.item);
  emit("view", ctx.item);
}

function onRowClick(event: MouseEvent, ctx: { item: PropertyRecord }) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a")) return;
  emit("select", ctx.item);
}

function rowProps(ctx: { item: PropertyRecord }) {
  return ctx.item.id === props.selectedId ? { class: "dal-row--selected" } : {};
}

const { can } = usePermissions();
const { queueThumbnail } = useThumbnailBackfill();

// الصورة الرئيسية تأتي مع الصف: مصغّرتها، أو الأصل إن لم تُصنع بعد.
function rowImageUrl(item: PropertyRecord) {
  const image = item.primary_image;
  if (!image) return null;
  return image.thumbnail
    ? imagesService.thumbnailUrl(item.id, image.id)
    : imagesService.imageFileUrl(item.id, image.id);
}

// صورة رُفعت قبل المصغّرات: بعد عرض أصلها يصنع من يدير الصور مصغّرتها.
function onRowImageLoad(item: PropertyRecord) {
  const image = item.primary_image;
  if (!image || image.thumbnail || !can("properties.images.manage")) return;
  queueThumbnail({
    key: `property:${image.id}`,
    source: imagesService.imageFileUrl(item.id, image.id),
    save: (data) => imagesService.saveThumbnail(item.id, image.id, data),
  });
}

const ALL_HEADERS = [
  { title: "الصورة", key: "image", sortable: false },
  { title: "الاسم", key: "name", sortable: true },
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
// أعمدة يرتّبها الخادم؛ مفتاح العمود هو مفتاح الترتيب نفسه.
const SERVER_SORT_KEYS = new Set<string>([
  "name",
  "code",
  "property_type",
  "district",
  "area",
  "owner_name",
  "total_price",
  "status",
] satisfies PropertySortKey[]);

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
  <!-- شبكة بيانات مكتبية: لوح بحدّ رفيع يملأ العرض، لا بطاقة. -->
  <v-card variant="flat" class="dal-panel dal-grid">
    <v-skeleton-loader v-if="loading && !properties.length" type="table" />
    <!-- حالة فارغة مع فلاتر فعّالة: سبب واضح + إجراءات تصحيح -->
    <EmptyState
      v-else-if="!properties.length && hasFilters"
      class="dal-empty"
      icon="mdi-home-search-outline"
      title="لا توجد عقارات مطابقة للبحث والفلاتر الحالية"
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
    <component
      :is="serverMode ? VDataTableServer : VDataTable"
      v-else
      :headers="headers"
      :items="properties"
      item-value="id"
      density="compact"
      hover
      :loading="loading"
      :row-props="rowProps"
      v-bind="serverBindings"
      @dblclick:row="onRowDbClick"
      @click:row="onRowClick"
    >
      <template #item.image="{ item }">
        <RowThumbnail :src="rowImageUrl(item)" @load="onRowImageLoad(item)" />
      </template>
      <template #item.name="{ item }">
        <router-link :to="`/properties/${item.id}`" class="record-link">{{
          item.name || `عقار ${item.code}`
        }}</router-link>
      </template>
      <template #item.neighborhood="{ item }">
        {{ neighborhoodOf(item) || "-" }}
      </template>
      <template #item.plot="{ item }">
        {{ formatPlot(item.plot_number, item.plot_letter) || "-" }}
      </template>
      <template #item.area="{ item }">
        {{ item.area_value }} {{ item.area_unit }}
      </template>
      <template #item.amenities="{ item }">
        {{ amenitiesText(item.amenities) || "-" }}
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
    </component>
  </v-card>
</template>

<style scoped>
/* الجدول يملأ اللوح ويحمل زواياه؛ رأس ثابت الخلفية. */
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
/* الصف المحدد: خلفية خفيفة + شريط على الحافة الأمامية (يمين في RTL). */
.dal-grid :deep(tr.dal-row--selected > td) {
  background: var(--dal-selection);
}
.dal-grid :deep(tr.dal-row--selected > td:first-child) {
  border-inline-start: 3px solid rgb(var(--v-theme-primary));
}
</style>
