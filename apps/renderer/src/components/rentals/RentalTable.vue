<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import {
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
} from "../../constants/domain";
import { formatMoney, formatNumber } from "../../utils/format";
import type { RentalRecord, TableSortItem } from "../../types";
import DataGrid from "../shared/DataGrid.vue";
import StatusChip from "../shared/StatusChip.vue";
import RowThumbnail from "../shared/RowThumbnail.vue";
import type { DataGridApi, GridHeader, RowAction } from "../shared/grid";
import { usePermissions } from "../../composables/usePermissions";
import { useThumbnailBackfill } from "../../composables/useThumbnailBackfill";
import * as rentalsService from "../../services/rentals.service";

/**
 * جدول العروض الإيجارية على DataGrid، بأعمدة جدول عروض البيع نفسها: الاسم فوق
 * الرمز، والسعر مع فترته، والمميزات وعدد الحمامات والطوابق في اللوحة الجانبية
 * وصفحة السجل. الأعمدة الثانوية تُخفى بأولويتها حين يضيق اللوح.
 */
const props = defineProps<{
  rentals: RentalRecord[];
  favoriteIds?: Set<number>;
  loading?: boolean;
  error?: string | null;
  selectedId?: number | null;
  hasFilters?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  // مع total يصبح الجدول صفحة من الخادم والصفحة والحجم والترتيب بيد الأب؛
  // بدونه يقسّم ويرتّب القائمة الممرّرة محلياً (المفضلة).
  total?: number;
}>();
const page = defineModel<number>("page", { default: 1 });
const itemsPerPage = defineModel<number>("itemsPerPage", { default: 25 });
const sortBy = defineModel<TableSortItem[]>("sortBy", { default: () => [] });

const emit = defineEmits<{
  view: [RentalRecord];
  edit: [RentalRecord];
  archive: [RentalRecord];
  restore: [RentalRecord];
  delete: [RentalRecord];
  favorite: [RentalRecord];
  export: [RentalRecord];
  create: [];
  select: [RentalRecord];
  clearFilters: [];
  retry: [];
  options: [];
}>();

const grid = useTemplateRef<DataGridApi>("grid");
const { can } = usePermissions();
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

const titleOf = (item: RentalRecord) => item.name || `إيجار ${item.code}`;
const showCode = (item: RentalRecord) => !titleOf(item).includes(item.code);
const locationOf = (item: RentalRecord) =>
  [item.district, item.neighborhood].filter(Boolean).join(" · ");
const typeOf = (item: RentalRecord) =>
  RENTAL_PROPERTY_LABELS[item.property_type] ?? item.property_type;
const periodOf = (item: RentalRecord) =>
  RENT_PERIOD_LABELS[item.rent_period] ?? item.rent_period;

// مفاتيح الأعمدة القابلة للترتيب هي مفاتيح الترتيب في الخادم.
const HEADERS: GridHeader[] = [
  { key: "image", title: "", width: 52 },
  { key: "name", title: "العرض", sortable: true },
  { key: "property_type", title: "النوع", sortable: true, priority: 3 },
  { key: "district", title: "الموقع", sortable: true, priority: 3 },
  { key: "area", title: "المساحة", sortable: true, align: "end", priority: 3 },
  {
    key: "rooms_count",
    title: "الغرف",
    sortable: true,
    align: "end",
    priority: 2,
  },
  { key: "owner_name", title: "المالك", sortable: true, priority: 2 },
  { key: "rent_price", title: "الإيجار (د.ع)", sortable: true, align: "end" },
  { key: "status", title: "الحالة", sortable: true },
  { key: "actions", title: "", align: "end", width: 96 },
];
// في الصفحة المحلية (المفضلة) يرتّب Vuetify بمفتاح العمود؛ هذه لا تقابل حقلاً.
const CLIENT_UNSORTABLE = new Set(["area"]);
const headers = computed(() =>
  props.total === undefined
    ? HEADERS.map((header) =>
        CLIENT_UNSORTABLE.has(header.key)
          ? { ...header, sortable: false }
          : header,
      )
    : HEADERS,
);

