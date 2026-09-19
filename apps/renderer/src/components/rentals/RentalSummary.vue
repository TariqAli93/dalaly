<script setup lang="ts">
import { computed } from "vue";
import { formatMoney } from "../../utils/format";
import { usePermissions } from "../../composables/usePermissions";
import StatusChip from "../shared/StatusChip.vue";
import type { RentalRecord } from "../../types";

const props = defineProps<{ rental: RentalRecord; favorite?: boolean }>();
const emit = defineEmits<{
  open: [];
  edit: [];
  archive: [];
  restore: [];
  delete: [];
  favorite: [];
  close: [];
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
const phoneDigits = computed(() => props.rental.owner_phone.replace(/\D/g, ""));
const location = computed(() =>
  [props.rental.governorate, props.rental.district, props.rental.neighborhood]
    .filter(Boolean)
    .join(" · "),
);
</script>

<template>
  <div class="ps">
    <div class="ps__head">
      <div class="min-w-0">
        <div class="ps__code">{{ rental.name || `rentals ${rental.code}` }}</div>
        <div class="ps__type money">{{ rental.code }}</div>
        <div class="ps__type">{{ typeLabel[rental.property_type] ?? rental.property_type }}</div>
      </div>
      <StatusChip :status="rental.status" />
      <v-btn
        :icon="favorite ? 'mdi-heart' : 'mdi-heart-outline'"
        :color="favorite ? 'error' : undefined"
        variant="text"
        title="المفضلة"
        @click="emit('favorite')"
      />
      <v-btn icon="mdi-close" size="x-small" variant="text" aria-label="إغلاق التفاصيل" @click="emit('close')" />
    </div>

    <v-divider />

    <div class="ps__price">
      <div class="ps__price-label">سعر الإيجار</div>
      <div class="ps__price-value">
        <span class="money">{{ formatMoney(rental.rent_price) }}</span> دينار
        <span class="ps__period">/ {{ periodLabel[rental.rent_period] ?? rental.rent_period }}</span>
        <v-chip v-if="rental.is_negotiable" size="x-small" variant="tonal" label>
          قابل للتفاوض
        </v-chip>
      </div>
    </div>

    <div class="ps__section">
      <div class="ps__label">المالك</div>
      <div class="ps__owner">{{ rental.owner_name }}</div>
      <div class="ps__phone">
        <span class="money">{{ rental.owner_phone }}</span>
        <a v-if="phoneDigits" :href="`tel:${phoneDigits}`" class="ps__call" title="اتصال">
          <v-icon icon="mdi-phone" size="16" />
        </a>
        <a v-if="phoneDigits" :href="`https://wa.me/${phoneDigits}`" target="_blank" rel="noopener" class="ps__call" title="واتساب">
          <v-icon icon="mdi-whatsapp" size="16" />
        </a>
      </div>
    </div>

    <div v-if="location" class="ps__section">
      <div class="ps__label">الموقع</div>
      <div>{{ location }}</div>
      <div v-if="rental.address_details" class="ps__muted">{{ rental.address_details }}</div>
    </div>

    <div class="ps__grid">
      <div class="ps__cell"><div class="ps__label">المساحة</div><div>{{ rental.area_value }} {{ rental.area_unit }}</div></div>
      <div class="ps__cell"><div class="ps__label">الغرف</div><div>{{ rental.rooms_count ?? "—" }}</div></div>
      <div class="ps__cell"><div class="ps__label">الحمامات</div><div>{{ rental.bathrooms_count ?? "—" }}</div></div>
      <div class="ps__cell"><div class="ps__label">الطوابق</div><div>{{ rental.floors_count ?? "—" }}</div></div>
    </div>

    <v-divider />

    <div class="ps__actions">
      <v-btn color="primary" block @click="emit('open')">فتح التفاصيل الكاملة</v-btn>
      <div class="ps__actions-row">
        <v-btn v-if="can('rentals.update')" variant="tonal" prepend-icon="mdi-pencil" @click="emit('edit')">تعديل</v-btn>
        <v-btn v-if="rental.status === 'archived' && can('rentals.restore')" variant="text" color="success" prepend-icon="mdi-archive-arrow-up-outline" @click="emit('restore')">إرجاع</v-btn>
        <v-btn v-else-if="rental.status !== 'archived' && can('rentals.archive')" variant="text" prepend-icon="mdi-archive-arrow-down-outline" @click="emit('archive')">أرشفة</v-btn>
        <v-spacer />
        <v-btn v-if="can('rentals.delete')" variant="text" color="error" icon="mdi-delete-outline" aria-label="حذف" title="حذف" @click="emit('delete')" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ps { padding: 10px 12px 16px; }
.ps__head { display: flex; align-items: center; gap: 6px; padding-bottom: 8px; }
.ps__code { font-size: 15px; font-weight: 700; }
.ps__type { font-size: 12px; color: rgba(var(--v-theme-on-surface), 0.6); }
.ps__price { padding: 10px 2px; }
.ps__price-label, .ps__label { font-size: 11.5px; color: rgba(var(--v-theme-on-surface), 0.6); margin-bottom: 2px; }
.ps__price-value { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ps__period { font-size: 13px; font-weight: 500; color: rgba(var(--v-theme-on-surface), 0.65); }
.ps__section { padding: 8px 2px; border-top: 1px solid var(--dal-stroke); }
.ps__owner { font-weight: 600; }
.ps__phone { display: flex; align-items: center; gap: 8px; }
.ps__call { display: inline-flex; color: rgb(var(--v-theme-primary)); text-decoration: none; }
.ps__muted { font-size: 12px; color: rgba(var(--v-theme-on-surface), 0.6); }
.ps__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; padding: 10px 2px; border-top: 1px solid var(--dal-stroke); }
.ps__cell { min-width: 0; }
.ps__actions { padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.ps__actions-row { display: flex; align-items: center; gap: 6px; }
</style>
