<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { formatMoney, formatNumber, formatPlot } from "../../utils/format";
import { neighborhoodOf } from "../../utils/exportProperty";
import type { PropertyRecord, TableSortItem } from "../../types";
import DataGrid from "../shared/DataGrid.vue";
import StatusChip from "../shared/StatusChip.vue";
import RowThumbnail from "../shared/RowThumbnail.vue";
import type { DataGridApi, GridHeader, RowAction } from "../shared/grid";
import * as imagesService from "../../services/images.service";
import { getErrorMessage } from "../../services/api.service";
import { usePermissions } from "../../composables/usePermissions";
import { useFavorites } from "../../composables/useFavorites";
import { useSnackbar } from "../../composables/useSnackbar";
import { useThumbnailBackfill } from "../../composables/useThumbnailBackfill";

const props = defineProps<{
  properties: PropertyRecord[];
  loading?: boolean;
  error?: string | null;
  selectedId?: number | null;
  hasFilters?: boolean;
  /** يُظهر «تصدير ملف نصي والصور» في أوامر الصف. */
  canExport?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  // مع total يصبح الجدول صفحة من الخادم (v-data-table-server) والصفحة
  // والحجم والترتيب بيد الأب؛ بدونه يقسّم ويرتّب القائمة الممرّرة محلياً.
  total?: number;
}>();
const page = defineModel<number>("page", { default: 1 });
const itemsPerPage = defineModel<number>("itemsPerPage", { default: 25 });
const sortBy = defineModel<TableSortItem[]>("sortBy", { default: () => [] });

const emit = defineEmits<{
  view: [PropertyRecord];
  edit: [PropertyRecord];
  archive: [PropertyRecord];
  restore: [PropertyRecord];
  delete: [PropertyRecord];
  export: [PropertyRecord];
  create: [];
  select: [PropertyRecord];
  clearFilters: [];
  retry: [];
  options: [];
}>();

const grid = useTemplateRef<DataGridApi>("grid");
const { can } = usePermissions();
const { isFavorite, toggleFavorite } = useFavorites();
const { notifyError } = useSnackbar();
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

const titleOf = (item: PropertyRecord) => item.name || `عقار ${item.code}`;
// الاسم الافتراضي يحمل الرمز أصلاً ("عقار L-0003")، فلا يُكرَّر تحته.
const showCode = (item: PropertyRecord) => !titleOf(item).includes(item.code);
const locationOf = (item: PropertyRecord) =>
  [item.district, neighborhoodOf(item)].filter(Boolean).join(" · ");

// تسعة أعمدة بعرض 1366px: الواجهة والنزال في اللوحة الجانبية، والمالك والنوع
// والموقع والمساحة تُخفى بأولويتها حين يضيق اللوح. العملة في رأس عمود السعر.
const HEADERS: GridHeader[] = [
  { key: "image", title: "", width: 52 },
  { key: "name", title: "العرض", sortable: true },
  { key: "property_type", title: "النوع", sortable: true, priority: 3 },
  { key: "district", title: "الموقع", sortable: true, priority: 3 },
  { key: "plot", title: "القطعة" },
  { key: "area", title: "المساحة", sortable: true, align: "end", priority: 3 },
  { key: "owner_name", title: "المالك", sortable: true, priority: 2 },
  { key: "total_price", title: "السعر (د.ع)", sortable: true, align: "end" },
  { key: "status", title: "الحالة", sortable: true },
  { key: "actions", title: "", align: "end", width: 96 },
];
// في الصفحة المحلية (المفضلة) يرتّب Vuetify بمفتاح العمود؛ هذه لا تقابل حقلاً.
const CLIENT_UNSORTABLE = new Set(["district", "area"]);
const headers = computed(() =>
  props.total === undefined
    ? HEADERS.map((header) =>
        CLIENT_UNSORTABLE.has(header.key)
          ? { ...header, sortable: false }
          : header,
      )
    : HEADERS,
);

