<script setup lang="ts">
import type { RentalRecord } from "../../types";
import RentalImages from "./RentalImages.vue";
import RentalFollowupsTab from "./RentalFollowupsTab.vue";
const props = defineProps<{
  modelValue: boolean;
  rental: RentalRecord | null;
  canManage?: boolean;
  favorite?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [boolean];
  edit: [RentalRecord];
  archive: [RentalRecord];
  restore: [RentalRecord];
  delete: [RentalRecord];
  favorite: [RentalRecord];
}>();
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
function money(value: string | number) {
  return Number(value).toLocaleString("ar-IQ");
}
</script>
<template>
  <v-dialog
    :model-value="modelValue"
    max-width="900"
    @update:model-value="emit('update:modelValue', $event)"
    ><v-card v-if="rental"
      ><v-card-title class="d-flex align-center"
        ><span
          >{{ rental.name || `rentals ${rental.code}` }} · {{ rental.code }} ·
          {{ typeLabel[rental.property_type] }}</span
        ><v-spacer /><v-btn
          :icon="favorite ? 'mdi-heart' : 'mdi-heart-outline'"
          :color="favorite ? 'error' : undefined"
          variant="text"
          @click="emit('favorite', rental)" /><v-btn
          icon="mdi-close"
          variant="text"
          @click="emit('update:modelValue', false)" /></v-card-title
      ><v-card-text
        ><div class="rental-detail-grid">
          <div>
            <div class="detail-label">سعر الإيجار</div>
            <div class="detail-value">
              {{ money(rental.rent_price) }} دينار /
              {{ periodLabel[rental.rent_period] }}
            </div>
          </div>
          <div>
            <div class="detail-label">المساحة</div>
            <div class="detail-value">
              {{ rental.area_value }} {{ rental.area_unit }}
            </div>
          </div>
          <div>
            <div class="detail-label">الغرف / الحمامات</div>
            <div class="detail-value">
              {{ rental.rooms_count ?? "-" }} /
              {{ rental.bathrooms_count ?? "-" }}
            </div>
          </div>
          <div>
            <div class="detail-label">الموقع</div>
            <div class="detail-value">
              {{
                [rental.governorate, rental.district, rental.neighborhood]
                  .filter(Boolean)
                  .join(" · ") || "-"
              }}
            </div>
          </div>
          <div>
            <div class="detail-label">المالك</div>
            <div class="detail-value">
              {{ rental.owner_name }} · {{ rental.owner_phone }}
            </div>
          </div>
          <div>
            <div class="detail-label">التفاوض</div>
            <div class="detail-value">
              {{ rental.is_negotiable ? "قابل للتفاوض" : "غير قابل للتفاوض" }}
            </div>
          </div>
        </div>
        <div
          v-if="rental.address_details || rental.other_details || rental.notes"
          class="mt-4"
        >
          <div v-if="rental.address_details">{{ rental.address_details }}</div>
          <div v-if="rental.other_details">{{ rental.other_details }}</div>
          <div v-if="rental.notes">{{ rental.notes }}</div>
        </div>
        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">صور الإيجار</div>

        <v-divider class="my-4" />
        <div class="text-subtitle-2 mb-2">المتابعات</div>
        <RentalFollowupsTab :rental-id="rental.id" /></v-card-text
      ><v-card-actions
        ><v-btn
          v-if="canManage"
          color="primary"
          prepend-icon="mdi-pencil"
          @click="emit('edit', rental)"
          >تعديل</v-btn
        ><v-btn
          v-if="canManage && rental.status !== 'archived'"
          color="warning"
          variant="tonal"
          @click="emit('archive', rental)"
          >أرشفة</v-btn
        ><v-btn
          v-if="canManage && rental.status === 'archived'"
          color="success"
          variant="tonal"
          @click="emit('restore', rental)"
          >إرجاع</v-btn
        ><v-btn
          v-if="canManage"
          color="error"
          variant="text"
          @click="emit('delete', rental)"
          >حذف</v-btn
        ></v-card-actions
      ></v-card
    ></v-dialog
  >
</template>
<style scoped>
.rental-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
}
.detail-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 12px;
}
.detail-value {
  font-weight: 600;
  margin-top: 3px;
}
</style>