function actionsOf(item: RentalRecord): RowAction[] {
  const favorite = props.favoriteIds?.has(item.id) ?? false;
  const actions: RowAction[] = [
    {
      key: "favorite",
      label: favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة",
      icon: favorite ? "mdi-heart" : "mdi-heart-outline",
      color: favorite ? "error" : undefined,
      pressed: favorite,
      inline: true,
      run: () => emit("favorite", item),
    },
    {
      key: "open",
      label: "فتح التفاصيل",
      icon: "mdi-open-in-app",
      run: () => {
        grid.value?.remember(item.id);
        emit("view", item);
      },
    },
  ];
  if (can("rentals.update"))
    actions.push({
      key: "edit",
      label: "تعديل",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => emit("edit", item),
    });
  if (can("rentals.export"))
    actions.push({
      key: "export",
      label: "تصدير ملف نصي والصور",
      icon: "mdi-folder-download-outline",
      run: () => emit("export", item),
    });
  if (item.status === "archived" && can("rentals.restore"))
    actions.push({
      key: "restore",
      label: "إرجاع من الأرشيف",
      icon: "mdi-archive-arrow-up-outline",
      run: () => emit("restore", item),
    });
  else if (item.status !== "archived" && can("rentals.archive"))
    actions.push({
      key: "archive",
      label: "أرشفة",
      icon: "mdi-archive-arrow-down-outline",
      run: () => emit("archive", item),
    });
  if (can("rentals.delete"))
    actions.push({
      key: "delete",
      label: "حذف",
      icon: "mdi-delete-outline",
      danger: true,
      run: () => emit("delete", item),
    });
  return actions;
}

defineExpose({
  focusFirstRow: () => grid.value?.focusFirstRow(),
  focusRow: (id: number) => grid.value?.focusRow(id),
});
</script>

<template>
  <DataGrid
    ref="grid"
    v-model:page="page"
    v-model:items-per-page="itemsPerPage"
    v-model:sort-by="sortBy"
    grid-key="rentals"
    table-label="جدول عروض الإيجار"
    :items="rentals"
    :headers="headers"
    :total="total"
    :loading="loading"
    :error="error"
    :selected-id="selectedId"
    :has-filters="hasFilters"
    :actions="actionsOf"
    :row-label="titleOf"
    :empty="{
      icon: 'mdi-key-plus',
      title: emptyTitle ?? 'لا توجد عروض إيجار بعد',
      text: emptyText ?? 'أضف أول عرض إيجاري ليظهر في القائمة.',
    }"
    :no-match="{ title: 'لا توجد عروض إيجار مطابقة للبحث والفلاتر الحالية' }"
    @open="emit('view', $event)"
    @select="emit('select', $event)"
    @retry="emit('retry')"
    @clear-filters="emit('clearFilters')"
    @options="emit('options')"
  >
    <template #item.image="{ item }">
      <RowThumbnail :src="rowImageUrl(item)" @load="onRowImageLoad(item)" />
    </template>
    <template #item.name="{ item }">
      <div class="dal-cell-name">
        <router-link
          :to="`/rentals/${item.id}`"
          class="record-link"
          tabindex="-1"
          :title="titleOf(item)"
          @click="grid?.remember(item.id)"
          >{{ titleOf(item) }}</router-link
        >
        <bdi v-if="showCode(item)">{{ item.code }}</bdi>
      </div>
    </template>
    <template #item.property_type="{ item }">{{ typeOf(item) }}</template>
    <template #item.district="{ item }">
      <span class="dal-clip" :title="locationOf(item)">{{
        locationOf(item) || "—"
      }}</span>
    </template>
    <template #item.area="{ item }">
      <span class="money">{{ formatNumber(item.area_value) }}</span>
      {{ item.area_unit }}
    </template>
    <template #item.rooms_count="{ item }">
      <span class="money">{{ item.rooms_count ?? "—" }}</span>
    </template>
    <template #item.owner_name="{ item }">
      <span class="dal-clip" :title="item.owner_name">{{
        item.owner_name || "—"
      }}</span>
    </template>
    <template #item.rent_price="{ item }">
      <div class="rt-price">
        <span class="money">{{ formatMoney(item.rent_price) }}</span>
        <small>{{ periodOf(item) }}</small>
      </div>
    </template>
    <template #item.status="{ item }">
      <StatusChip :status="item.status" />
    </template>
    <template #empty-actions>
      <v-btn
        v-if="can('rentals.create')"
        color="primary"
        prepend-icon="mdi-plus"
        @click="emit('create')"
        >إضافة عرض إيجار</v-btn
      >
    </template>
  </DataGrid>
</template>

<style scoped>
.rt-price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
}
.rt-price .money {
  font-weight: 700;
}
.rt-price small {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>
