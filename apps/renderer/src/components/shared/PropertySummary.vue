<script setup lang="ts">
/**
 * ملخّص عرض عقاري في Details pane — مكوّن عرض بحت.
 * يستخدم بيانات الصف الحالية فقط (PropertyRecord) بلا أي استدعاء API.
 * الإجراءات تُصدَّر للأب ليعيد استخدام نفس معالجاته الحالية (فتح/تعديل/
 * أرشفة/إرجاع/حذف)، فلا يتغيّر أي منطق أعمال.
 */
import { computed } from "vue";
import { formatMoney, formatNumber, formatPlot } from "../../utils/format";
import { usePermissions } from "../../composables/usePermissions";
import StatusChip from "./StatusChip.vue";
import FavoriteButton from "../properties/FavoriteButton.vue";
import type { PropertyRecord } from "../../types";
import { amenitiesText } from "../../utils/amenities";
import PropertyExportMenu from "../properties/PropertyExportMenu.vue";

const props = defineProps<{ property: PropertyRecord }>();
const emit = defineEmits<{
  open: [];
  edit: [];
  archive: [];
  restore: [];
  delete: [];
  followup: [];
  close: [];
}>();

const { can } = usePermissions();

const phoneDigits = computed(() =>
  (props.property.owner_phone || "").replace(/\D/g, ""),
);
const location = computed(() =>
  [
    props.property.governorate,
    props.property.district,
    props.property.neighborhood,
  ]
    .filter(Boolean)
    .join(" · "),
);

// حقول الملخّص (label/value) من بيانات الصف مباشرة.
const rows = computed(() => {
  const p = props.property;
  const unit = p.area_unit || "";
  const items: Array<{ label: string; value: string; money?: boolean }> = [
    {
      label: "المساحة",
      value: `${formatNumber(p.area_value)} ${unit}`.trim(),
    },
    {
      label: "رقم القطعة",
      value: formatPlot(p.plot_number, p.plot_letter) || "—",
    },
    { label: "الواجهة", value: p.frontage || "—" },
    { label: "النزال", value: p.nazal || "—" },
    { label: "المميزات", value: amenitiesText(p.amenities) || "—" },
    { label: "الصفة القانونية", value: p.legal_type || "—" },
    {
      label: "سعر الوحدة",
      value: p.unit_price ? formatMoney(p.unit_price) : "—",
      money: Boolean(p.unit_price),
    },
  ];
  return items;
});
</script>

