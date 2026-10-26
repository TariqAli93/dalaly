<script setup lang="ts">
/**
 * ملخّص عرض البيع المحدد في اللوحة الجانبية، من بيانات الصف نفسه بلا طلب.
 * الأوامر تُصدَّر للأب ليعيد استخدام معالجاته (فتح، تعديل، أرشفة، حذف).
 */
import { computed } from "vue";
import { formatMoney, formatNumber, formatPlot } from "../../utils/format";
import { usePermissions } from "../../composables/usePermissions";
import StatusChip from "./StatusChip.vue";
import PhoneLink from "./PhoneLink.vue";
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

const location = computed(() =>
  [
    props.property.governorate,
    props.property.district,
    props.property.neighborhood,
  ]
    .filter(Boolean)
    .join(" · "),
);

const rows = computed(() => {
  const p = props.property;
  return [
    {
      label: "المساحة",
      value: `${formatNumber(p.area_value)} ${p.area_unit || ""}`.trim(),
    },
    {
      label: "رقم القطعة",
      value: formatPlot(p.plot_number, p.plot_letter) || "—",
    },
    { label: "الواجهة", value: p.frontage || "—" },
    { label: "النزال", value: p.nazal || "—" },
    { label: "الصفة القانونية", value: p.legal_type || "—" },
    {
      label: "سعر الوحدة",
      value: p.unit_price ? `${formatMoney(p.unit_price)} د.ع` : "—",
    },
    {
      label: "المميزات",
      value: amenitiesText(p.amenities) || "—",
      wide: true,
    },
  ];
});
</script>

<template>
  <div class="dal-pane">
    <div class="dal-pane__head">
      <div class="dal-pane__title">
        <div class="dal-pane__name">
          {{ property.name || `عقار ${property.code}` }}
        </div>
        <div class="dal-pane__sub">
          <bdi>{{ property.code }}</bdi> · {{ property.property_type }}
        </div>
      </div>
      <div class="dal-pane__tools">
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

    <div class="dal-pane__price">
      <div class="dal-pane__label">السعر الإجمالي</div>
      <div class="dal-pane__price-value">
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

    <div class="dal-pane__section">
      <div class="dal-pane__label">المالك</div>
      <router-link
        v-if="property.owner_person_id && can('people.read')"
        :to="`/clients/${property.owner_person_id}`"
        class="record-link dal-pane__strong"
        >{{ property.owner_name }}</router-link
      >
      <div v-else class="dal-pane__strong">{{ property.owner_name }}</div>
      <PhoneLink :phone="property.owner_phone" :name="property.owner_name" />
    </div>

    <div v-if="location" class="dal-pane__section">
      <div class="dal-pane__label">الموقع</div>
      <div>{{ location }}</div>
      <div v-if="property.nearest_landmark" class="dal-pane__muted">
        {{ property.nearest_landmark }}
      </div>
    </div>

    <dl class="dal-pane__grid">
      <div
        v-for="row in rows"
        :key="row.label"
        :class="{ 'dal-pane__wide': row.wide }"
      >
        <dt class="dal-pane__label">{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>

    <div class="dal-pane__actions">
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
      <div class="dal-pane__row">
        <v-btn
          v-if="can('properties.update')"
          variant="tonal"
          prepend-icon="mdi-pencil-outline"
          @click="emit('edit')"
        >
          تعديل
        </v-btn>
        <v-btn
          v-if="property.status === 'archived' && can('properties.restore')"
          variant="text"
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
          aria-label="حذف العرض"
          title="حذف"
          @click="emit('delete')"
        />
      </div>
    </div>
  </div>
</template>
