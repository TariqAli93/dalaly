<script setup lang="ts">
import { computed } from "vue";
import {
  RENT_PERIOD_LABELS,
  RENTAL_PROPERTY_LABELS,
} from "../../constants/domain";
import { formatMoney, formatNumber } from "../../utils/format";
import { usePermissions } from "../../composables/usePermissions";
import StatusChip from "../shared/StatusChip.vue";
import PhoneLink from "../shared/PhoneLink.vue";
import type { RentalRecord } from "../../types";
import { amenitiesText } from "../../utils/amenities";
import RentalExportMenu from "./RentalExportMenu.vue";

/**
 * ملخّص العرض الإيجاري المحدد في اللوحة الجانبية، من بيانات الصف نفسه بلا
 * طلب. الأوامر تُصدَّر للأب ليعيد استخدام معالجاته.
 */
const props = defineProps<{ rental: RentalRecord; favorite?: boolean }>();
const emit = defineEmits<{
  open: [];
  edit: [];
  archive: [];
  restore: [];
  delete: [];
  favorite: [];
  followup: [];
  close: [];
}>();
const { can } = usePermissions();

const location = computed(() =>
  [props.rental.governorate, props.rental.district, props.rental.neighborhood]
    .filter(Boolean)
    .join(" · "),
);
const rows = computed(() => {
  const r = props.rental;
  return [
    {
      label: "المساحة",
      value: `${formatNumber(r.area_value)} ${r.area_unit ?? ""}`.trim(),
    },
    { label: "الغرف", value: r.rooms_count ?? "—" },
    { label: "الحمامات", value: r.bathrooms_count ?? "—" },
    { label: "الطوابق", value: r.floors_count ?? "—" },
    { label: "المميزات", value: amenitiesText(r.amenities) || "—", wide: true },
  ];
});
</script>

<template>
  <div class="dal-pane">
    <div class="dal-pane__head">
      <div class="dal-pane__title">
        <div class="dal-pane__name">
          {{ rental.name || `إيجار ${rental.code}` }}
        </div>
        <div class="dal-pane__sub">
          <bdi>{{ rental.code }}</bdi> ·
          {{
            RENTAL_PROPERTY_LABELS[rental.property_type] ?? rental.property_type
          }}
        </div>
      </div>
      <div class="dal-pane__tools">
        <StatusChip :status="rental.status" />
        <v-btn
          :icon="favorite ? 'mdi-heart' : 'mdi-heart-outline'"
          :color="favorite ? 'error' : undefined"
          size="small"
          variant="text"
          :aria-pressed="favorite"
          :aria-label="favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'"
          :title="favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'"
          @click="emit('favorite')"
        />
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
      <div class="dal-pane__label">الإيجار</div>
      <div class="dal-pane__price-value">
        <span class="money">{{ formatMoney(rental.rent_price) }}</span> د.ع
        <span class="dal-pane__period"
          >/
          {{
            RENT_PERIOD_LABELS[rental.rent_period] ?? rental.rent_period
          }}</span
        >
        <v-chip
          v-if="rental.is_negotiable"
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
        v-if="rental.owner_person_id && can('people.read')"
        :to="`/clients/${rental.owner_person_id}`"
        class="record-link dal-pane__strong"
        >{{ rental.owner_name }}</router-link
      >
      <div v-else class="dal-pane__strong">{{ rental.owner_name }}</div>
      <PhoneLink :phone="rental.owner_phone" :name="rental.owner_name" />
    </div>

    <div v-if="location" class="dal-pane__section">
      <div class="dal-pane__label">الموقع</div>
      <div>{{ location }}</div>
      <div v-if="rental.address_details" class="dal-pane__muted">
        {{ rental.address_details }}
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
      <v-btn color="primary" block @click="emit('open')"
        >فتح التفاصيل الكاملة</v-btn
      >
      <v-btn
        v-if="can('rentals.followups.create')"
        variant="tonal"
        block
        prepend-icon="mdi-phone-plus-outline"
        @click="emit('followup')"
        >تسجيل متابعة</v-btn
      >
      <RentalExportMenu v-if="can('rentals.export')" :rental="rental" />
      <div class="dal-pane__row">
        <v-btn
          v-if="can('rentals.update')"
          variant="tonal"
          prepend-icon="mdi-pencil-outline"
          @click="emit('edit')"
          >تعديل</v-btn
        >
        <v-btn
          v-if="rental.status === 'archived' && can('rentals.restore')"
          variant="text"
          prepend-icon="mdi-archive-arrow-up-outline"
          @click="emit('restore')"
          >إرجاع</v-btn
        >
        <v-btn
          v-else-if="rental.status !== 'archived' && can('rentals.archive')"
          variant="text"
          prepend-icon="mdi-archive-arrow-down-outline"
          @click="emit('archive')"
          >أرشفة</v-btn
        >
        <v-spacer />
        <v-btn
          v-if="can('rentals.delete')"
          variant="text"
          color="error"
          icon="mdi-delete-outline"
          aria-label="حذف العرض الإيجاري"
          title="حذف"
          @click="emit('delete')"
        />
      </div>
    </div>
  </div>
</template>