<template>
  <div class="ps">
    <!-- رأس الـ pane: الكود والنوع والحالة وزر الإغلاق -->
    <div class="ps__head">
      <div class="ps__title">
        <div class="ps__code">
          {{ property.name || `عقار ${property.code}` }}
        </div>
        <!-- الرمز وحده معزول اتجاهه؛ نوع العقار نص عربي. -->
        <div class="ps__type">
          <bdi>{{ property.code }}</bdi> · {{ property.property_type }}
        </div>
      </div>
      <div class="ps__tools">
        <StatusChip :status="property.status" />
        <FavoriteButton :property-id="property.id" />
        <v-btn
          icon="mdi-close"
          size="small"
          variant="text"
          aria-label="إغلاق الملخّص (Esc)"
          @click="emit('close')"
        />
      </div>
    </div>

    <v-divider />

    <!-- السعر الإجمالي بارز -->
    <div class="ps__price">
      <div class="ps__price-label">السعر الإجمالي</div>
      <div class="ps__price-value">
        <span class="money">{{ formatMoney(property.total_price) }}</span> د.ع
        <v-chip
          v-if="property.is_negotiable"
          size="x-small"
          variant="tonal"
          label
        >
          قابل للتفاوض
        </v-chip>
      </div>
    </div>

    <!-- المالك والاتصال -->
    <div class="ps__section">
      <div class="ps__label">المالك</div>
      <div class="ps__owner">{{ property.owner_name }}</div>
      <div class="ps__phone">
        <span class="money">{{ property.owner_phone }}</span>
        <a
          v-if="phoneDigits"
          :href="`tel:${phoneDigits}`"
          class="ps__call"
          title="اتصال"
          :aria-label="`اتصال بـ ${property.owner_name}`"
        >
          <v-icon icon="mdi-phone" size="16" />
        </a>
        <a
          v-if="phoneDigits"
          :href="`https://wa.me/${phoneDigits}`"
          target="_blank"
          rel="noopener"
          class="ps__call"
          title="واتساب"
          :aria-label="`مراسلة ${property.owner_name} عبر واتساب`"
        >
          <v-icon icon="mdi-whatsapp" size="16" />
        </a>
      </div>
    </div>

    <!-- الموقع -->
    <div v-if="location" class="ps__section">
      <div class="ps__label">الموقع</div>
      <div>{{ location }}</div>
      <div v-if="property.nearest_landmark" class="ps__muted">
        {{ property.nearest_landmark }}
      </div>
    </div>

    <!-- تفاصيل مختصرة -->
    <div class="ps__grid">
      <div v-for="row in rows" :key="row.label" class="ps__cell">
        <div class="ps__label">{{ row.label }}</div>
        <div :class="{ money: row.money }">{{ row.value }}</div>
      </div>
    </div>

    <v-divider />

    <!-- الإجراءات الرئيسية بجانب البيانات -->
    <div class="ps__actions">
      <v-btn color="primary" block @click="emit('open')">
        فتح التفاصيل الكاملة
      </v-btn>
      <v-btn
        v-if="can('followups.create')"
        variant="tonal"
        block
        prepend-icon="mdi-phone-plus-outline"
        @click="emit('followup')"
      >
        تسجيل متابعة
      </v-btn>
      <PropertyExportMenu
        v-if="can('properties.export')"
        :property="property"
      />
      <div class="ps__actions-row">
        <v-btn
          v-if="can('properties.update')"
          variant="tonal"
          prepend-icon="mdi-pencil"
          @click="emit('edit')"
        >
          تعديل
        </v-btn>
        <v-btn
          v-if="property.status === 'archived' && can('properties.restore')"
          variant="text"
          color="success"
          prepend-icon="mdi-archive-arrow-up-outline"
          @click="emit('restore')"
        >
          إرجاع
        </v-btn>
        <v-btn
          v-else-if="
            property.status !== 'archived' && can('properties.archive')
          "
          variant="text"
          prepend-icon="mdi-archive-arrow-down-outline"
          @click="emit('archive')"
        >
          أرشفة
        </v-btn>
        <v-spacer />
        <v-btn
          v-if="can('properties.delete')"
          variant="text"
          color="error"
          icon="mdi-delete-outline"
          aria-label="حذف"
          title="حذف"
          @click="emit('delete')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ps {
  padding: 10px 12px 16px;
}
.ps__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0px;
  padding-bottom: 8px;
}
.ps__title {
  min-width: 0;
}
.ps__tools {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ps__code {
  font-size: calc(15px * var(--dal-font-scale));
  font-weight: 700;
}
.ps__type {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.ps__price {
  padding: 10px 2px;
}
.ps__price-label {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.ps__price-value {
  font-size: calc(17px * var(--dal-font-scale));
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ps__section {
  padding: 8px 2px;
  border-top: 1px solid var(--dal-stroke);
}
.ps__label {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
  margin-bottom: 2px;
}
.ps__owner {
  font-weight: 600;
}
.ps__phone {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ps__call {
  display: inline-flex;
  color: rgb(var(--v-theme-primary-text));
  text-decoration: none;
}
.ps__muted {
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.ps__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 10px 2px;
  border-top: 1px solid var(--dal-stroke);
}
.ps__cell {
  min-width: 0;
}
.ps__actions {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ps__actions-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