async function toggleFavoriteOf(item: PropertyRecord) {
  try {
    await toggleFavorite(item.id);
  } catch (cause) {
    notifyError(getErrorMessage(cause));
  }
}

function actionsOf(item: PropertyRecord): RowAction[] {
  const favorite = isFavorite(item.id);
  const actions: RowAction[] = [
    {
      key: "favorite",
      label: favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة",
      icon: favorite ? "mdi-heart" : "mdi-heart-outline",
      color: favorite ? "error" : undefined,
      pressed: favorite,
      inline: true,
      run: () => void toggleFavoriteOf(item),
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
  if (can("properties.update"))
    actions.push({
      key: "edit",
      label: "تعديل",
      icon: "mdi-pencil-outline",
      inline: true,
      run: () => emit("edit", item),
    });
  if (props.canExport && can("properties.export"))
    actions.push({
      key: "export",
      label: "تصدير ملف نصي والصور",
      icon: "mdi-folder-download-outline",
      run: () => emit("export", item),
    });
  if (item.status === "archived" && can("properties.restore"))
    actions.push({
      key: "restore",
      label: "إرجاع من الأرشيف",
      icon: "mdi-archive-arrow-up-outline",
      run: () => emit("restore", item),
    });
  else if (item.status !== "archived" && can("properties.archive"))
    actions.push({
      key: "archive",
      label: "أرشفة",
      icon: "mdi-archive-arrow-down-outline",
      run: () => emit("archive", item),
    });
  if (can("properties.delete"))
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
    grid-key="properties"
    table-label="جدول عروض البيع"
    :items="properties"
    :headers="headers"
    :total="total"
    :loading="loading"
    :error="error"
    :selected-id="selectedId"
    :has-filters="hasFilters"
    :actions="actionsOf"
    :row-label="titleOf"
    :empty="{
      icon: 'mdi-home-plus-outline',
      title: emptyTitle ?? 'لا توجد عروض بعد',
      text: emptyText ?? 'أضف أول عرض عقاري ليظهر في القائمة.',
    }"
    :no-match="{ title: 'لا توجد عروض مطابقة للبحث والفلاتر الحالية' }"
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
      <div class="pt-name">
        <router-link
          :to="`/properties/${item.id}`"
          class="record-link pt-name__title"
          tabindex="-1"
          :title="titleOf(item)"
          @click="grid?.remember(item.id)"
          >{{ titleOf(item) }}</router-link
        >
        <bdi v-if="showCode(item)" class="pt-name__code">{{ item.code }}</bdi>
      </div>
    </template>
    <template #item.district="{ item }">
      <span class="pt-clip" :title="locationOf(item)">{{
        locationOf(item) || "—"
      }}</span>
    </template>
    <template #item.plot="{ item }">
      <!-- dir=auto لا bdi: الرقم مع حرف عربي ("88 أ") يُقرأ من اليمين. -->
      <span dir="auto">{{
        formatPlot(item.plot_number, item.plot_letter) || "—"
      }}</span>
    </template>
    <template #item.area="{ item }">
      <span class="money">{{ formatNumber(item.area_value) }}</span>
      {{ item.area_unit }}
    </template>
    <template #item.owner_name="{ item }">
      <span class="pt-clip" :title="item.owner_name">{{
        item.owner_name || "—"
      }}</span>
    </template>
    <template #item.total_price="{ item }">
      <span class="money pt-price">{{ formatMoney(item.total_price) }}</span>
    </template>
    <template #item.status="{ item }">
      <StatusChip :status="item.status" />
    </template>
    <template #empty-actions>
      <v-btn
        v-if="can('properties.create')"
        color="primary"
        prepend-icon="mdi-plus"
        @click="emit('create')"
        >إضافة عرض</v-btn
      >
    </template>
  </DataGrid>
</template>

<style scoped>
.pt-name {
  display: flex;
  flex-direction: column;
  max-width: 240px;
  line-height: 1.3;
}
.pt-name__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pt-name__code {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
  align-self: flex-start;
}
.pt-clip {
  display: inline-block;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.pt-price {
  font-weight: 700;
}
</style>
